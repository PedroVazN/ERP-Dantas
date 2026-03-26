import crypto from "node:crypto";

import { escapeRegExp, slugify } from "../../lib/normalizers";
import { extractAiIntent } from "./extractAiIntent";
import { geminiExtractIntent, geminiGenerateProductDetails } from "./geminiIntentExtractor";
import { getGeminiClient, isGeminiAvailable, GEMINI_MODEL } from "./geminiClient";
import { aiPlanStore } from "./aiPlanStore";
import type { AiPlanAction, AiPlanRecord } from "./types";
import type { AiProductDraft, AiPurchaseDraft } from "./types";
import { ExpenseModel, ProductModel, SaleModel, SupplierModel } from "../../models";
import { buildLocalChatReply } from "./localChatResponder";

export async function createAiPlan(params: {
  scope: "geral" | "negocio";
  businessId: string;
  message: string;
  purchaseApprovalThreshold: number;
  aiPlanTtlMs: number;
  autoApprovePurchasesForAi: boolean;
}) {
  const { scope, businessId, message, purchaseApprovalThreshold, aiPlanTtlMs, autoApprovePurchasesForAi } = params;

  // Cleanup de planos expirados
  const now = Date.now();
  for (const [id, record] of aiPlanStore.entries()) {
    if (record.expiresAt <= now) aiPlanStore.delete(id);
  }

  // Tenta Gemini primeiro, fallback para regras
  const geminiResult = await geminiExtractIntent(message);
  let extracted = geminiResult ?? extractAiIntent(message);

  // Se Gemini está disponível e a intenção continua desconhecida,
  // redireciona para chat em vez de mostrar mensagem de erro genérica
  if (extracted.intent === "unknown" && isGeminiAvailable()) {
    extracted = { intent: "chat" };
  }

  const warnings: string[] = [];
  const questions: string[] = [];
  const actions: AiPlanAction[] = [];

  let status: AiPlanRecord["status"] = "READY";
  let summary = "";
  let actionsPreview: string[] = [];
  let source: AiPlanRecord["source"] = geminiResult ? "gemini" : "rules";
  let productDraft: AiProductDraft | undefined;
  let purchaseDraft: AiPurchaseDraft | undefined;

  const intent = extracted.intent;

  // Intent "chat": responde conversacionalmente com contexto do negócio
  if (intent === "chat") {
    const geminiClient = getGeminiClient();

    // Sempre carrega dados do negócio (usados pelo Gemini ou pelo fallback local)
    const [products, recentSales] = await Promise.all([
      ProductModel.find({ businessId, active: true })
        .select("name price cost stock minStock description")
        .limit(50),
      SaleModel.find({ businessId, status: { $ne: "CANCELADO" } })
        .sort({ createdAt: -1 })
        .limit(15)
        .select("totalAmount paymentMethod"),
    ]);

    let chatReply: string | null = null;

    if (geminiClient) {
      try {
        const productsSummary = products
          .map((p) => `${p.name}: R$${p.price} (custo R$${p.cost}, estoque ${p.stock}, mín ${p.minStock})`)
          .join("; ");
        const salesSummary = recentSales
          .map((s) => `R$${s.totalAmount} via ${s.paymentMethod}`)
          .join("; ");

        const systemPrompt = `Você é a IA do ERP E-Sentinel para pequenas empresas brasileiras.
Dados reais do negócio — use-os nas respostas:
Produtos (${products.length}): ${productsSummary || "nenhum cadastrado"}
Vendas recentes: ${salesSummary || "nenhuma"}
Responda em português, de forma útil e direta. Máximo 3 parágrafos.`;

        const model = geminiClient.getGenerativeModel({
          model: GEMINI_MODEL,
          systemInstruction: systemPrompt,
        });
        const result = await model.generateContent(message);
        chatReply = result.response.text();
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
        if (!isQuota) {
          // Erro inesperado — loga mas continua para fallback
          console.error("[Gemini chat error]", msg.slice(0, 200));
        }
        // chatReply permanece null → usa fallback local abaixo
      }
    }

    // Fallback local: responde com dados reais do banco sem IA externa
    if (!chatReply) {
      chatReply = buildLocalChatReply(
        message,
        products.map((p) => ({
          name: p.name as string,
          price: p.price as number,
          cost: p.cost as number,
          stock: p.stock as number,
          minStock: p.minStock as number,
          description: p.description as string | undefined,
        })),
        recentSales.map((s) => ({
          totalAmount: s.totalAmount as number,
          paymentMethod: s.paymentMethod as string,
        }))
      );
    }

    const planId = newPlanId();
    const record: AiPlanRecord = {
      planId,
      createdAt: new Date().toISOString(),
      expiresAt: now + aiPlanTtlMs,
      executed: false,
      scope: { scope: scope as "geral" | "negocio", businessId },
      status: "NEEDS_INFO",
      source,
      summary: chatReply,
      warnings: [],
      requiresConfirmation: false,
      questions: [],
    };
    aiPlanStore.set(planId, record);
    return {
      planId,
      status: "CHAT" as any,
      source: record.source,
      summary: chatReply,
      warnings: [],
      requiresConfirmation: false,
      questions: [],
      actionsPreview: [],
    };
  }

  if (intent === "unknown") {
    status = "NEEDS_INFO";
    questions.push(
      "Nao entendi a solicitacao. Exemplos: \"compre 20 sabonetes de cidreira\" ou \"vender 5 sabonete X\" ou \"cadastrar cliente Maria\"."
    );
  } else if (intent === "customer_create") {
    const name = extracted.customerName?.trim() || "";
    if (!name) {
      status = "NEEDS_INFO";
      questions.push("Informe o nome do cliente para cadastrar.");
    } else {
      const emailMatch = message.match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i);
      const phoneMatch =
        message.match(/(?:telefone|tel)\s*[:\-]?\s*([0-9+()\-\s]{8,})/i) ||
        message.match(/\b([0-9]{8,})\b/);
      const email = emailMatch?.[0]?.trim();
      const phone = phoneMatch?.[1]?.trim();

      actions.push({
        kind: "createCustomer",
        input: { name, email, phone },
        outputKey: "customerId",
      });
      summary = `Cadastrar cliente: ${name}`;
      actionsPreview = [`Criar cliente (${name})`];
    }
  } else if (intent === "purchase") {
    const quantity = extracted.quantity;
    const productName = extracted.productName?.trim() || "";
    const unitCost = extracted.unitCost;

    if (!quantity || quantity <= 0 || !productName) {
      status = "NEEDS_INFO";
      questions.push('Informe a quantidade e o nome do produto (ex.: "compre 20 sabonetes de cidreira").');
    } else {
      const regex = new RegExp(escapeRegExp(productName), "i");

      const suppliers = await SupplierModel.find({ businessId, status: "ATIVO" }).sort({ createdAt: -1 });
      const supplierOptions = suppliers.map((s) => ({ supplierId: String(s._id), supplierName: s.name }));

      if (suppliers.length === 0) {
        status = "NEEDS_INFO";
        questions.push("Cadastre ao menos 1 fornecedor ativo antes de eu criar uma compra.");
      } else {
        const productCandidates = await ProductModel.find({
          businessId,
          active: true,
          $or: [{ name: regex }, { sku: regex }, { productCode: regex }],
        }).populate("supplier", "name");

        const resolveSupplierId = (supplier: any): string | null => {
          if (!supplier) return null;
          if (typeof supplier === "string") return supplier;
          return supplier._id ? String(supplier._id) : null;
        };

        const resolveSupplierName = (supplier: any): string | null => {
          if (!supplier) return null;
          if (typeof supplier === "string") return null;
          return supplier.name ? String(supplier.name) : null;
        };

        const resolvedProducts = productCandidates
          .map((p) => ({
            productId: String(p._id),
            name: p.name as string,
            sku: p.sku as string,
            cost: p.cost as number,
            supplierId: resolveSupplierId((p as any).supplier),
            supplierName: resolveSupplierName((p as any).supplier),
          }))
          .filter((p) => p.supplierId && p.supplierName) as Array<{
          productId: string;
          name: string;
          sku: string;
          cost: number;
          supplierId: string;
          supplierName: string;
        }>;

        // Caso exista ao menos 1 produto compatível com fornecedor vinculado
        if (resolvedProducts.length > 0) {
          const defaultProduct = resolvedProducts[0];
          const defaultSupplierId = defaultProduct.supplierId;
          const defaultSupplierName = defaultProduct.supplierName;
          const defaultProductId = defaultProduct.productId;
          const defaultProductLabel = `${defaultProduct.name} (${defaultProduct.sku})`;

          const costToUse = unitCost ?? defaultProduct.cost ?? 0;
          const totalAmount = quantity * costToUse;
          const needsApproval = totalAmount >= purchaseApprovalThreshold;

          warnings.push(
            needsApproval
              ? "A compra provavelmente vai aguardar aprovaçao. Vou auto-aprovar (se permitido) para entrar no estoque."
              : "A compra entra no estoque imediatamente (abaixo do limite de aprovaçao)."
          );

          // Para o passo “escolher outros fornecedores”: agrupa os produtos candidatos por fornecedor.
          const productsBySupplierId: Record<string, Array<{ productId: string; label: string }>> = {};
          for (const p of resolvedProducts) {
            const label = `${p.name} (${p.sku})`;
            if (!productsBySupplierId[p.supplierId]) productsBySupplierId[p.supplierId] = [];
            productsBySupplierId[p.supplierId].push({ productId: p.productId, label });
          }

          const filteredSupplierOptions = supplierOptions.filter(
            (s) => (productsBySupplierId[s.supplierId] || []).length > 0
          );

          purchaseDraft = {
            mode: "productFound",
            supplierOptions: filteredSupplierOptions,
            productsBySupplierId,
            defaultSupplierId,
            defaultSupplierName,
            defaultProductId,
            defaultProductLabel,
          };

          actions.push({
            kind: "createPurchase",
            input: {
              supplierName: defaultSupplierName,
              productId: defaultProductId,
              quantity,
              cost: costToUse,
              autoApprove: autoApprovePurchasesForAi,
            },
            outputKey: "purchaseId",
          });

          status = "READY";
          summary = `Comprar ${quantity}x ${defaultProduct.name}`;
          actionsPreview = [
            `Criar compra de ${quantity}x ${defaultProduct.name} (custo unit.: R$ ${costToUse.toFixed(2)})`,
          ];
        } else {
          // Produto não existe (ou não tem fornecedor vinculado): cria no momento de execução.
          // Supplier tem que ser escolha vinda do banco de dados (direto, sem sugestao).
          const defaultSupplier = suppliers[0];
          const supplierId = String(defaultSupplier._id);
          const supplierName = defaultSupplier.name;

          const sku = `${slugify(productName)}-${Date.now().toString().slice(-6)}`;
          const suggestedProductCode = slugify(productName).replace(/-/g, "").slice(0, 12);
          const costToUse = unitCost ?? 0;

          // Gemini gera descrição e preço inteligentes para o produto
          const geminiDetails = await geminiGenerateProductDetails(productName);
          const suggestedDescription = geminiDetails?.description ?? `${productName} — produto cadastrado via IA`;
          const suggestedPrice = geminiDetails?.suggestedPrice ?? 10;
          const suggestedMinStock = geminiDetails?.minStock ?? 10;

          productDraft = {
            kind: "createProduct",
            missingForIntent: "purchase",
            suggested: {
              name: productName,
              sku,
              productCode: suggestedProductCode,
              description: suggestedDescription,
              supplierId,
              price: suggestedPrice,
              cost: costToUse,
              stock: 0,
              minStock: suggestedMinStock,
              active: true,
            },
            requiredFields: ["name", "sku", "productCode", "description", "price"],
            options: {
              name: [productName],
              sku: [sku, `${slugify(productName)}-${Date.now().toString().slice(-4)}`],
              productCode: [
                suggestedProductCode,
                `${suggestedProductCode.slice(0, 8)}${sku.slice(-4)}`.slice(0, 12),
              ],
              description: [suggestedDescription, `${productName} — item de reposição`, `${productName}`],
              price: [suggestedPrice, Math.round(suggestedPrice * 1.2), Math.round(suggestedPrice * 0.85)].filter((v, i, a) => a.indexOf(v) === i),
            },
          };

          actions.push({
            kind: "createProduct",
            input: {
              name: productName,
              sku,
              productCode: suggestedProductCode,
              description: suggestedDescription,
              supplierId,
              price: suggestedPrice,
              cost: costToUse,
              stock: 0,
              minStock: suggestedMinStock,
              active: true,
            },
            outputKey: "productId",
          });
          actions.push({
            kind: "createPurchase",
            input: {
              supplierName,
              productRefKey: "productId",
              quantity,
              cost: costToUse,
              autoApprove: autoApprovePurchasesForAi,
            },
            outputKey: "purchaseId",
          });

          purchaseDraft = {
            mode: "productMissing",
            supplierOptions,
            defaultSupplierId: supplierId,
          };

          status = "READY";
          warnings.push(
            "Produto nao existia (ou nao possui fornecedor vinculado). Vou criar usando valores sugeridos. Revise (ou digite) antes de executar."
          );
          summary = `Comprar ${quantity}x ${productName} (com criação do produto se necessário)`;
          actionsPreview = [
            `Criar produto: ${productName} (SKU: ${sku})`,
            `Criar compra de ${quantity}x ${productName} (custo unit.: R$ ${costToUse.toFixed(2)})`,
          ];
        }
      }
    }
  } else if (intent === "sale") {
    const quantity = extracted.quantity;
    const productName = extracted.productName?.trim() || "";
    const unitPrice = extracted.unitPrice;

    if (!quantity || quantity <= 0 || !productName) {
      status = "NEEDS_INFO";
      questions.push('Informe a quantidade e o nome do produto (ex.: "vender 5 sabonete X").');
    } else {
      const regex = new RegExp(escapeRegExp(productName), "i");
      const product = await ProductModel.findOne({
        businessId,
        active: true,
        $or: [{ name: regex }, { sku: regex }, { productCode: regex }],
      });

      if (!product) {
        status = "NEEDS_INFO";
        questions.push("Produto nao encontrado no cadastro. Cadastre o produto para a IA vender.");
      } else if (product.stock < quantity) {
        status = "NEEDS_INFO";
        questions.push(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock}.`);
      } else {
        const paymentMethod = extracted.paymentMethod || "PIX";
        const priceToUse = unitPrice ?? product.price;

        actions.push({
          kind: "createSale",
          input: {
            productId: String(product._id),
            quantity,
            unitPrice: priceToUse,
            paymentMethod,
          },
          outputKey: "saleId",
        });

        summary = `Vender ${quantity}x ${product.name}`;
        actionsPreview = [`Criar venda de ${quantity}x ${product.name} (preço unit.: R$ ${priceToUse.toFixed(2)})`];
      }
    }
  }

  // Se chegou aqui com status READY, actions deve ter conteúdo.
  const planId = newPlanId();
  const record: AiPlanRecord = {
    planId,
    createdAt: new Date().toISOString(),
    expiresAt: now + aiPlanTtlMs,
    executed: false,
    scope: { scope: scope as "geral" | "negocio", businessId },
    status,
    source,
    summary: summary || "Planejamento pronto",
    warnings,
    requiresConfirmation: status === "READY",
    questions: status === "NEEDS_INFO" ? questions : undefined,
    actions: status === "READY" ? actions : undefined,
    actionsPreview: status === "READY" ? actionsPreview : undefined,
    productDraft: productDraft,
    purchaseDraft,
  };

  aiPlanStore.set(planId, record);

  return {
    planId,
    status: record.status,
    source: record.source,
    summary: record.summary,
    warnings: record.warnings,
    requiresConfirmation: record.requiresConfirmation,
    questions: record.questions,
    actionsPreview: record.actionsPreview,
    productDraft: record.productDraft,
    purchaseDraft: record.purchaseDraft,
  };
}

function newPlanId() {
  return crypto.randomBytes(16).toString("hex");
}

