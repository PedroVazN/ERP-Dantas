import type { Express, Request, Response } from "express";
import { Types, isValidObjectId } from "mongoose";
import * as XLSX from "xlsx";

import { ExpenseModel, ProductModel, PurchaseModel, SupplierModel } from "../models";
import { upload } from "../app";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

type PurchaseImportPreviewItem = {
  line: number;
  productSku: string;
  productId: string;
  productName: string;
  description: string;
  quantity: number;
  cost: number;
  total: number;
  errors: string[];
  valid: boolean;
};

type PurchaseImportPreview = {
  supplierName: string;
  supplierId: string;
  extraExpenses: number;
  extraExpensesNote: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  items: PurchaseImportPreviewItem[];
  headerErrors: string[];
  itemsSubtotal: number;
  grandTotal: number;
};

const PURCHASE_IMPORT_COLUMNS = [
  "fornecedor_nome",
  "produto_sku",
  "quantidade",
  "custo_unitario",
  "despesas_extras",
  "obs_despesas",
];

function normalizeHeader(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim();
  if (!raw) return NaN;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

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
    applyPurchaseStock: (
      businessId: string,
      items: any[],
      extraExpenses?: number
    ) => Promise<void>;
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

        await deps.applyPurchaseStock(
          businessId,
          normalizedItems,
          Number(purchase.extraExpenses) || 0
        );
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
            purchase.items as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>,
            Number(purchase.extraExpenses) || 0
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

  app.patch("/api/purchases/:id/workflow", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const { approval, received, reviewedBy, reason } = req.body as {
      approval?: "PENDENTE" | "APROVADA" | "REJEITADA";
      received?: boolean;
      reviewedBy?: string;
      reason?: string;
    };

    if (approval === undefined && received === undefined) {
      return res.status(400).json({
        message: "Informe ao menos um campo (approval ou received).",
      });
    }

    if (approval !== undefined && !["PENDENTE", "APROVADA", "REJEITADA"].includes(approval)) {
      return res.status(400).json({ message: "Status de aprovação inválido." });
    }

    const purchase = await PurchaseModel.findOne({ _id: id, businessId });
    if (!purchase) {
      return res.status(404).json({ message: "Compra não encontrada." });
    }
    if (purchase.status === "CANCELADA") {
      return res.status(400).json({ message: "Compra cancelada não pode ser alterada." });
    }

    const reviewer = (reviewedBy || "Gestor").toString().trim() || "Gestor";
    const reasonText = (reason || "").toString().trim();

    // Helpers locais para reverter / aplicar estoque desta ordem.
    async function revertStock(): Promise<void> {
      if (!purchase!.stockApplied) return;
      for (const item of purchase!.items || []) {
        if (!item.product) continue;
        await ProductModel.updateOne(
          { _id: item.product, businessId },
          { $inc: { stock: -item.quantity } }
        );
      }
      purchase!.stockApplied = false;
    }

    async function applyStock(): Promise<void> {
      if (purchase!.stockApplied) return;
      await deps.applyPurchaseStock(
        businessId,
        purchase!.items as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>,
        Number(purchase!.extraExpenses) || 0
      );
      purchase!.stockApplied = true;
    }

    // 1) Mudança de aprovação
    if (approval !== undefined) {
      const currentApproval = (purchase.approval?.status as "PENDENTE" | "APROVADA" | "REJEITADA") || "PENDENTE";

      if (approval !== currentApproval) {
        // Saindo de APROVADA -> reverte estoque (se aplicado) e remove despesa pendente vinculada.
        if (currentApproval === "APROVADA" && approval !== "APROVADA") {
          await revertStock();
          await ExpenseModel.deleteOne({
            businessId,
            purchaseId: purchase._id,
            category: "COMPRAS",
            status: "PENDENTE",
          });
        }

        // Entrando em APROVADA -> garante despesa pendente vinculada.
        if (approval === "APROVADA" && currentApproval !== "APROVADA") {
          const existing = await ExpenseModel.findOne({
            businessId,
            purchaseId: purchase._id,
          });
          if (!existing) {
            await ExpenseModel.create({
              businessId,
              purchaseId: purchase._id,
              description: `OC-${String(purchase._id).slice(-6).toUpperCase()} - ${purchase.supplier}`,
              category: "COMPRAS",
              amount: purchase.totalAmount,
              dueDate: new Date(),
              status: "PENDENTE",
              approval: {
                required: false,
                status: "APROVADA",
                requestedBy: "Sistema",
                requestedAt: new Date(),
                reviewedBy: reviewer,
                reviewedAt: new Date(),
                reason: "Despesa gerada automaticamente após aprovação da ordem de compra.",
              },
            });
          }
        }

        purchase.approval = {
          required: true,
          status: approval,
          requestedBy: purchase.approval?.requestedBy || "Sistema",
          requestedAt:
            purchase.approval?.requestedAt || purchase.createdAt || new Date(),
          reviewedBy: reviewer,
          reviewedAt: new Date(),
          reason:
            reasonText ||
            (approval === "APROVADA"
              ? "Aprovação registrada no fluxo de compras."
              : approval === "REJEITADA"
              ? "Rejeição registrada no fluxo de compras."
              : "Aprovação revertida para pendente."),
        };
      }
    }

    // 2) Mudança de recebimento
    if (received !== undefined) {
      const finalApproval = (purchase.approval?.status as "PENDENTE" | "APROVADA" | "REJEITADA") || "PENDENTE";

      if (received) {
        if (finalApproval !== "APROVADA") {
          return res.status(400).json({
            message: "Aprove a ordem antes de marcar como recebida.",
          });
        }
        await applyStock();
      } else {
        await revertStock();
      }
    }

    // 3) Recalcula status da ordem com base em aprovação + recebimento
    const finalApproval = (purchase.approval?.status as "PENDENTE" | "APROVADA" | "REJEITADA") || "PENDENTE";
    if (finalApproval === "REJEITADA") {
      purchase.status = "REJEITADA";
    } else if (finalApproval === "PENDENTE") {
      purchase.status = "AGUARDANDO_APROVACAO";
    } else {
      purchase.status = purchase.stockApplied ? "RECEBIDA" : "APROVADA";
    }

    await purchase.save();

    await deps.notifySystemWhatsApp(
      [
        "Workflow de compra atualizado",
        `ERP: ${businessId}`,
        `OC: ${String(purchase._id).slice(-6).toUpperCase()}`,
        `Aprovação: ${purchase.approval?.status || "-"}`,
        `Status: ${purchase.status}`,
        `Revisor: ${reviewer}`,
      ].join("\n")
    );

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

  // -------------------------------------------------------------------------
  // Importação de ordem de compra via planilha Excel
  // -------------------------------------------------------------------------

  app.get("/api/purchases/import/template", (_req: Request, res: Response) => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      PURCHASE_IMPORT_COLUMNS,
      [
        "Fornecedor Exemplo Ltda",
        "SAB-LAV-90",
        100,
        6.2,
        45.5,
        "Frete + taxa de embalagem",
      ],
      ["Fornecedor Exemplo Ltda", "SAB-OLI-90", 50, 5.4, "", ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ordem_compra");
    const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="modelo-ordem-compra.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(fileBuffer);
  });

  app.post(
    "/api/purchases/import/preview",
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (blockWriteInGeneralScope(req, res)) {
        return;
      }
      const { businessId } = getScopeContext(req);
      const file = (req as unknown as { file?: { buffer?: Buffer } }).file;
      if (!file?.buffer) {
        return res.status(400).json({ message: "Anexe um arquivo Excel (.xlsx)." });
      }

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(file.buffer, { type: "buffer" });
      } catch {
        return res
          .status(400)
          .json({ message: "Arquivo inválido. Use uma planilha .xlsx válida." });
      }

      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        return res.status(400).json({ message: "Planilha sem abas." });
      }

      const sheet = workbook.Sheets[firstSheet];
      const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      if (!matrix.length) {
        return res.status(400).json({ message: "Planilha vazia." });
      }

      const header = (matrix[0] || []).map(normalizeHeader);
      const missingColumns = ["fornecedor_nome", "produto_sku", "quantidade", "custo_unitario"].filter(
        (col) => !header.includes(col)
      );
      if (missingColumns.length > 0) {
        return res.status(400).json({
          message: `Colunas obrigatórias ausentes: ${missingColumns.join(", ")}`,
          templateColumns: PURCHASE_IMPORT_COLUMNS,
        });
      }

      const rawRows = matrix
        .slice(1)
        .map((row) => {
          const mapped: Record<string, unknown> = {};
          header.forEach((h, idx) => {
            if (h) mapped[h] = row[idx];
          });
          return mapped;
        })
        .filter((row) =>
          Object.values(row).some((value) => String(value ?? "").trim() !== "")
        );

      const headerErrors: string[] = [];
      const supplierNameRaw = String(rawRows[0]?.fornecedor_nome ?? "").trim();
      if (!supplierNameRaw) {
        headerErrors.push("Informe o fornecedor na primeira linha (coluna fornecedor_nome).");
      }

      // Outras linhas com fornecedor diferente são reportadas como erro.
      const inconsistentSupplier = rawRows.findIndex((row, idx) => {
        if (idx === 0) return false;
        const name = String(row.fornecedor_nome ?? "").trim();
        return name !== "" && name !== supplierNameRaw;
      });
      if (inconsistentSupplier > 0) {
        headerErrors.push(
          `Cada planilha deve conter apenas uma ordem de compra. Fornecedor divergente na linha ${
            inconsistentSupplier + 2
          }.`
        );
      }

      const extraExpensesParsed = parseNumber(rawRows[0]?.despesas_extras);
      const extraExpenses =
        Number.isFinite(extraExpensesParsed) && extraExpensesParsed >= 0
          ? extraExpensesParsed
          : 0;
      if (rawRows[0]?.despesas_extras !== undefined &&
          String(rawRows[0]?.despesas_extras ?? "").trim() !== "" &&
          (!Number.isFinite(extraExpensesParsed) || extraExpensesParsed < 0)) {
        headerErrors.push("Despesas extras inválidas na primeira linha.");
      }
      const extraExpensesNote = String(rawRows[0]?.obs_despesas ?? "").trim().slice(0, 500);

      // Busca fornecedor pelo nome.
      let matchedSupplier: { _id: string; name: string } | null = null;
      if (supplierNameRaw) {
        const supplier = await SupplierModel.findOne({
          businessId,
          name: { $regex: `^${supplierNameRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
          status: "ATIVO",
        })
          .select("_id name")
          .lean();
        if (supplier) {
          matchedSupplier = { _id: String(supplier._id), name: String(supplier.name) };
        } else {
          headerErrors.push(`Fornecedor "${supplierNameRaw}" não encontrado (ou inativo).`);
        }
      }

      // Busca produtos por SKU.
      const skusInPlanilha = rawRows
        .map((row) => String(row.produto_sku ?? "").trim())
        .filter((sku) => sku.length > 0);
      const products = skusInPlanilha.length
        ? await ProductModel.find({
            businessId,
            sku: { $in: skusInPlanilha },
            active: true,
          })
            .select("_id sku name supplier")
            .lean()
        : [];
      const bySku = new Map<string, { _id: string; sku: string; name: string; supplier?: string }>();
      for (const product of products) {
        const sku = String(product.sku || "").trim().toLowerCase();
        if (!sku) continue;
        bySku.set(sku, {
          _id: String(product._id),
          sku: String(product.sku || ""),
          name: String(product.name || ""),
          supplier: product.supplier ? String(product.supplier) : undefined,
        });
      }

      const items: PurchaseImportPreviewItem[] = rawRows.map((row, idx) => {
        const line = idx + 2;
        const skuRaw = String(row.produto_sku ?? "").trim();
        const sku = skuRaw.toLowerCase();
        const quantity = parseNumber(row.quantidade);
        const cost = parseNumber(row.custo_unitario);
        const errors: string[] = [];

        if (!skuRaw) errors.push("Coluna produto_sku é obrigatória.");
        if (!Number.isFinite(quantity) || quantity <= 0)
          errors.push("Quantidade inválida.");
        if (!Number.isFinite(cost) || cost < 0)
          errors.push("Custo unitário inválido.");

        const matched = sku ? bySku.get(sku) : undefined;
        if (skuRaw && !matched) {
          errors.push("Produto não encontrado pelo SKU.");
        } else if (
          matched &&
          matchedSupplier &&
          matched.supplier &&
          matched.supplier !== matchedSupplier._id
        ) {
          errors.push("Produto pertence a outro fornecedor.");
        }

        const qty = Number.isFinite(quantity) ? quantity : 0;
        const unit = Number.isFinite(cost) ? cost : 0;
        return {
          line,
          productSku: skuRaw,
          productId: matched?._id || "",
          productName: matched?.name || "",
          description: matched?.name || skuRaw,
          quantity: qty,
          cost: unit,
          total: qty * unit,
          errors,
          valid: errors.length === 0,
        };
      });

      const validRows = items.filter((row) => row.valid).length;
      const itemsSubtotal = items.reduce((sum, row) => sum + row.total, 0);
      const grandTotal = itemsSubtotal + extraExpenses;

      const response: PurchaseImportPreview = {
        supplierName: matchedSupplier?.name || supplierNameRaw,
        supplierId: matchedSupplier?._id || "",
        extraExpenses,
        extraExpensesNote,
        totalRows: items.length,
        validRows,
        invalidRows: items.length - validRows,
        items,
        headerErrors,
        itemsSubtotal,
        grandTotal,
      };
      res.json(response);
    }
  );

  app.post(
    "/api/purchases/import/commit",
    async (req: Request, res: Response) => {
      if (blockWriteInGeneralScope(req, res)) {
        return;
      }
      const { businessId } = getScopeContext(req);
      const payload = req.body as Partial<{
        supplierId: string;
        supplierName: string;
        extraExpenses: number;
        extraExpensesNote: string;
        items: Array<{
          productId?: string;
          description?: string;
          quantity: number;
          cost: number;
        }>;
      }>;

      const supplierName = (payload.supplierName || "").trim();
      if (!supplierName) {
        return res
          .status(400)
          .json({ message: "Fornecedor não informado para a importação." });
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) {
        return res.status(400).json({ message: "Nenhum item válido para importar." });
      }

      const normalizedItems: Array<{
        product?: Types.ObjectId;
        description: string;
        quantity: number;
        cost: number;
        total: number;
      }> = [];

      for (const item of items) {
        const quantity = Number(item.quantity);
        const cost = Number(item.cost);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return res.status(400).json({ message: "Item com quantidade inválida." });
        }
        if (!Number.isFinite(cost) || cost < 0) {
          return res.status(400).json({ message: "Item com custo inválido." });
        }
        normalizedItems.push({
          product:
            item.productId && isValidObjectId(item.productId)
              ? new Types.ObjectId(item.productId)
              : undefined,
          description: (item.description || "").trim() || "Item importado",
          quantity,
          cost,
          total: quantity * cost,
        });
      }

      const itemsSum = normalizedItems.reduce((sum, item) => sum + item.total, 0);
      const extraExpenses = Math.max(0, Number(payload.extraExpenses) || 0);
      const extraExpensesNote = String(payload.extraExpensesNote || "")
        .trim()
        .slice(0, 500);
      const totalAmount = itemsSum + extraExpenses;

      const purchase = await PurchaseModel.create({
        businessId,
        supplier: supplierName,
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
          "Nova ordem de compra (importada por planilha) aguardando aprovação",
          `ERP: ${businessId}`,
          `Fornecedor: ${supplierName}`,
          `Valor: ${new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(totalAmount)}`,
          `OC: ${String(purchase._id).slice(-6).toUpperCase()}`,
        ].join("\n")
      );

      res.status(201).json(purchase);
    }
  );
}

