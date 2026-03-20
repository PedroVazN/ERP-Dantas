import type { Express, Request, Response } from "express";
import { Types } from "mongoose";

import { ExpenseModel, PurchaseModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerApprovalsRoutes(
  app: Express,
  deps: {
    applyPurchaseStock: (businessId: string, items: Array<{ product?: Types.ObjectId; quantity: number; cost: number }>) => Promise<void>;
    notifySystemWhatsApp: (message: string) => Promise<any>;
  }
) {
  app.get("/api/approvals/purchases", async (req: Request, res: Response) => {
    const pending = await PurchaseModel.find({
      ...getBusinessFilter(req),
      status: "AGUARDANDO_APROVACAO",
    }).sort({ createdAt: -1 });
    res.json(pending);
  });

  app.get("/api/approvals/expenses", async (req: Request, res: Response) => {
    const pending = await ExpenseModel.find({
      ...getBusinessFilter(req),
      status: "AGUARDANDO_APROVACAO",
    }).sort({ createdAt: -1 });
    res.json(pending);
  });

  app.patch("/api/approvals/purchases/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { action, reason, reviewedBy } = req.body as {
      action?: "aprovar" | "rejeitar";
      reason?: string;
      reviewedBy?: string;
    };
    if (!action || !["aprovar", "rejeitar"].includes(action)) {
      return res.status(400).json({ message: "Acao invalida. Use aprovar ou rejeitar." });
    }

    const purchase = await PurchaseModel.findOne({ _id: req.params.id, businessId });
    if (!purchase) {
      return res.status(404).json({ message: "Compra nao encontrada." });
    }
    if (purchase.status !== "AGUARDANDO_APROVACAO") {
      return res.status(400).json({ message: "Compra nao esta pendente de aprovacao." });
    }

    if (action === "aprovar") {
      if (!purchase.stockApplied) {
        await deps.applyPurchaseStock(
          businessId,
          purchase.items as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>
        );
        purchase.stockApplied = true;
      }
      purchase.status = "RECEBIDA";
      purchase.approval = {
        required: true,
        status: "APROVADA",
        requestedBy: purchase.approval?.requestedBy || "Sistema",
        requestedAt:
          purchase.approval?.requestedAt || purchase.createdAt || new Date(),
        reviewedBy: reviewedBy || "Gestor",
        reviewedAt: new Date(),
        reason: reason?.trim() || "Aprovacao automatizada via fluxo de compras.",
      };
    } else {
      purchase.status = "REJEITADA";
      purchase.approval = {
        required: true,
        status: "REJEITADA",
        requestedBy: purchase.approval?.requestedBy || "Sistema",
        requestedAt:
          purchase.approval?.requestedAt || purchase.createdAt || new Date(),
        reviewedBy: reviewedBy || "Gestor",
        reviewedAt: new Date(),
        reason: reason?.trim() || "Rejeicao registrada no fluxo de aprovacao.",
      };
    }

    await purchase.save();
    await deps.notifySystemWhatsApp(
      [
        "Compra revisada no fluxo de aprovação",
        `ERP: ${businessId}`,
        `ID: ${String(purchase._id)}`,
        `Status: ${purchase.status}`,
        `Revisor: ${reviewedBy || "Gestor"}`,
      ].join("\n")
    );
    res.json(purchase);
  });

  app.patch("/api/approvals/expenses/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { action, reason, reviewedBy } = req.body as {
      action?: "aprovar" | "rejeitar" | "pagar";
      reason?: string;
      reviewedBy?: string;
    };
    if (!action || !["aprovar", "rejeitar", "pagar"].includes(action)) {
      return res.status(400).json({ message: "Acao invalida. Use aprovar, rejeitar ou pagar." });
    }

    const expense = await ExpenseModel.findOne({ _id: req.params.id, businessId });
    if (!expense) {
      return res.status(404).json({ message: "Despesa nao encontrada." });
    }

    if (action === "aprovar") {
      if (expense.status !== "AGUARDANDO_APROVACAO") {
        return res.status(400).json({ message: "Despesa nao esta aguardando aprovacao." });
      }
      expense.status = "PENDENTE";
      expense.approval = {
        required: true,
        status: "APROVADA",
        requestedBy: expense.approval?.requestedBy || "Sistema",
        requestedAt:
          expense.approval?.requestedAt || expense.createdAt || new Date(),
        reviewedBy: reviewedBy || "Gestor",
        reviewedAt: new Date(),
        reason: reason?.trim() || "Despesa aprovada para pagamento.",
      };
    }

    if (action === "rejeitar") {
      expense.status = "REJEITADO";
      expense.approval = {
        required: true,
        status: "REJEITADA",
        requestedBy: expense.approval?.requestedBy || "Sistema",
        requestedAt:
          expense.approval?.requestedAt || expense.createdAt || new Date(),
        reviewedBy: reviewedBy || "Gestor",
        reviewedAt: new Date(),
        reason: reason?.trim() || "Despesa rejeitada no fluxo de aprovacao.",
      };
    }

    if (action === "pagar") {
      if (expense.status === "AGUARDANDO_APROVACAO") {
        return res.status(400).json({ message: "Aprove a despesa antes de pagar." });
      }
      if (expense.status === "REJEITADO") {
        return res.status(400).json({ message: "Despesa rejeitada nao pode ser paga." });
      }
      expense.status = "PAGO";
      expense.paymentDate = new Date();
      if (!expense.approval?.required) {
        expense.approval = {
          required: false,
          status: "APROVADA",
          requestedBy: "Sistema",
          requestedAt: expense.createdAt || new Date(),
          reviewedBy: reviewedBy || "Sistema",
          reviewedAt: new Date(),
          reason: "Pagamento executado automaticamente.",
        };
      }
    }

    await expense.save();
    await deps.notifySystemWhatsApp(
      [
        "Despesa revisada no fluxo de aprovação",
        `ERP: ${businessId}`,
        `ID: ${String(expense._id)}`,
        `Status: ${expense.status}`,
        `Revisor: ${reviewedBy || "Gestor"}`,
      ].join("\n")
    );
    res.json(expense);
  });
}

