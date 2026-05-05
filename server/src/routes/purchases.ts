import type { Express, Request, Response } from "express";
import { Types, isValidObjectId } from "mongoose";

import { ExpenseModel, ProductModel, PurchaseModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

function sumPurchaseItemsTotal(items: Array<{ total?: number }> | undefined): number {
  return (items || []).reduce((s, it) => s + (Number(it.total) || 0), 0);
}

async function syncLinkedPurchaseExpense(
  businessId: string,
  purchase: { _id: Types.ObjectId; totalAmount: number; status: string }
) {
  if (purchase.status !== "APROVADA" && purchase.status !== "RECEBIDA") {
    return;
  }
  const expenseUpdate = await ExpenseModel.updateOne(
    {
      businessId,
      purchaseId: purchase._id,
      category: "COMPRAS",
      status: "PENDENTE",
    },
    { $set: { amount: purchase.totalAmount } }
  );
  if (expenseUpdate.matchedCount === 0) {
    const ocSuffix = String(purchase._id).slice(-6).toUpperCase();
    await ExpenseModel.updateOne(
      {
        businessId,
        category: "COMPRAS",
        status: "PENDENTE",
        description: new RegExp(`^OC-${ocSuffix}`),
      },
      { $set: { amount: purchase.totalAmount } }
    );
  }
}

export function registerPurchaseRoutes(
  app: Express,
  deps: {
    applyPurchaseStock: (businessId: string, items: any[]) => Promise<void>;
    notifySystemWhatsApp: (message: string) => Promise<any>;
  }
) {
  app.get("/api/purchases", async (req: Request, res: Response) => {
    const includeCancelled = String(req.query.includeCancelled || "").toLowerCase() === "true";
    const filter = {
      ...getBusinessFilter(req),
      ...(includeCancelled ? {} : { status: { $ne: "CANCELADA" } }),
    };
    const purchases = await PurchaseModel.find(filter).sort({ createdAt: -1 });
    res.json(purchases);
  });

  app.post("/api/purchases", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { supplier, items, extraExpenses: extraRaw, extraExpensesNote: noteRaw } = req.body as {
      supplier: string;
      items: Array<{ product?: string; description: string; quantity: number; cost: number }>;
      extraExpenses?: number;
      extraExpensesNote?: string;
    };

    if (!supplier || !items?.length) {
      return res.status(400).json({ message: "Fornecedor e itens são obrigatórios." });
    }

    const normalizedItems: Array<{
      product?: Types.ObjectId;
      description: string;
      quantity: number;
      cost: number;
      total: number;
    }> = [];

    for (const item of items) {
      normalizedItems.push({
        product: item.product && isValidObjectId(item.product) ? new Types.ObjectId(item.product) : undefined,
        description: item.description,
        quantity: item.quantity,
        cost: item.cost,
        total: item.quantity * item.cost,
      });
    }

    const itemsSum = normalizedItems.reduce((sum, item) => sum + item.total, 0);
    const extraExpenses = Number(extraRaw ?? 0);
    if (!Number.isFinite(extraExpenses) || extraExpenses < 0) {
      return res.status(400).json({ message: "Despesas extras inválidas." });
    }
    const extraExpensesNote = String(noteRaw ?? "")
      .trim()
      .slice(0, 500);
    const totalAmount = itemsSum + extraExpenses;

    // Toda ordem de compra nasce como AGUARDANDO_APROVACAO.
    // Estoque só é aplicado quando marcada como RECEBIDA.
    // Despesa financeira só é gerada após a aprovação.
    const purchase = await PurchaseModel.create({
      businessId,
      supplier,
      items: normalizedItems,
      status: "AGUARDANDO_APROVACAO",
      approval: {
        required: true,
        status: "PENDENTE",
        requestedBy: "Sistema",
        requestedAt: new Date(),
      },
      stockApplied: false,
      extraExpenses,
      extraExpensesNote,
      totalAmount,
    });

    await deps.notifySystemWhatsApp(
      [
        "Nova ordem de compra aguardando aprovação",
        `ERP: ${businessId}`,
        `Fornecedor: ${supplier}`,
        `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalAmount)}`,
        `OC: ${String(purchase._id).slice(-6).toUpperCase()}`,
      ].join("\n")
    );

    res.status(201).json(purchase);
  });

  app.patch("/api/purchases/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const payload = req.body as Partial<{
      status:
        | "ABERTA"
        | "AGUARDANDO_APROVACAO"
        | "APROVADA"
        | "RECEBIDA"
        | "REJEITADA"
        | "CANCELADA";
      supplier: string;
      items: Array<{ product?: string; description: string; quantity: number; cost: number }>;
      extraExpenses: number;
      extraExpensesNote: string;
    }>;

    const purchase = await PurchaseModel.findOne({ _id: id, businessId });
    if (!purchase) {
      return res.status(404).json({ message: "Compra não encontrada." });
    }
    if (purchase.status === "CANCELADA") {
      return res.status(400).json({ message: "Compra cancelada não pode ser alterada." });
    }

    const hasItems = Array.isArray(payload.items);
    const nextStatus = payload.status;

    if (hasItems && nextStatus === "CANCELADA") {
      return res.status(400).json({
        message:
          "Não envie itens ao cancelar a compra. Altere os itens em uma requisição separada ou remova o campo items.",
      });
    }

    if (hasItems) {
      if (!payload.items!.length) {
        return res.status(400).json({ message: "Informe ao menos um item da compra." });
      }

      const normalizedItems: Array<{
        product?: Types.ObjectId;
        description: string;
        quantity: number;
        cost: number;
        total: number;
      }> = [];

      for (const item of payload.items!) {
        if (!item.description?.trim() || item.quantity <= 0 || !Number.isFinite(item.cost) || item.cost < 0) {
          return res.status(400).json({ message: "Itens da compra inválidos." });
        }

        normalizedItems.push({
          product: item.product && isValidObjectId(item.product) ? new Types.ObjectId(item.product) : undefined,
          description: item.description,
          quantity: item.quantity,
          cost: item.cost,
          total: item.quantity * item.cost,
        });
      }

      // Se o estoque já foi aplicado para esta compra, precisamos reverter os itens antigos
      // e aplicar novamente com base nos novos itens.
      if (purchase.stockApplied) {
        for (const item of purchase.items || []) {
          if (!item.product) continue;
          await ProductModel.updateOne(
            { _id: item.product, businessId },
            { $inc: { stock: -item.quantity } }
          );
        }

        await deps.applyPurchaseStock(businessId, normalizedItems);
        purchase.stockApplied = true;
      }

      purchase.set("items", normalizedItems);

      const itemsSum = normalizedItems.reduce((sum, item) => sum + item.total, 0);
      let extra = Number(purchase.extraExpenses ?? 0);
      if (payload.extraExpenses !== undefined) {
        extra = Number(payload.extraExpenses);
        if (!Number.isFinite(extra) || extra < 0) {
          return res.status(400).json({ message: "Despesas extras inválidas." });
        }
        purchase.extraExpenses = extra;
      }
      if (payload.extraExpensesNote !== undefined) {
        purchase.extraExpensesNote = String(payload.extraExpensesNote || "")
          .trim()
          .slice(0, 500);
      }
      purchase.totalAmount = itemsSum + (Number(purchase.extraExpenses) || 0);

      await syncLinkedPurchaseExpense(businessId, purchase);
    }

    if (!hasItems && (payload.extraExpenses !== undefined || payload.extraExpensesNote !== undefined)) {
      if (payload.extraExpenses !== undefined) {
        const ex = Number(payload.extraExpenses);
        if (!Number.isFinite(ex) || ex < 0) {
          return res.status(400).json({ message: "Despesas extras inválidas." });
        }
        purchase.extraExpenses = ex;
      }
      if (payload.extraExpensesNote !== undefined) {
        purchase.extraExpensesNote = String(payload.extraExpensesNote || "")
          .trim()
          .slice(0, 500);
      }
      purchase.totalAmount = sumPurchaseItemsTotal(purchase.items as Array<{ total?: number }>) + (Number(purchase.extraExpenses) || 0);
      await syncLinkedPurchaseExpense(businessId, purchase);
    }

    if (payload.supplier !== undefined) {
      if (!payload.supplier.trim()) {
        return res.status(400).json({ message: "Fornecedor não pode ser vazio." });
      }
      purchase.supplier = payload.supplier.trim();
    }

    if (nextStatus === "CANCELADA") {
      if (purchase.stockApplied) {
        for (const item of purchase.items || []) {
          if (!item.product) continue;
          await ProductModel.updateOne(
            { _id: item.product, businessId },
            { $inc: { stock: -item.quantity } }
          );
        }
        purchase.stockApplied = false;
      }
      purchase.status = "CANCELADA";
      if (purchase.approval) {
        purchase.approval.status = "REJEITADA";
      }
    } else if (nextStatus === "RECEBIDA") {
      // Ao marcar como recebida, aplica o estoque uma única vez.
      // O lock abaixo evita duplicidade em cliques/requisições concorrentes.
      let shouldApplyStock = false;
      if (!purchase.stockApplied) {
        const lock = await PurchaseModel.updateOne(
          { _id: purchase._id, businessId, stockApplied: false },
          { $set: { stockApplied: true } }
        );
        shouldApplyStock = lock.modifiedCount === 1;
      }
      if (shouldApplyStock) {
        try {
          await deps.applyPurchaseStock(
            businessId,
            purchase.items as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>
          );
          purchase.stockApplied = true;
        } catch (error) {
          // rollback do lock caso a aplicação de estoque falhe
          await PurchaseModel.updateOne(
            { _id: purchase._id, businessId },
            { $set: { stockApplied: false } }
          );
          purchase.stockApplied = false;
          throw error;
        }
      } else {
        purchase.stockApplied = true;
      }
      purchase.status = "RECEBIDA";
    } else if (
      nextStatus === "ABERTA" ||
      nextStatus === "AGUARDANDO_APROVACAO" ||
      nextStatus === "APROVADA" ||
      nextStatus === "REJEITADA"
    ) {
      purchase.status = nextStatus;
    }

    await purchase.save();
    res.json(purchase);
  });

  app.delete("/api/purchases/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const purchase = await PurchaseModel.findOne({ _id: id, businessId });
    if (!purchase) {
      return res.status(404).json({ message: "Compra não encontrada." });
    }
    if (purchase.status !== "CANCELADA") {
      if (purchase.stockApplied) {
        for (const item of purchase.items || []) {
          if (!item.product) continue;
          await ProductModel.updateOne(
            { _id: item.product, businessId },
            { $inc: { stock: -item.quantity } }
          );
        }
        purchase.stockApplied = false;
      }
      purchase.status = "CANCELADA";
      if (purchase.approval) {
        purchase.approval.status = "REJEITADA";
      }
      await purchase.save();
    }
    res.json({ deleted: true });
  });
}

