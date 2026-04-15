import type { Express, Request, Response } from "express";
import { Types, isValidObjectId } from "mongoose";
import * as XLSX from "xlsx";

import { ProductModel } from "../models";
import { upload } from "../app";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

type ImportPreviewRow = {
  line: number;
  name: string;
  sku: string;
  productCode: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  supplierId: string;
  valid: boolean;
  errors: string[];
};

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

const PRODUCT_IMPORT_TEMPLATE_COLUMNS = [
  "nome",
  "sku",
  "codigo_produto",
  "descricao",
  "preco_tabela",
  "custo",
  "estoque",
  "estoque_minimo",
  "fornecedor_id",
];

function toPreviewRow(raw: Record<string, unknown>, line: number): ImportPreviewRow {
  const name = String(raw.nome || "").trim();
  const sku = String(raw.sku || "").trim();
  const productCode = String(raw.codigo_produto || "").trim();
  const description = String(raw.descricao || "").trim();
  const supplierId = String(raw.fornecedor_id || "").trim();
  const price = parseNumber(raw.preco_tabela);
  const cost = parseNumber(raw.custo);
  const stock = parseNumber(raw.estoque);
  const minStock = parseNumber(raw.estoque_minimo);
  const errors: string[] = [];

  if (!name) errors.push("Nome é obrigatório.");
  if (!sku) errors.push("SKU é obrigatório.");
  if (!Number.isFinite(price) || price < 0) errors.push("Preço de tabela inválido.");
  if (!Number.isFinite(cost) || cost < 0) errors.push("Custo inválido.");
  if (!Number.isFinite(stock) || stock < 0) errors.push("Estoque inválido.");
  if (!Number.isFinite(minStock) || minStock < 0) errors.push("Estoque mínimo inválido.");
  if (supplierId && !isValidObjectId(supplierId)) errors.push("Fornecedor ID inválido.");

  return {
    line,
    name,
    sku,
    productCode,
    description,
    price: Number.isFinite(price) ? price : 0,
    cost: Number.isFinite(cost) ? cost : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    minStock: Number.isFinite(minStock) ? minStock : 0,
    supplierId,
    valid: errors.length === 0,
    errors,
  };
}

export function registerProductRoutes(app: Express) {
  app.get("/api/products", async (req: Request, res: Response) => {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
    const filter = {
      ...getBusinessFilter(req),
      ...(includeInactive ? {} : { active: true }),
    };
    const products = await ProductModel.find(filter)
      .populate("supplier", "name")
      .sort({ createdAt: -1 });

    const payload = products.map((p) => {
      const obj = p.toObject() as Record<string, unknown>;
      const hasPhoto = Boolean(obj.photoContentType);
      // Evita mandar o buffer para o cliente.
      delete obj.photoData;
      obj.hasPhoto = hasPhoto;
      return obj;
    });
    res.json(payload);
  });

  app.get("/api/products/:id/photo", async (req: Request, res: Response) => {
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const product = await ProductModel.findOne({ _id: id, businessId })
      .select("photoContentType")
      .select("+photoData");

    if (!product || !product.photoData) {
      return res.status(404).json({ message: "Foto não encontrada." });
    }

    if (!product.photoContentType) {
      res.setHeader("Content-Type", "application/octet-stream");
    } else {
      res.setHeader("Content-Type", product.photoContentType);
    }
    // Permite que o browser leia a imagem via fetch/canvas (necessário para export PDF)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    return res.send(product.photoData);
  });

  app.post("/api/products/:id/photo", upload.single("photo"), async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const file = (req as unknown as { file?: { mimetype?: string; buffer?: Buffer } }).file;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Informe um arquivo de foto em 'photo'." });
    }

    const product = await ProductModel.findOne({ _id: id, businessId });
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }

    product.photoContentType = file.mimetype || "application/octet-stream";
    product.photoData = file.buffer;
    await product.save();

    res.json({ ok: true, hasPhoto: true });
  });

  app.post("/api/products", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const product = await ProductModel.create({ ...req.body, businessId });
    res.status(201).json(product);
  });

  app.patch("/api/products/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const payload = req.body as Partial<{
      name: string;
      sku: string;
      productCode: string;
      description: string;
      price: number;
      cost: number;
      stock: number;
      minStock: number;
      supplier: string;
      active: boolean;
    }>;

    const update: Record<string, unknown> = {};
    if (typeof payload.name === "string") update.name = payload.name.trim();
    if (typeof payload.sku === "string") update.sku = payload.sku.trim();
    if (typeof payload.productCode === "string") update.productCode = payload.productCode.trim();
    if (typeof payload.description === "string") update.description = payload.description.trim();
    if (typeof payload.price === "number" && payload.price >= 0) update.price = payload.price;
    if (typeof payload.cost === "number" && payload.cost >= 0) update.cost = payload.cost;
    if (typeof payload.stock === "number" && payload.stock >= 0) update.stock = payload.stock;
    if (typeof payload.minStock === "number" && payload.minStock >= 0) update.minStock = payload.minStock;
    if (typeof payload.supplier === "string" && isValidObjectId(payload.supplier)) {
      update.supplier = new Types.ObjectId(payload.supplier);
    }
    if (typeof payload.active === "boolean") update.active = payload.active;

    const product = await ProductModel.findOneAndUpdate(
      { _id: id, businessId },
      update,
      { returnDocument: "after" }
    ).populate("supplier", "name");

    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.json(product);
  });

  app.delete("/api/products/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const product = await ProductModel.findOneAndUpdate(
      { _id: id, businessId },
      { active: false },
      { returnDocument: "after" }
    );
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.json({ deleted: true });
  });

  app.patch("/api/products/:id/stock", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    const { stock } = req.body as { stock?: number };
    if (typeof stock !== "number" || stock < 0) {
      return res.status(400).json({ message: "Estoque inválido." });
    }

    const product = await ProductModel.findOneAndUpdate(
      { _id: id, businessId },
      { stock },
      { returnDocument: "after" }
    );
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.json(product);
  });

  app.get("/api/products/import/template", (_req: Request, res: Response) => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      PRODUCT_IMPORT_TEMPLATE_COLUMNS,
      ["Sabonete Lavanda 90g", "SAB-LAV-90", "00123", "Base vegetal", 12.9, 6.2, 100, 10, ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "produtos");
    const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="modelo-importacao-produtos.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(fileBuffer);
  });

  app.post("/api/products/import/preview", upload.single("file"), async (req: Request, res: Response) => {
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
      return res.status(400).json({ message: "Arquivo inválido. Use uma planilha .xlsx válida." });
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ message: "Planilha sem abas." });
    }

    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    if (!matrix.length) {
      return res.status(400).json({ message: "Planilha vazia." });
    }

    const header = (matrix[0] || []).map(normalizeHeader);
    const missingColumns = PRODUCT_IMPORT_TEMPLATE_COLUMNS.filter((col) => !header.includes(col));
    if (missingColumns.length > 0) {
      return res.status(400).json({
        message: `Colunas obrigatórias ausentes: ${missingColumns.join(", ")}`,
        templateColumns: PRODUCT_IMPORT_TEMPLATE_COLUMNS,
      });
    }

    const entries = matrix
      .slice(1)
      .map((row) => {
        const mapped: Record<string, unknown> = {};
        header.forEach((h, idx) => {
          if (h) mapped[h] = row[idx];
        });
        return mapped;
      })
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim() !== ""));

    const rows = entries.map((row, idx) => toPreviewRow(row, idx + 2));
    const skuCounter = new Map<string, number[]>();
    rows.forEach((row, idx) => {
      if (!row.sku) return;
      const key = row.sku.toLowerCase();
      if (!skuCounter.has(key)) skuCounter.set(key, []);
      skuCounter.get(key)!.push(idx);
    });
    skuCounter.forEach((indexes) => {
      if (indexes.length < 2) return;
      indexes.forEach((index) => {
        rows[index].errors.push("SKU duplicado na própria planilha.");
      });
    });

    const uniqueSkus = Array.from(
      new Set(rows.map((row) => row.sku.trim()).filter((sku) => sku.length > 0))
    );
    const existingProducts = await ProductModel.find({ businessId, sku: { $in: uniqueSkus } })
      .select("sku")
      .lean();
    const existingSet = new Set(existingProducts.map((product) => String(product.sku).toLowerCase()));
    rows.forEach((row) => {
      if (row.sku && existingSet.has(row.sku.toLowerCase())) {
        row.errors.push("SKU já cadastrado no sistema.");
      }
      row.valid = row.errors.length === 0;
    });

    const validCount = rows.filter((row) => row.valid).length;
    res.json({
      templateColumns: PRODUCT_IMPORT_TEMPLATE_COLUMNS,
      totalRows: rows.length,
      validRows: validCount,
      invalidRows: rows.length - validCount,
      rows,
    });
  });

  app.post("/api/products/import/commit", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const payload = req.body as { rows?: ImportPreviewRow[] };
    if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
      return res.status(400).json({ message: "Nenhuma linha para importar." });
    }

    const rows = payload.rows.filter((row) => row && row.valid);
    if (!rows.length) {
      return res.status(400).json({ message: "Nenhuma linha válida para importar." });
    }

    const uniqueSkus = Array.from(new Set(rows.map((row) => row.sku.trim())));
    const existingProducts = await ProductModel.find({ businessId, sku: { $in: uniqueSkus } })
      .select("sku")
      .lean();
    const existingSet = new Set(existingProducts.map((product) => String(product.sku).toLowerCase()));
    const toCreate = rows.filter((row) => !existingSet.has(row.sku.toLowerCase()));

    if (!toCreate.length) {
      return res.status(400).json({ message: "Todos os SKUs já existem no sistema." });
    }

    const created = await ProductModel.insertMany(
      toCreate.map((row) => ({
        businessId,
        name: row.name.trim(),
        sku: row.sku.trim(),
        productCode: row.productCode.trim(),
        description: row.description.trim(),
        price: row.price,
        cost: row.cost,
        stock: row.stock,
        minStock: row.minStock,
        supplier: row.supplierId && isValidObjectId(row.supplierId) ? new Types.ObjectId(row.supplierId) : undefined,
        active: true,
      })),
      { ordered: false }
    );

    res.status(201).json({
      createdCount: created.length,
      skippedExistingSku: rows.length - toCreate.length,
      message: `${created.length} produto(s) cadastrado(s) com sucesso.`,
    });
  });
}

