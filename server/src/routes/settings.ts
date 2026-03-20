import type { Express, Request, Response } from "express";

import { SettingModel } from "../models";

export function registerSettingsRoutes(app: Express) {
  app.get("/api/settings", async (_req: Request, res: Response) => {
    const settings = await SettingModel.findOneAndUpdate(
      { userId: "admin" },
      { $setOnInsert: { userId: "admin" } },
      { upsert: true, returnDocument: "after" }
    );
    res.json(settings);
  });

  app.put("/api/settings/theme", async (req: Request, res: Response) => {
    const { theme } = req.body as {
      theme?: "claro" | "escuro" | "oceano" | "sabonete" | "rosa" | "neutro";
    };
    if (!theme) {
      return res.status(400).json({ message: "Tema é obrigatório." });
    }

    const settings = await SettingModel.findOneAndUpdate(
      { userId: "admin" },
      { theme },
      { upsert: true, returnDocument: "after" }
    );
    res.json(settings);
  });

  app.put("/api/settings/profile", async (req: Request, res: Response) => {
    const { userName, userEmail, userRole, companyName } = req.body as {
      userName?: string;
      userEmail?: string;
      userRole?: string;
      companyName?: string;
    };

    if (!userName?.trim() || !userEmail?.trim()) {
      return res.status(400).json({ message: "Nome e e-mail do usuário são obrigatórios." });
    }

    const settings = await SettingModel.findOneAndUpdate(
      { userId: "admin" },
      {
        userName: userName.trim(),
        userEmail: userEmail.trim(),
        userRole: userRole?.trim() || "Gestor",
        companyName: companyName?.trim() || "E-Sentinel Sabonetes",
      },
      { upsert: true, returnDocument: "after" }
    );
    res.json(settings);
  });
}

