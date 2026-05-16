import type { Express, Request, Response } from "express";

import { getScopeContext } from "../middleware/scope";
import { createAiPlan } from "../services/ai/planService";
import { executeAiPlan } from "../services/ai/executeService";
import { GROQ_MODEL, groqChat, isGroqAvailable } from "../services/ai/groqClient";
import { ExpenseModel, ProductModel, SaleModel } from "../models";

export function registerAiRoutes(
  app: Express,
  deps: {
    purchaseApprovalThreshold: number;
    aiPlanTtlMs: number;
    autoApprovePurchasesForAi: boolean;
    applyPurchaseStock: (
      businessId: string,
      items: Array<{ product?: any; quantity: number; cost: number }>,
      extraExpenses?: number
    ) => Promise<void>;
    normalizeSaleItemsAndApplyStock: (...args: any[]) => Promise<any>;
    generateInvoicePayload: (...args: any[]) => any;
  }
) {
  app.post("/api/ai/plan", async (req: Request, res: Response) => {
    const { scope, businessId } = getScopeContext(req);
    if (scope === "geral") {
      res.status(400).json({
        message: "O ERP Geral e apenas para consolidacao. Selecione um ERP especifico para lancamentos.",
      });
      return;
    }

    const payload = req.body as {
      message?: string;
      history?: Array<{ role?: string; content?: string }>;
    };
    const message = payload.message?.trim() || "";
    if (!message) {
      return res.status(400).json({ message: "Informe uma mensagem para a IA." });
    }

    const plan = await createAiPlan({
      scope: scope as "geral" | "negocio",
      businessId,
      message,
      history: (payload.history || [])
        .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
        .map((h) => ({ role: h.role as "user" | "assistant", content: String(h.content) })),
      purchaseApprovalThreshold: deps.purchaseApprovalThreshold,
      aiPlanTtlMs: deps.aiPlanTtlMs,
      autoApprovePurchasesForAi: deps.autoApprovePurchasesForAi,
    });

    res.json(plan);
  });

  app.post("/api/ai/execute", async (req: Request, res: Response) => {
    const { scope, businessId } = getScopeContext(req);
    const payload = req.body as {
      planId?: string;
      confirm?: boolean | string;
      clientNotes?: string;
      overrides?: unknown;
    };

    const planId = payload.planId?.trim() || "";
    if (!planId) {
      return res.status(400).json({ message: "planId ausente." });
    }

    const result = await executeAiPlan(
      {
        scope: scope as "geral" | "negocio",
        businessId,
        planId,
        confirm: payload.confirm,
        overrides: payload.overrides as any,
      },
      {
        purchaseApprovalThreshold: deps.purchaseApprovalThreshold,
        applyPurchaseStock: deps.applyPurchaseStock as any,
        normalizeSaleItemsAndApplyStock: deps.normalizeSaleItemsAndApplyStock as any,
        generateInvoicePayload: deps.generateInvoicePayload as any,
      }
    );

    res.status(result.statusCode).json(result.body);
  });

  // ── Endpoint conversacional: perguntas, sugestões, análises ──
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    const { scope, businessId } = getScopeContext(req);
    if (scope === "geral") {
      return res.status(400).json({ message: "Selecione um ERP específico para usar o chat de IA." });
    }

    const { message, history } = req.body as {
      message?: string;
      history?: Array<{ role: "user" | "model"; text: string }>;
    };

    if (!message?.trim()) {
      return res.status(400).json({ message: "Mensagem vazia." });
    }

    if (!isGroqAvailable()) {
      return res.status(503).json({ message: "IA não configurada. Adicione GROQ_API_KEY no servidor." });
    }

    // Coleta contexto do negócio para a IA pensar sobre o negócio real
    const [products, recentSales, recentExpenses] = await Promise.all([
      ProductModel.find({ businessId, active: true }).select("name sku price cost stock minStock description").limit(50),
      SaleModel.find({ businessId, status: { $ne: "CANCELADO" } })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("totalAmount paymentMethod status createdAt items"),
      ExpenseModel.find({ businessId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("description amount status category"),
    ]);

    const productsSummary = products
      .map((p) => `- ${p.name} (SKU: ${p.sku}) | Preço: R$${p.price} | Custo: R$${p.cost} | Estoque: ${p.stock}${p.minStock ? ` (mín ${p.minStock})` : ""}${p.description ? ` | ${p.description}` : ""}`)
      .join("\n");

    const salesSummary = recentSales
      .map((s) => `- R$${s.totalAmount} via ${s.paymentMethod} [${s.status}] em ${new Date(s.createdAt as unknown as string).toLocaleDateString("pt-BR")}`)
      .join("\n");

    const expensesSummary = recentExpenses
      .map((e) => `- ${e.description}: R$${e.amount} [${e.status}] categoria: ${e.category || "geral"}`)
      .join("\n");

    const systemPrompt = `Você é a IA integrada ao ERP E-Sentinel, um assistente empresarial inteligente para pequenas empresas no Brasil.

CONTEXTO DO NEGÓCIO (dados reais do banco de dados):

PRODUTOS CADASTRADOS (${products.length}):
${productsSummary || "Nenhum produto cadastrado ainda."}

VENDAS RECENTES:
${salesSummary || "Nenhuma venda registrada."}

DESPESAS RECENTES:
${expensesSummary || "Nenhuma despesa registrada."}

SUAS CAPACIDADES:
- Analisar o negócio com base nos dados reais acima
- Sugerir produtos para comprar quando o estoque está baixo
- Identificar produtos mais rentáveis (maior margem: preço - custo)
- Sugerir estratégias de precificação e promoções
- Responder dúvidas sobre gestão, vendas, finanças
- Fazer análises e previsões com base nos dados
- Criar conteúdo (descrições de produtos, mensagens para clientes)
- Responder qualquer pergunta de negócios ou geral

REGRAS:
- Responda sempre em português brasileiro
- Seja direto, útil e profissional
- Quando mencionar produtos ou valores, use os dados reais acima
- Se não souber algo específico do negócio, diga claramente
- Para executar ações (comprar, vender, cadastrar), instrua o usuário a usar os comandos do ERP`;

    try {
      const mappedHistory = (history || []).map(
        (h): { role: "assistant" | "user"; content: string } => ({
          role: h.role === "model" ? "assistant" : "user",
          content: h.text,
        })
      );
      const reply =
        (await groqChat(
          [
            { role: "system", content: systemPrompt },
            ...mappedHistory,
            { role: "user", content: message.trim() },
          ],
          { temperature: 0.4, maxTokens: 900 }
        )) || "";
      return res.json({ reply, model: GROQ_MODEL });
    } catch (err: any) {
      const errorMsg = err?.message || "Erro na IA";
      return res.status(500).json({ message: `Erro ao consultar Groq: ${errorMsg}` });
    }
  });
}

