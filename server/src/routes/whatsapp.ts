import type { Express, Request, Response } from "express";

import { SaleModel } from "../models";

// Nota: essas dependências são injetadas pelo `index.ts` para não mudar comportamento.
export function registerWhatsAppRoutes(
  app: Express,
  deps: {
    whatsappApiUrl: string;
    whatsappPhoneNumberId?: string;
    whatsappAccessToken?: string;
    whatsappNotifyTo?: string;
    isWhatsAppConfigured: () => boolean;
    sendWhatsAppTextMessage: (toPhone: string, body: string) => Promise<any>;
    normalizeWhatsAppPhone: (phone: string) => string;
  }
) {
  app.get("/api/integrations/whatsapp/status", async (_req: Request, res: Response) => {
    res.json({
      configured: deps.isWhatsAppConfigured(),
      apiUrl: deps.whatsappApiUrl,
      phoneNumberIdConfigured: Boolean(deps.whatsappPhoneNumberId),
      accessTokenConfigured: Boolean(deps.whatsappAccessToken),
      notifyTo: deps.whatsappNotifyTo || "",
    });
  });

  app.post("/api/integrations/whatsapp/send", async (req: Request, res: Response) => {
    const { phone, message } = req.body as { phone?: string; message?: string };
    if (!phone?.trim()) {
      return res.status(400).json({ message: "Informe o telefone de destino." });
    }
    if (!message?.trim()) {
      return res.status(400).json({ message: "Informe a mensagem para envio." });
    }

    const result = await deps.sendWhatsAppTextMessage(phone, message.trim());
    res.status(201).json({
      sent: true,
      phone: deps.normalizeWhatsAppPhone(phone),
      provider: "WHATSAPP_BUSINESS",
      result,
    });
  });

  app.post("/api/integrations/whatsapp/sales/:id", async (req: Request, res: Response) => {
    const sale = await SaleModel.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ message: "Venda não encontrada." });
    }

    const { phone, customerName } = req.body as { phone?: string; customerName?: string };
    if (!phone?.trim()) {
      return res.status(400).json({ message: "Informe o telefone de destino." });
    }

    const invoiceNumber = sale.invoice?.number || "Pendente";
    const status = sale.status || "PENDENTE";
    const body = [
      `Olá${customerName?.trim() ? `, ${customerName.trim()}` : ""}!`,
      "Resumo da sua compra no E-Sentinel:",
      `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        sale.totalAmount
      )}`,
      `Pagamento: ${sale.paymentMethod}`,
      `Status: ${status}`,
      `NF: ${invoiceNumber}`,
      "",
      "Obrigado pela preferência.",
    ].join("\n");

    const result = await deps.sendWhatsAppTextMessage(phone, body);
    res.status(201).json({
      sent: true,
      phone: deps.normalizeWhatsAppPhone(phone),
      provider: "WHATSAPP_BUSINESS",
      result,
    });
  });
}

