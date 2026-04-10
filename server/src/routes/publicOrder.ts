import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { Types, isValidObjectId } from "mongoose";

import {
  BusinessModel,
  CustomerModel,
  ProductModel,
  SaleModel,
  SaleItemInput,
} from "../models";

function getPublicOrderSecret() {
  return process.env.PUBLIC_ORDER_SECRET?.trim() || "";
}

function validatePublicToken(provided: string | undefined): boolean {
  const secret = getPublicOrderSecret();
  if (!secret || typeof provided !== "string" || !provided.trim()) {
    return false;
  }
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(provided.trim(), "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function publicOrderDisabled(res: Response) {
  return res.status(503).json({
    message:
      "Pedido online não configurado. Defina PUBLIC_ORDER_SECRET no servidor e reinicie a API.",
  });
}

export function registerPublicOrderRoutes(
  app: Express,
  deps: {
    normalizeSaleItemsAndApplyStock: (
      businessId: string,
      items: SaleItemInput[]
    ) => Promise<
      {
        product: Types.ObjectId;
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }[]
    >;
    generateInvoicePayload: (
      businessId: string,
      saleId: string,
      status: "EMITIDA" | "PENDENTE"
    ) => {
      number: string;
      key: string;
      status: "EMITIDA" | "PENDENTE";
      issuedAt: Date;
      xmlUrl: string;
    };
  }
) {
  app.get("/api/public/menu", async (req: Request, res: Response) => {
    if (!getPublicOrderSecret()) {
      return publicOrderDisabled(res);
    }

    const businessId = String(req.query.businessId || req.query.loja || "").trim();
    const token = String(req.query.token || req.query.codigo || "").trim();

    if (!validatePublicToken(token)) {
      return res.status(401).json({ message: "Código de acesso inválido." });
    }
    if (!businessId || businessId === "geral") {
      return res.status(400).json({ message: "Informe o identificador da loja (businessId)." });
    }

    const business = await BusinessModel.findOne({ businessId, active: true });
    if (!business) {
      return res.status(404).json({ message: "Loja não encontrada." });
    }

    const products = await ProductModel.find({
      businessId,
      active: true,
      stock: { $gt: 0 },
    })
      .sort({ name: 1 })
      .lean();

    const payload = products.map((p) => ({
      id: String(p._id),
      name: p.name,
      description: p.description || "",
      price: p.price,
      stock: p.stock,
      category: p.category,
      hasPhoto: Boolean(p.photoContentType),
    }));

    res.json({
      businessId: business.businessId,
      businessName: business.name,
      products: payload,
    });
  });

  app.post("/api/public/orders", async (req: Request, res: Response) => {
    if (!getPublicOrderSecret()) {
      return publicOrderDisabled(res);
    }

    const body = req.body as {
      businessId?: string;
      loja?: string;
      token?: string;
      codigo?: string;
      customerName?: string;
      customerPhone?: string;
      items?: Array<{ productId?: string; quantity?: number }>;
    };

    const businessId = String(body.businessId || body.loja || "").trim();
    const token = String(body.token || body.codigo || "").trim();
    const customerName = String(body.customerName || "").trim();
    const customerPhone = String(body.customerPhone || "").replace(/\D/g, "");

    if (!validatePublicToken(token)) {
      return res.status(401).json({ message: "Código de acesso inválido." });
    }
    if (!businessId || businessId === "geral") {
      return res.status(400).json({ message: "Informe o identificador da loja." });
    }
    if (!customerName || customerName.length < 2) {
      return res.status(400).json({ message: "Informe seu nome (ao menos 2 caracteres)." });
    }
    if (!customerPhone || customerPhone.length < 10) {
      return res.status(400).json({ message: "Informe um telefone válido com DDD." });
    }
    if (!body.items?.length) {
      return res.status(400).json({ message: "Selecione ao menos um produto." });
    }

    const business = await BusinessModel.findOne({ businessId, active: true });
    if (!business) {
      return res.status(404).json({ message: "Loja não encontrada." });
    }

    const saleItems: SaleItemInput[] = [];
    for (const row of body.items) {
      const productId = String(row.productId || "").trim();
      const quantity = Number(row.quantity);
      if (!isValidObjectId(productId) || !Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Itens do pedido inválidos." });
      }

      const product = await ProductModel.findOne({
        _id: productId,
        businessId,
        active: true,
      });
      if (!product) {
        return res.status(400).json({ message: "Um dos produtos não está mais disponível." });
      }

      saleItems.push({
        product: product._id as Types.ObjectId,
        quantity: Math.floor(quantity),
        unitPrice: product.price,
      });
    }

    let normalizedItems: Awaited<ReturnType<typeof deps.normalizeSaleItemsAndApplyStock>>;
    try {
      normalizedItems = await deps.normalizeSaleItemsAndApplyStock(businessId, saleItems);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar pedido.";
      if (message.includes("não encontrado")) {
        return res.status(404).json({ message });
      }
      return res.status(400).json({ message });
    }

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);

    let customer = await CustomerModel.findOne({
      businessId,
      phone: customerPhone,
      status: "ATIVO",
    });
    if (!customer) {
      customer = await CustomerModel.create({
        businessId,
        name: customerName,
        phone: customerPhone,
        notes: "Cliente criado pelo pedido online.",
        status: "ATIVO",
      });
    } else if (customer.name !== customerName) {
      customer.name = customerName;
      await customer.save();
    }

    const sale = await SaleModel.create({
      businessId,
      customer: customer._id,
      items: normalizedItems,
      paymentMethod: "PIX",
      status: "PENDENTE",
      billingStatus: "PENDENTE",
      invoice: deps.generateInvoicePayload(
        businessId,
        new Types.ObjectId().toString(),
        "PENDENTE"
      ),
      totalAmount,
      createdBy: "Pedido online",
    });

    if (sale.invoice?.key) {
      sale.invoice = deps.generateInvoicePayload(
        businessId,
        String(sale._id),
        "PENDENTE"
      );
      await sale.save();
    }

    const created =
      (await SaleModel.findById(sale._id).populate("customer", "name email phone")) ?? sale;

    res.status(201).json({
      sale: created,
      message:
        "Pedido registrado. Pague com PIX usando o QR Code abaixo e aguarde a confirmação da loja.",
    });
  });
}
