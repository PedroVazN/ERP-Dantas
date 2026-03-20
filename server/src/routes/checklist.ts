import type { Express, Request, Response } from "express";

import { ChecklistItemModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerChecklistRoutes(app: Express) {
  app.get("/api/checklist-items", async (req: Request, res: Response) => {
    const items = await ChecklistItemModel.find(getBusinessFilter(req)).sort({ createdAt: -1 });
    res.json(items);
  });

  app.post("/api/checklist-items", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { title, notes } = req.body as { title?: string; notes?: string };
    if (!title?.trim()) {
      return res.status(400).json({ message: "Informe um título para a ideia." });
    }
    const item = await ChecklistItemModel.create({
      businessId,
      title: title.trim(),
      notes: notes?.trim() || "",
      completed: false,
    });
    res.status(201).json(item);
  });

  app.patch("/api/checklist-items/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { completed, title, notes } = req.body as {
      completed?: boolean;
      title?: string;
      notes?: string;
    };
    const updatePayload: {
      completed?: boolean;
      completedAt?: Date | null;
      title?: string;
      notes?: string;
    } = {};

    if (typeof completed === "boolean") {
      updatePayload.completed = completed;
      updatePayload.completedAt = completed ? new Date() : null;
    }
    if (typeof title === "string" && title.trim()) {
      updatePayload.title = title.trim();
    }
    if (typeof notes === "string") {
      updatePayload.notes = notes.trim();
    }

    const item = await ChecklistItemModel.findOneAndUpdate(
      { _id: req.params.id, businessId },
      updatePayload,
      { returnDocument: "after" }
    );
    if (!item) {
      return res.status(404).json({ message: "Item de checklist não encontrado." });
    }
    res.json(item);
  });

  app.delete("/api/checklist-items/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const removed = await ChecklistItemModel.findOneAndDelete({
      _id: req.params.id,
      businessId,
    });
    if (!removed) {
      return res.status(404).json({ message: "Item de checklist não encontrado." });
    }
    res.json({ deleted: true, id: req.params.id });
  });
}

