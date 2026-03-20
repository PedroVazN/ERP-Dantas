import type { Express, Request, Response } from "express";
import { Types, isValidObjectId } from "mongoose";

import { ProductModel, SaleItemInput, SaleModel } from "../models";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "../middleware/scope";

export function registerSalesRoutes(
  app: Express,
  deps: {
    normalizeSaleItemsAndApplyStock: (businessId: string, items: SaleItemInput[]) => Promise<
      { product: Types.ObjectId; name: string; quantity: number; unitPrice: number; total: number }[]
    >;
    generateInvoicePayload: (...args: any[]) => any;
  }
) {
  app.get("/api/sales", async (req: Request, res: Response) => {
    const includeCancelled = String(req.query.includeCancelled || "").toLowerCase() === "true";
    const filter = {
      ...getBusinessFilter(req),
      ...(includeCancelled ? {} : { status: { $ne: "CANCELADO" } }),
    };
    const sales = await SaleModel.find(filter)
      .populate("customer", "name")
      .sort({ createdAt: -1 });
    res.json(sales);
  });

  app.post("/api/sales", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { customer, items, paymentMethod, status, createdBy } = req.body as {
      customer?: string;
      items?: SaleItemInput[];
      paymentMethod?: string;
      status?: string;
      createdBy?: string;
    };

    if (!items?.length) {
      return res.status(400).json({ message: "Informe ao menos um item da venda." });
    }

    let normalizedItems: {
      product: Types.ObjectId;
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }[] = [];

    try {
      normalizedItems = await deps.normalizeSaleItemsAndApplyStock(businessId, items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao lançar venda.";
      if (message.includes("não encontrado")) {
        return res.status(404).json({ message });
      }
      return res.status(400).json({ message });
    }

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);
    const saleStatus = status || "PAGO";

    const sale = await SaleModel.create({
      businessId,
      customer: customer && isValidObjectId(customer) ? customer : undefined,
      items: normalizedItems,
      paymentMethod: paymentMethod || "PIX",
      status: saleStatus,
      billingStatus:
        saleStatus === "CANCELADO" ? "CANCELADO" : saleStatus === "PENDENTE" ? "PENDENTE" : "FATURADO",
      invoice: deps.generateInvoicePayload(
        businessId,
        new Types.ObjectId().toString(),
        saleStatus === "PAGO" ? "EMITIDA" : "PENDENTE"
      ),
      totalAmount,
      createdBy: createdBy || "Admin",
    });

    if (sale.invoice?.key) {
      sale.invoice = deps.generateInvoicePayload(
        businessId,
        String(sale._id),
        saleStatus === "PAGO" ? "EMITIDA" : "PENDENTE"
      );
      await sale.save();
    }

    res.status(201).json(sale);
  });

  app.patch("/api/sales/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const payload = req.body as Partial<{
      status: "PAGO" | "PENDENTE" | "CANCELADO";
      paymentMethod: "DINHEIRO" | "PIX" | "CARTAO" | "BOLETO" | "TRANSFERENCIA";
    }>;

    const sale = await SaleModel.findOne({ _id: id, businessId });
    if (!sale) {
      return res.status(404).json({ message: "Venda não encontrada." });
    }
    if (sale.status === "CANCELADO") {
      return res.status(400).json({ message: "Venda cancelada não pode ser alterada." });
    }

    const nextStatus = payload.status;
    const nextPayment =
      payload.paymentMethod === "DINHEIRO" ||
      payload.paymentMethod === "PIX" ||
      payload.paymentMethod === "CARTAO" ||
      payload.paymentMethod === "BOLETO" ||
      payload.paymentMethod === "TRANSFERENCIA"
        ? payload.paymentMethod
        : undefined;

    if (nextStatus === "CANCELADO") {
      for (const item of sale.items || []) {
        if (!item.product) continue;
        await ProductModel.updateOne(
          { _id: item.product, businessId },
          { $inc: { stock: item.quantity } }
        );
      }
      sale.status = "CANCELADO";
      sale.billingStatus = "CANCELADO";
      if (sale.invoice) {
        sale.invoice.status = "CANCELADA";
      }
    } else if (nextStatus === "PAGO" || nextStatus === "PENDENTE") {
      sale.status = nextStatus;
      sale.billingStatus = nextStatus === "PENDENTE" ? "PENDENTE" : "FATURADO";
    }

    if (nextPayment) {
      sale.paymentMethod = nextPayment;
    }

    await sale.save();
    const populated = await SaleModel.findById(sale._id).populate("customer", "name");
    res.json(populated);
  });

  app.delete("/api/sales/:id", async (req: Request, res: Response) => {
    if (blockWriteInGeneralScope(req, res)) {
      return;
    }
    const { businessId } = getScopeContext(req);
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }

    const sale = await SaleModel.findOne({ _id: id, businessId });
    if (!sale) {
      return res.status(404).json({ message: "Venda não encontrada." });
    }

    if (sale.status !== "CANCELADO") {
      for (const item of sale.items || []) {
        if (!item.product) continue;
        await ProductModel.updateOne(
          { _id: item.product, businessId },
          { $inc: { stock: item.quantity } }
        );
      }
      sale.status = "CANCELADO";
      sale.billingStatus = "CANCELADO";
      if (sale.invoice) {
        sale.invoice.status = "CANCELADA";
      }
      await sale.save();
    }

    res.json({ deleted: true });
  });
}

