import type { Express, Request, Response } from "express";
import { isValidObjectId } from "mongoose";

import { SupplierModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerSupplierRoutes(app: Express) {
  app.get("/api/suppliers", async (req: Request, res: Response) => {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
    const filter = {
      ...getBusinessFilter(req),
      ...(includeInactive ? {} : { status: "ATIVO" }),
    };
    const suppliers = await SupplierModel.find(filter).sort({ createdAt: -1 });
    res.json(suppliers);
  });

  app.post("/api/suppliers", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const supplier = await SupplierModel.create({ ...req.body, businessId });
    res.status(201).json(supplier);
  });

  app.patch("/api/suppliers/:id", async (req: Request, res: Response) => {
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
      document: string;
      contact: string;
      pixKey: string;
      city: string;
      businessArea: string;
      paymentCondition: "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO";
      status: "ATIVO" | "INATIVO";
    }>;

    const update: Record<string, unknown> = {};
    if (typeof payload.name === "string") update.name = payload.name.trim();
    if (typeof payload.document === "string") update.document = payload.document.trim();
    if (typeof payload.contact === "string") update.contact = payload.contact.trim();
    if (typeof payload.pixKey === "string") update.pixKey = payload.pixKey.trim();
    if (typeof payload.city === "string") update.city = payload.city.trim();
    if (typeof payload.businessArea === "string") update.businessArea = payload.businessArea.trim();
    if (
      payload.paymentCondition === "BOLETO" ||
      payload.paymentCondition === "PIX" ||
      payload.paymentCondition === "DINHEIRO" ||
      payload.paymentCondition === "CREDITO"
    ) {
      update.paymentCondition = payload.paymentCondition;
    }
    if (payload.status === "ATIVO" || payload.status === "INATIVO") update.status = payload.status;

    const supplier = await SupplierModel.findOneAndUpdate(
      { _id: id, businessId },
      update,
      { returnDocument: "after" }
    );
    if (!supplier) {
      return res.status(404).json({ message: "Fornecedor não encontrado." });
    }
    res.json(supplier);
  });

  app.delete("/api/suppliers/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const supplier = await SupplierModel.findOneAndUpdate(
      { _id: id, businessId },
      { status: "INATIVO" },
      { returnDocument: "after" }
    );
    if (!supplier) {
      return res.status(404).json({ message: "Fornecedor não encontrado." });
    }
    res.json({ deleted: true });
  });
}

