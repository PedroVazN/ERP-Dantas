import type { Express, Request, Response } from "express";
import { isValidObjectId } from "mongoose";

import { CustomerModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerCustomerRoutes(app: Express) {
  app.get("/api/customers", async (req: Request, res: Response) => {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
    const filter = {
      ...getBusinessFilter(req),
      ...(includeInactive ? {} : { status: "ATIVO" }),
    };
    const customers = await CustomerModel.find(filter).sort({ createdAt: -1 });
    res.json(customers);
  });

  app.post("/api/customers", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const customer = await CustomerModel.create({ ...req.body, businessId });
    res.status(201).json(customer);
  });

  app.patch("/api/customers/:id", async (req: Request, res: Response) => {
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
      email: string;
      phone: string;
      status: "ATIVO" | "INATIVO";
    }>;

    const update: Record<string, unknown> = {};
    if (typeof payload.name === "string") update.name = payload.name.trim();
    if (typeof payload.email === "string") update.email = payload.email.trim();
    if (typeof payload.phone === "string") update.phone = payload.phone.trim();
    if (payload.status === "ATIVO" || payload.status === "INATIVO") update.status = payload.status;

    const customer = await CustomerModel.findOneAndUpdate(
      { _id: id, businessId },
      update,
      { returnDocument: "after" }
    );
    if (!customer) {
      return res.status(404).json({ message: "Cliente não encontrado." });
    }
    res.json(customer);
  });

  app.delete("/api/customers/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const customer = await CustomerModel.findOneAndUpdate(
      { _id: id, businessId },
      { status: "INATIVO" },
      { returnDocument: "after" }
    );
    if (!customer) {
      return res.status(404).json({ message: "Cliente não encontrado." });
    }
    res.json({ deleted: true });
  });
}

