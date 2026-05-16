import type { Express, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import * as XLSX from "xlsx";

import { ProductModel } from "../models";
import { upload } from "../app";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

type PriceImportPreviewRow = {
  line: number;
  sku: string;
  name: string;
  price: number;
  productId: string;
  matchedName: string;
  valid: boolean;
  errors: string[];
};

const PRICE_TABLE_IMPORT_COLUMNS = ["sku", "preco_venda"];

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

export function registerPriceTableRoutes(app: Express) {
  // Lista os produtos com os dados relevantes para a tabela de preço.
  app.get("/api/price-table", async (req: Request, res: Response) => {
    const filter = { ...getBusinessFilter(req), active: true };
    const products = await ProductModel.find(filter)
      .populate("supplier", "name")
      .sort({ name: 1 });

    const payload = products.map((product) => {
      const obj = product.toObject() as Record<string, unknown> & {
        photoData?: Buffer;
        photoContentType?: string | null;
      };
      delete obj.photoData;
      obj.hasPhoto = Boolean(obj.photoContentType);
      return obj;
    });
    res.json(payload);
  });

  // Atualiza o preço de venda de um único produto.
  app.patch("/api/price-table/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const price = parseNumber((req.body as { price?: unknown }).price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "Informe um preço válido (R$ >= 0)." });
    }

    const updated = await ProductModel.findOneAndUpdate(
      { _id: id, businessId },
      { price },
      { returnDocument: "after" }
    ).populate("supplier", "name");

    if (!updated) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.json(updated);
  });

  // Atualiza preço de vários produtos em lote.
  app.post("/api/price-table/bulk", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const rawRows = (req.body as { rows?: Array<{ id?: string; price?: unknown }> }).rows;
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ message: "Nenhum item para atualizar." });
    }

    let updated = 0;
    for (const row of rawRows) {
      if (!row?.id || !isValidObjectId(row.id)) continue;
      const price = parseNumber(row.price);
      if (!Number.isFinite(price) || price < 0) continue;
      const result = await ProductModel.updateOne(
        { _id: row.id, businessId },
        { $set: { price } }
      );
      if (result.matchedCount === 1) updated += 1;
    }
    res.json({ updated });
  });

  app.get("/api/price-table/import/template", (_req: Request, res: Response) => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      PRICE_TABLE_IMPORT_COLUMNS,
      ["SAB-LAV-90", 14.9],
      ["SAB-OLI-90", 12.5],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "precos");
    const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="modelo-tabela-precos.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(fileBuffer);
  });

  app.post(
    "/api/price-table/import/preview",
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
      const missingColumns = PRICE_TABLE_IMPORT_COLUMNS.filter(
        (col) => !header.includes(col)
      );
      if (missingColumns.length > 0) {
        return res.status(400).json({
          message: `Colunas obrigatórias ausentes: ${missingColumns.join(", ")}`,
          templateColumns: PRICE_TABLE_IMPORT_COLUMNS,
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
        .filter((row) =>
          Object.values(row).some((value) => String(value ?? "").trim() !== "")
        );

      const products = await ProductModel.find({ businessId })
        .select("_id sku name")
        .lean();
      const bySku = new Map<string, { _id: string; name: string; sku: string }>();
      for (const product of products) {
        const sku = String(product.sku || "").trim().toLowerCase();
        if (sku) {
          bySku.set(sku, {
            _id: String(product._id),
            name: String(product.name || ""),
            sku: String(product.sku || ""),
          });
        }
      }

      const seenSkus = new Map<string, number>();
      const rows: PriceImportPreviewRow[] = entries.map((raw, idx) => {
        const line = idx + 2;
        const skuRaw = String(raw.sku ?? "").trim();
        const sku = skuRaw.toLowerCase();
        const priceRaw = raw.preco_venda ?? raw.preco;
        const price = parseNumber(priceRaw);
        const errors: string[] = [];

        if (!skuRaw) errors.push("SKU é obrigatório.");
        if (!Number.isFinite(price) || price < 0)
          errors.push("Preço de venda inválido.");

        const matched = sku ? bySku.get(sku) : undefined;
        if (skuRaw && !matched) {
          errors.push("Produto com este SKU não encontrado.");
        }

        if (sku) {
          if (seenSkus.has(sku)) {
            errors.push("SKU duplicado na planilha.");
          } else {
            seenSkus.set(sku, line);
          }
        }

        return {
          line,
          sku: skuRaw,
          name: matched?.name || "",
          price: Number.isFinite(price) ? price : 0,
          productId: matched?._id || "",
          matchedName: matched?.name || "",
          valid: errors.length === 0,
          errors,
        };
      });

      const validCount = rows.filter((row) => row.valid).length;
      res.json({
        templateColumns: PRICE_TABLE_IMPORT_COLUMNS,
        totalRows: rows.length,
        validRows: validCount,
        invalidRows: rows.length - validCount,
        rows,
      });
    }
  );

  app.post(
    "/api/price-table/import/commit",
    async (req: Request, res: Response) => {
      if (blockWriteInGeneralScope(req, res)) {
        return;
      }
      const { businessId } = getScopeContext(req);
      const payload = req.body as { rows?: PriceImportPreviewRow[] };
      if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
        return res.status(400).json({ message: "Nenhuma linha para atualizar." });
      }

      const validRows = payload.rows.filter(
        (row) => row && row.valid && row.productId && Number.isFinite(row.price)
      );
      if (!validRows.length) {
        return res.status(400).json({ message: "Nenhuma linha válida para confirmar." });
      }

      let updated = 0;
      for (const row of validRows) {
        if (!isValidObjectId(row.productId)) continue;
        const result = await ProductModel.updateOne(
          { _id: row.productId, businessId },
          { $set: { price: Number(row.price) } }
        );
        if (result.matchedCount === 1) updated += 1;
      }

      res.json({
        updated,
        message: `${updated} preço(s) atualizado(s) com sucesso.`,
      });
    }
  );
}
