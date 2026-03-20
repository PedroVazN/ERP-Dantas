import type { Express, Request, Response } from "express";

import { getScopeContext } from "../middleware/scope";
import { createAiPlan } from "../services/ai/planService";
import { executeAiPlan } from "../services/ai/executeService";

export function registerAiRoutes(
  app: Express,
  deps: {
    purchaseApprovalThreshold: number;
    aiPlanTtlMs: number;
    autoApprovePurchasesForAi: boolean;
    applyPurchaseStock: (
      businessId: string,
      items: Array<{ product?: any; quantity: number; cost: number }>
    ) => Promise<void>;
    normalizeSaleItemsAndApplyStock: (...args: any[]) => Promise<any>;
    generateInvoicePayload: (...args: any[]) => any;
  }
) {
  app.post("/api/ai/plan", async (req: Request, res: Response) => {
    const { scope, businessId } = getScopeContext(req);
    if (scope === "geral") {
      res.status(400).json({
        message: "O ERP Geral e apenas para consolidacao. Selecione um ERP especifico para lancamentos.",
      });
      return;
    }

    const payload = req.body as { message?: string };
    const message = payload.message?.trim() || "";
    if (!message) {
      return res.status(400).json({ message: "Informe uma mensagem para a IA." });
    }

    const plan = await createAiPlan({
      scope: scope as "geral" | "negocio",
      businessId,
      message,
      purchaseApprovalThreshold: deps.purchaseApprovalThreshold,
      aiPlanTtlMs: deps.aiPlanTtlMs,
      autoApprovePurchasesForAi: deps.autoApprovePurchasesForAi,
    });

    res.json(plan);
  });

  app.post("/api/ai/execute", async (req: Request, res: Response) => {
    const { scope, businessId } = getScopeContext(req);
    const payload = req.body as {
      planId?: string;
      confirm?: boolean | string;
      clientNotes?: string;
      overrides?: unknown;
    };

    const planId = payload.planId?.trim() || "";
    if (!planId) {
      return res.status(400).json({ message: "planId ausente." });
    }

    const result = await executeAiPlan(
      {
        scope: scope as "geral" | "negocio",
        businessId,
        planId,
        confirm: payload.confirm,
        overrides: payload.overrides as any,
      },
      {
        purchaseApprovalThreshold: deps.purchaseApprovalThreshold,
        applyPurchaseStock: deps.applyPurchaseStock as any,
        normalizeSaleItemsAndApplyStock: deps.normalizeSaleItemsAndApplyStock as any,
        generateInvoicePayload: deps.generateInvoicePayload as any,
      }
    );

    res.status(result.statusCode).json(result.body);
  });
}

