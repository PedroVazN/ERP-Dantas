import { getGeminiClient, GEMINI_MODEL } from "./geminiClient";
import type { AiIntent } from "./types";

export type GeminiExtractedIntent = {
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

const CLASSIFY_PROMPT = `Você é um classificador de intenções para um sistema ERP.

Classifique a mensagem do usuário retornando APENAS um JSON puro (sem markdown):

Para COMPRA (comprar, repor, pedir produto):
{"intent":"purchase","quantity":NUMERO,"productName":"NOME"}

Para VENDA (vender, registrar venda):
{"intent":"sale","quantity":NUMERO,"productName":"NOME","paymentMethod":"PIX|DINHEIRO|CARTAO|BOLETO|TRANSFERENCIA"}

Para CADASTRO DE CLIENTE:
{"intent":"customer_create","customerName":"NOME","customerPhone":"FONE","customerEmail":"EMAIL"}

Para TUDO MAIS (perguntas, análises, sugestões, clima, dúvidas gerais):
{"intent":"chat"}

IMPORTANTE: Se a mensagem for uma pergunta, análise ou não for claramente um dos 3 primeiros tipos, use "chat".`;

export async function geminiExtractIntent(message: string): Promise<GeminiExtractedIntent | null> {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(
      `${CLASSIFY_PROMPT}\n\nMensagem do usuário: "${message}"\n\nJSON:`
    );
    const text = result.response.text().trim();

    // Remove blocos markdown se o modelo insistir em enviar
    const clean = text
      .replace(/^```(?:json)?/im, "")
      .replace(/```$/m, "")
      .trim();

    // Extrai primeiro objeto JSON válido do texto
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as GeminiExtractedIntent;
    return parsed;
  } catch (err) {
    console.warn("[Gemini] Falha na extração de intenção:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Gera descrição inteligente de produto via Gemini */
export async function geminiGenerateProductDetails(productName: string): Promise<{
  description: string;
  suggestedPrice: number;
  minStock: number;
} | null> {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `Você é um especialista em produtos para pequenas empresas no Brasil.
Para o produto "${productName}", gere:
{
  "description": "descrição curta e profissional (máximo 80 caracteres)",
  "suggestedPrice": número em reais (preço de venda sugerido realista),
  "minStock": número inteiro (estoque mínimo sugerido)
}
Retorne APENAS o JSON puro, sem markdown.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(clean) as { description: string; suggestedPrice: number; minStock: number };
  } catch {
    return null;
  }
}
