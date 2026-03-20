import crypto from "node:crypto";

import { escapeRegExp, slugify } from "../../lib/normalizers";
import { extractAiIntent } from "./extractAiIntent";
import { aiPlanStore } from "./aiPlanStore";
import type { AiPlanAction, AiPlanRecord } from "./types";
import type { AiProductDraft } from "./types";
import { ProductModel, SupplierModel } from "../../models";

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

  const extracted = extractAiIntent(message);
  const warnings: string[] = [];
  const questions: string[] = [];
  const actions: AiPlanAction[] = [];

  let status: AiPlanRecord["status"] = "READY";
  let summary = "";
  let actionsPreview: string[] = [];
  let source: AiPlanRecord["source"] = "rules";
  let productDraft: AiProductDraft | undefined;

  const intent = extracted.intent;
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
      const phoneMatch = message.match(/(?:telefone|tel)\s*[:\-]?\s*([0-9+()\-\s]{8,})/i);
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
      const product = await ProductModel.findOne({
        businessId,
        active: true,
        $or: [{ name: regex }, { sku: regex }, { productCode: regex }],
      }).populate("supplier", "name");

      const fallbackSupplier = await SupplierModel.findOne({ businessId, status: "ATIVO" });

      if (!product && !fallbackSupplier) {
        status = "NEEDS_INFO";
        questions.push("Cadastre ao menos 1 fornecedor ativo antes de eu criar uma compra.");
      } else if (product) {
        const supplierName = (product as any).supplier?.name as string | null | undefined;
        if (!supplierName) {
          status = "NEEDS_INFO";
          questions.push(`Vincule um fornecedor no produto "${product.name}" para eu poder comprar.`);
        } else {
          const costToUse = unitCost ?? product.cost ?? 0;
          const totalAmount = quantity * costToUse;
          const needsApproval = totalAmount >= purchaseApprovalThreshold;

          warnings.push(
            needsApproval
              ? "A compra provavelmente vai aguardar aprovaçao. Vou auto-aprovar (se permitido) para entrar no estoque."
              : "A compra entra no estoque imediatamente (abaixo do limite de aprovaçao)."
          );

          actions.push({
            kind: "createPurchase",
            input: {
              supplierName,
              productId: String(product._id),
              quantity,
              cost: costToUse,
              autoApprove: autoApprovePurchasesForAi,
            },
            outputKey: "purchaseId",
          });
          summary = `Comprar ${quantity}x ${product.name}`;
          actionsPreview = [`Criar compra de ${quantity}x ${product.name} (custo unit.: R$ ${costToUse.toFixed(2)})`];
        }
      } else {
        // Produto não existe: cria produto no momento de execução com defaults e compra logo em seguida.
        const supplierId = String(fallbackSupplier!._id);
        const supplierName = fallbackSupplier!.name;
        const sku = `${slugify(productName)}-${Date.now().toString().slice(-6)}`;
        const suggestedProductCode = slugify(productName).replace(/-/g, "").slice(0, 12);
        const costToUse = unitCost ?? 0;
        const suggestedDescription = productName;
        const suggestedPrice = costToUse; // valor inicial sugerido; pode ser ajustado antes de executar

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
            minStock: 10,
            active: true,
          },
          requiredFields: ["name", "sku", "productCode", "description", "price"],
          options: {
            name: [productName, productName.replace(/^\w/, (c) => c.toUpperCase())],
            sku: [sku, `${slugify(productName)}-${Date.now().toString().slice(-4)}`],
            productCode: [suggestedProductCode, `${suggestedProductCode.slice(0, 8)}${sku.slice(-4)}`.slice(0, 12)],
            description: [suggestedDescription, `Sabonete ${productName}`],
            price:
              costToUse > 0
                ? [costToUse, Number((costToUse * 1.2).toFixed(2)), Number((costToUse * 1.5).toFixed(2))]
                : [0, 1, 5],
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
            minStock: 10,
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

        status = "READY";
        warnings.push("Produto nao existia. Vou criar usando valores sugeridos. Revise os campos do produto antes de executar.");
        summary = `Comprar ${quantity}x ${productName} (com criação do produto se necessário)`;
        actionsPreview = [
          `Criar produto: ${productName} (SKU: ${sku})`,
          `Criar compra de ${quantity}x ${productName} (custo unit.: R$ ${costToUse.toFixed(2)})`,
        ];
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
  };
}

function newPlanId() {
  return crypto.randomBytes(16).toString("hex");
}

