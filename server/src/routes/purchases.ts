import type { Express, Request, Response } from "express";
import { Types, isValidObjectId } from "mongoose";

import { ProductModel, PurchaseModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerPurchaseRoutes(
  app: Express,
  deps: {
    purchaseApprovalThreshold: number;
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
    const { supplier, items, status } = req.body as {
      supplier: string;
      items: Array<{ product?: string; description: string; quantity: number; cost: number }>;
      status?: string;
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

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);
    const needsApproval = totalAmount >= deps.purchaseApprovalThreshold;

    if (!needsApproval) {
      await deps.applyPurchaseStock(businessId, normalizedItems);
    }

    const purchase = await PurchaseModel.create({
      businessId,
      supplier,
      items: normalizedItems,
      status: needsApproval ? "AGUARDANDO_APROVACAO" : status || "RECEBIDA",
      approval: {
        required: needsApproval,
        status: needsApproval ? "PENDENTE" : "APROVADA",
        requestedBy: "Sistema",
        requestedAt: new Date(),
      },
      stockApplied: !needsApproval,
      totalAmount,
    });

    if (needsApproval) {
      await deps.notifySystemWhatsApp(
        [
          "Atenção: nova compra aguardando aprovação",
          `ERP: ${businessId}`,
          `Fornecedor: ${supplier}`,
          `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
            totalAmount
          )}`,
          `ID: ${String(purchase._id)}`,
        ].join("\n")
      );
    }

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
    }>;

    const purchase = await PurchaseModel.findOne({ _id: id, businessId });
    if (!purchase) {
      return res.status(404).json({ message: "Compra não encontrada." });
    }
    if (purchase.status === "CANCELADA") {
      return res.status(400).json({ message: "Compra cancelada não pode ser alterada." });
    }

    const nextStatus = payload.status;

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
    } else if (
      nextStatus === "ABERTA" ||
      nextStatus === "AGUARDANDO_APROVACAO" ||
      nextStatus === "APROVADA" ||
      nextStatus === "RECEBIDA" ||
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

