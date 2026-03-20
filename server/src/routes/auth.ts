import type { Express, Request, Response } from "express";

import { BusinessModel, SettingModel } from "../models";

export function registerAuthRoutes(
  app: Express,
  opts: { adminEmail: string; adminPassword: string }
) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "Informe e-mail e senha." });
    }

    if (
      email.trim().toLowerCase() !== opts.adminEmail.toLowerCase() ||
      password !== opts.adminPassword
    ) {
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    const settings = await SettingModel.findOneAndUpdate(
      { userId: "admin" },
      {
        $setOnInsert: {
          userId: "admin",
          userName: "Administrador",
          userEmail: opts.adminEmail,
          userRole: "Gestor",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    await BusinessModel.updateOne(
      { businessId: "geral" },
      { $setOnInsert: { businessId: "geral", name: "ERP Geral", active: true } },
      { upsert: true }
    );

    res.json({
      token: Buffer.from(`${settings.userId}:${Date.now()}`).toString("base64"),
      user: {
        id: settings.userId,
        name: settings.userName,
        email: settings.userEmail,
        role: settings.userRole,
      },
    });
  });
}

