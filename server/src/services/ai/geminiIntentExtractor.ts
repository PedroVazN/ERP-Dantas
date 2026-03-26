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

const SYSTEM_PROMPT = `Você é o interpretador de intenções do sistema ERP E-Sentinel.
Analise a mensagem do usuário e retorne um JSON com a seguinte estrutura:
{
  "intent": "purchase" | "sale" | "customer_create" | "chat",
  "quantity": número (se aplicável),
  "productName": "nome do produto" (se aplicável),
  "customerName": "nome" (se aplicável),
  "customerEmail": "email" (se aplicável),
  "customerPhone": "telefone" (se aplicável),
  "unitCost": número (custo unitário, se mencionado),
  "unitPrice": número (preço de venda, se mencionado),
  "paymentMethod": "PIX" | "DINHEIRO" | "CARTAO" | "BOLETO" | "TRANSFERENCIA" (se mencionado)
}

Regras:
- "purchase" = comprar, repor estoque, pedir ao fornecedor
- "sale" = vender, registrar venda, dar saída
- "customer_create" = cadastrar cliente, criar cliente, novo cliente
- "chat" = qualquer outra coisa: perguntas, sugestões, dúvidas, análises
- Retorne APENAS o JSON puro, sem markdown, sem explicações.
- Se for "chat", inclua apenas { "intent": "chat" }.`;

export async function geminiExtractIntent(message: string): Promise<GeminiExtractedIntent | null> {
  const client = getGeminiClient();
  if (!client) return null;

  try {
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(`${SYSTEM_PROMPT}\n\nMensagem: "${message}"`);
    const text = result.response.text().trim();

    // Remove blocos markdown se presentes
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(clean) as GeminiExtractedIntent;
    return parsed;
  } catch {
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
