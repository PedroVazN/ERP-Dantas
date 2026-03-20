import { Types } from "mongoose";

import { aiPlanStore } from "./aiPlanStore";
import type { AiPlanAction, AiPlanRecord } from "./types";
import { CustomerModel, ProductModel, PurchaseModel, SaleModel, type SaleItemInput } from "../../models";

export async function executeAiPlan(
  params: {
    scope: "geral" | "negocio";
    businessId: string;
    planId: string;
    confirm: boolean | string | undefined;
    overrides?: {
      createProduct?: Partial<Extract<AiPlanAction, { kind: "createProduct" }>["input"]>;
    };
  },
  deps: {
    purchaseApprovalThreshold: number;
    applyPurchaseStock: (
      businessId: string,
      items: Array<{ product?: Types.ObjectId; quantity: number; cost: number }>
    ) => Promise<void>;
    normalizeSaleItemsAndApplyStock: (
      businessId: string,
      items: SaleItemInput[]
    ) => Promise<Array<{ total: number }>>;
    generateInvoicePayload: (...args: any[]) => any;
  }
) {
  const { scope, businessId, planId, confirm, overrides } = params;
  const { purchaseApprovalThreshold, applyPurchaseStock, normalizeSaleItemsAndApplyStock, generateInvoicePayload } = deps;

  const record = aiPlanStore.get(planId) as AiPlanRecord | undefined;
  if (!record) {
    return {
      statusCode: 404,
      body: { ok: false, message: "Plano nao encontrado ou expirado." },
    };
  }

  if (record.expiresAt <= Date.now()) {
    aiPlanStore.delete(planId);
    return { statusCode: 400, body: { ok: false, message: "Plano expirado." } };
  }

  if (record.scope.scope !== scope || record.scope.businessId !== businessId) {
    return { statusCode: 400, body: { ok: false, message: "Plano nao pertence ao escopo atual." } };
  }

  const isConfirmed = confirm === true || confirm === "I_CONFIRM";
  if (!isConfirmed) {
    return { statusCode: 400, body: { ok: false, message: "Confirmação necessária para executar." } };
  }

  if (record.executed) {
    return {
      statusCode: 200,
      body: { ok: true, planId: record.planId, executedAt: new Date().toISOString(), results: {} },
    };
  }

  if (record.status !== "READY" || !record.actions) {
    return { statusCode: 400, body: { ok: false, message: "Plano não está pronto para execução." } };
  }

  // Executor (rule-based / MVP)
  const refs: Record<string, string> = {};
  const results: Record<string, unknown> = {};
  const runtimeWarnings = [...record.warnings];
  const errors: string[] = [];

  try {
    for (const action of record.actions) {
      if (action.kind === "createCustomer") {
        const customer = await CustomerModel.create({
          businessId,
          name: action.input.name.trim(),
          email: action.input.email?.trim() || undefined,
          phone: action.input.phone?.trim() || undefined,
          status: "ATIVO",
        });
        refs[action.outputKey] = String(customer._id);
        results[action.outputKey] = customer._id;
      }

      if (action.kind === "createProduct") {
        const mergedInput: Extract<AiPlanAction, { kind: "createProduct" }>["input"] = {
          ...action.input,
          ...(overrides?.createProduct || {}),
        };
        const product = await ProductModel.create({
          businessId,
          name: mergedInput.name.trim(),
          sku: mergedInput.sku.trim(),
          productCode: mergedInput.productCode?.trim() || undefined,
          description: mergedInput.description?.trim() || undefined,
          supplier: new Types.ObjectId(mergedInput.supplierId),
          price: mergedInput.price,
          cost: mergedInput.cost,
          stock: mergedInput.stock,
          minStock: mergedInput.minStock,
          active: mergedInput.active,
        });
        refs[action.outputKey] = String(product._id);
        results[action.outputKey] = product._id;
      }

      if (action.kind === "createPurchase") {
        const productId =
          action.input.productId || (action.input.productRefKey ? refs[action.input.productRefKey] : undefined);
        if (!productId) {
          throw new Error("Produto não resolvido para compra.");
        }

        const product = await ProductModel.findOne({ _id: productId, businessId }).populate("supplier", "name");
        if (!product) {
          throw new Error("Produto não encontrado para compra.");
        }

        const supplierName = (product as any).supplier?.name as string | undefined | null;
        if (!supplierName) {
          throw new Error(`Produto "${product.name}" nao possui fornecedor vinculado no cadastro.`);
        }

        const quantity = action.input.quantity;
        const cost = action.input.cost;
        const totalAmount = quantity * cost;
        const needsApproval = totalAmount >= purchaseApprovalThreshold;

        const normalizedItems = [
          {
            product: new Types.ObjectId(productId),
            description: product.name,
            quantity,
            cost,
            total: quantity * cost,
          },
        ];

        if (!needsApproval) {
          await applyPurchaseStock(
            businessId,
            normalizedItems as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>
          );
        }

        const purchase = await PurchaseModel.create({
          businessId,
          supplier: supplierName,
          items: normalizedItems,
          status: needsApproval ? "AGUARDANDO_APROVACAO" : "RECEBIDA",
          approval: {
            required: needsApproval,
            status: needsApproval ? "PENDENTE" : "APROVADA",
            requestedBy: "Sistema",
            requestedAt: new Date(),
          },
          stockApplied: !needsApproval,
          totalAmount,
        });

        if (needsApproval && action.input.autoApprove) {
          await applyPurchaseStock(
            businessId,
            normalizedItems as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>
          );
          purchase.stockApplied = true;
          purchase.status = "RECEBIDA";
          if (purchase.approval) {
            purchase.approval.status = "APROVADA";
            purchase.approval.reviewedBy = "IA";
            purchase.approval.reviewedAt = new Date();
            purchase.approval.reason = "Auto-aprovado pela IA.";
          }
          await purchase.save();
        }

        refs[action.outputKey] = String(purchase._id);
        results[action.outputKey] = purchase._id;

        if (needsApproval && action.input.autoApprove) {
          runtimeWarnings.push("Compra acima do limite: auto-aprovada pela IA para aplicar estoque.");
        }
      }

      if (action.kind === "createSale") {
        const items: SaleItemInput[] = [
          {
            product: new Types.ObjectId(action.input.productId),
            quantity: action.input.quantity,
            unitPrice: action.input.unitPrice,
          },
        ];

        const normalizedItems = await normalizeSaleItemsAndApplyStock(businessId, items);
        const totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.total, 0);

        const sale = await SaleModel.create({
          businessId,
          items: normalizedItems,
          paymentMethod: action.input.paymentMethod,
          status: "PAGO",
          billingStatus: "FATURADO",
          invoice: generateInvoicePayload(businessId, new Types.ObjectId().toString(), "EMITIDA"),
          totalAmount,
          createdBy: "IA",
        });

        if ((sale as any).invoice?.key) {
          sale.invoice = generateInvoicePayload(businessId, String(sale._id), "EMITIDA");
          await sale.save();
        }

        refs[action.outputKey] = String(sale._id);
        results[action.outputKey] = sale._id;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao executar plano";
    errors.push(message);
  }

  if (errors.length) {
    return { statusCode: 400, body: { ok: false, planId, error: errors[0] } };
  }

  record.executed = true;
  aiPlanStore.set(planId, record);

  return {
    statusCode: 200,
    body: {
      ok: true,
      planId,
      executedAt: new Date().toISOString(),
      results,
      warnings: runtimeWarnings,
    },
  };
}

