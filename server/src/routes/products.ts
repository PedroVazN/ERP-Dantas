import type { Express, Request, Response } from "express";
import { Types, isValidObjectId } from "mongoose";

import { ProductModel } from "../models";
import { upload } from "../app";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

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
}

