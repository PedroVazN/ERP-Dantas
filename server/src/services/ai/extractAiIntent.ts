import type { AiIntent } from "./types";
import { parseLooseNumber } from "../../lib/normalizers";

export function extractAiIntent(message: string): {
  intent: AiIntent;
  quantity?: number;
  productName?: string;
  customerName?: string;
  unitCost?: number;
  unitPrice?: number;
  paymentMethod?:
    | "PIX"
    | "DINHEIRO"
    | "CARTAO"
    | "BOLETO"
    | "TRANSFERENCIA"
    | undefined;
} {
  const lower = message.toLowerCase();

  const paymentMethod =
    lower.includes("pix")
      ? "PIX"
      : lower.includes("dinheiro")
        ? "DINHEIRO"
        : lower.includes("debito") || lower.includes("débito")
          ? "CARTAO"
          : lower.includes("credito") || lower.includes("crédito")
            ? "CARTAO"
        : lower.includes("cartao") || lower.includes("cartão")
          ? "CARTAO"
          : lower.includes("boleto")
            ? "BOLETO"
            : lower.includes("transferencia")
              ? "TRANSFERENCIA"
              : undefined;

  const purchaseMatch = lower.match(/(?:compre|comprar)\s+(\d+)\s+(.+)$/i);
  if (purchaseMatch) {
    const quantity = Number(purchaseMatch[1]);
    const productName = purchaseMatch[2].trim();
    const costMatch = lower.match(/(?:\bpor\b|\ba\b)\s+(\d+(?:[.,]\d+)?)/);
    const unitCost = costMatch ? parseLooseNumber(costMatch[1]) : null;
    return { intent: "purchase", quantity, productName, unitCost: unitCost ?? undefined };
  }

  const saleMatch = lower.match(/(?:vender|venda)\s+(\d+)\s+(.+)$/i);
  if (saleMatch) {
    const quantity = Number(saleMatch[1]);
    const productName = saleMatch[2].trim();
    const priceMatch = lower.match(/(?:\bpor\b|\ba\b)\s+(\d+(?:[.,]\d+)?)/);
    const unitPrice = priceMatch ? parseLooseNumber(priceMatch[1]) : null;
    return {
      intent: "sale",
      quantity,
      productName,
      unitPrice: unitPrice ?? undefined,
      paymentMethod,
    };
  }

  const emailRe = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i;
  const phoneRe = /\b([0-9]{8,})\b/;

  const customerCreateMatch = message.match(/(?:cadastrar|criar|adicionar)\s+(?:um\s+)?cliente\s+(.+)$/i);
  if (customerCreateMatch) {
    const rest = customerCreateMatch[1].trim();
    const emailMatch = rest.match(emailRe)?.[0] || null;
    const phoneMatch = rest.match(phoneRe)?.[1] || null;

    const restWithoutEmail = emailMatch ? rest.replace(emailMatch, " ").trim() : rest;
    const restWithoutPhone = phoneMatch
      ? restWithoutEmail.replace(phoneMatch, " ").trim()
      : restWithoutEmail;

    const customerName = restWithoutPhone.replace(/\s+/g, " ").trim();
    return { intent: "customer_create", customerName: customerName || undefined };
  }

  // “cliente João” sem prefixo explícito: tentamos apenas se estiver muito claro
  if (lower.includes("cliente") && (lower.includes("cadastrar") || lower.includes("criar") || lower.includes("adicionar"))) {
    const nameMatch = lower.match(/cliente\s+(.+)$/i);
    if (nameMatch) {
      const rest = nameMatch[1].trim();
      const emailMatch = rest.match(emailRe)?.[0] || null;
      const phoneMatch = rest.match(phoneRe)?.[1] || null;

      const restWithoutEmail = emailMatch ? rest.replace(emailMatch, " ").trim() : rest;
      const restWithoutPhone = phoneMatch ? restWithoutEmail.replace(phoneMatch, " ").trim() : restWithoutEmail;
      const customerName = restWithoutPhone.replace(/\s+/g, " ").trim();
      return { intent: "customer_create", customerName: customerName || undefined };
    }
  }

  return { intent: "unknown" };
}

