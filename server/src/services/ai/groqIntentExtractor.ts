import type { AiIntent } from "./types";
import { groqChat } from "./groqClient";

export type GroqExtractedIntent = {
  intent: AiIntent | "chat";
  quantity?: number;
  productName?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  unitCost?: number;
  unitPrice?: number;
  paymentMethod?: "PIX" | "DINHEIRO" | "CARTAO" | "BOLETO" | "TRANSFERENCIA";
};

const CLASSIFY_PROMPT = `Você é um classificador de intenções para ERP.
Retorne APENAS JSON puro.

COMPRA:
{"intent":"purchase","quantity":NUMERO,"productName":"NOME"}

VENDA:
{"intent":"sale","quantity":NUMERO,"productName":"NOME","paymentMethod":"PIX|DINHEIRO|CARTAO|BOLETO|TRANSFERENCIA"}

CADASTRO DE CLIENTE:
{"intent":"customer_create","customerName":"NOME","customerPhone":"FONE","customerEmail":"EMAIL"}

QUALQUER PERGUNTA NORMAL, ANALISE, CLIMA, DÚVIDA:
{"intent":"chat"}`;

export async function groqExtractIntent(message: string): Promise<GroqExtractedIntent | null> {
  try {
    const text = await groqChat(
      [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: `Mensagem: "${message}"\nJSON:` },
      ],
      { temperature: 0 }
    );
    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as GroqExtractedIntent;
  } catch (err) {
    console.warn("[Groq] Falha na extração de intenção:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function groqGenerateProductDetails(productName: string): Promise<{
  description: string;
  suggestedPrice: number;
  minStock: number;
} | null> {
  try {
    const text = await groqChat(
      [
        {
          role: "system",
          content:
            'Você gera dados de produto para ERP. Responda APENAS JSON: {"description":"...", "suggestedPrice": 0, "minStock": 0}',
        },
        {
          role: "user",
          content: `Produto: "${productName}". Gere descrição curta e profissional (<=80 chars), preço sugerido em reais e estoque mínimo.`,
        },
      ],
      { temperature: 0.4 }
    );
    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { description: string; suggestedPrice: number; minStock: number };
    return {
      description: String(parsed.description || "").trim() || `${productName} - produto cadastrado via IA`,
      suggestedPrice: Number(parsed.suggestedPrice || 10),
      minStock: Math.max(1, Number(parsed.minStock || 10)),
    };
  } catch {
    return null;
  }
}

