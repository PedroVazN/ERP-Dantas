import type { Express, Request, Response } from "express";
import { isValidObjectId } from "mongoose";

import { ExpenseModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerExpenseRoutes(
  app: Express,
  deps: {
    expenseApprovalThreshold: number;
    notifySystemWhatsApp: (message: string) => Promise<any>;
  }
) {
  app.get("/api/expenses", async (req: Request, res: Response) => {
    const includeRejected = String(req.query.includeRejected || "").toLowerCase() === "true";
    const filter = {
      ...getBusinessFilter(req),
      ...(includeRejected ? {} : { status: { $ne: "REJEITADO" } }),
    };
    const expenses = await ExpenseModel.find(filter).sort({ dueDate: -1 });
    res.json(expenses);
  });

  app.post("/api/expenses", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const payload = req.body as { amount?: number; status?: string };
    const amount = Number(payload.amount || 0);
    const needsApproval = amount >= deps.expenseApprovalThreshold;
    const expense = await ExpenseModel.create({
      ...req.body,
      businessId,
      status: needsApproval ? "AGUARDANDO_APROVACAO" : payload.status || "PENDENTE",
      approval: {
        required: needsApproval,
        status: needsApproval ? "PENDENTE" : "APROVADA",
        requestedBy: "Sistema",
        requestedAt: new Date(),
      },
    });
    if (needsApproval) {
      await deps.notifySystemWhatsApp(
        [
          "Atenção: nova despesa aguardando aprovação",
          `ERP: ${businessId}`,
          `Descrição: ${String((req.body as { description?: string }).description || "Sem descrição")}`,
          `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)}`,
          `ID: ${String(expense._id)}`,
        ].join("\n")
      );
    }
    res.status(201).json(expense);
  });

  app.patch("/api/expenses/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const payload = req.body as Partial<{
      description: string;
      category: string;
      amount: number;
      dueDate: string;
      status: "PAGO" | "PENDENTE" | "AGUARDANDO_APROVACAO" | "REJEITADO";
    }>;
    const update: Record<string, unknown> = {};
    if (typeof payload.description === "string") update.description = payload.description.trim();
    if (typeof payload.category === "string") update.category = payload.category.trim();
    if (typeof payload.amount === "number" && payload.amount >= 0) update.amount = payload.amount;
    if (typeof payload.dueDate === "string" && payload.dueDate.trim()) {
      update.dueDate = new Date(payload.dueDate);
    }
    if (
      payload.status === "PAGO" ||
      payload.status === "PENDENTE" ||
      payload.status === "AGUARDANDO_APROVACAO" ||
      payload.status === "REJEITADO"
    ) {
      update.status = payload.status;
    }

    const expense = await ExpenseModel.findOneAndUpdate(
      { _id: id, businessId },
      update,
      { returnDocument: "after" }
    );
    if (!expense) {
      return res.status(404).json({ message: "Despesa não encontrada." });
    }
    res.json(expense);
  });

  app.delete("/api/expenses/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const expense = await ExpenseModel.findOneAndUpdate(
      { _id: id, businessId },
      { status: "REJEITADO" },
      { returnDocument: "after" }
    );
    if (!expense) {
      return res.status(404).json({ message: "Despesa não encontrada." });
    }
    res.json({ deleted: true });
  });
}

