import type { Express, Request, Response } from "express";

import { BusinessModel } from "../models";
import { slugify } from "../lib/normalizers";

export function registerBusinessRoutes(app: Express) {
  app.get("/api/businesses", async (_req: Request, res: Response) => {
    await BusinessModel.updateOne(
      { businessId: "geral" },
      { $setOnInsert: { businessId: "geral", name: "ERP Geral", active: true } },
      { upsert: true }
    );
    const businesses = await BusinessModel.find({ active: true }).sort({ createdAt: 1 });
    res.json(businesses);
  });

  app.post("/api/businesses", async (req: Request, res: Response) => {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      return res.status(400).json({ message: "Nome do ERP e obrigatorio." });
    }
    const baseSlug = slugify(name) || "erp";
    const businessId = `${baseSlug}-${Date.now().toString().slice(-6)}`;
    const business = await BusinessModel.create({
      businessId,
      name: name.trim(),
      active: true,
    });
    res.status(201).json(business);
  });
}

