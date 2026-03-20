export type AiIntent = "purchase" | "sale" | "customer_create" | "unknown";

export type AiPlanAction =
  | {
      kind: "createCustomer";
      input: { name: string; email?: string; phone?: string };
      outputKey: "customerId";
    }
  | {
      kind: "createProduct";
      input: {
        name: string;
        sku: string;
        productCode?: string;
        description?: string;
        supplierId: string;
        price: number;
        cost: number;
        stock: number;
        minStock: number;
        active: boolean;
      };
      outputKey: "productId";
    }
  | {
      kind: "createPurchase";
      input: {
        supplierName: string;
        productId?: string;
        productRefKey?: "productId";
        quantity: number;
        cost: number;
        autoApprove: boolean;
      };
      outputKey: "purchaseId";
    }
  | {
      kind: "createSale";
      input: {
        productId: string;
        quantity: number;
        unitPrice: number;
        paymentMethod: "PIX" | "DINHEIRO" | "CARTAO" | "BOLETO" | "TRANSFERENCIA";
      };
      outputKey: "saleId";
    };

export type AiPlanRecord = {
  planId: string;
  createdAt: string;
  expiresAt: number;
  executed: boolean;
  scope: { scope: "geral" | "negocio"; businessId: string };
  status: "READY" | "NEEDS_INFO" | "ERROR";
  source: "rules" | "openrouter";
  summary: string;
  warnings: string[];
  requiresConfirmation: boolean;
  questions?: string[];
  actions?: AiPlanAction[];
  actionsPreview?: string[];
  productDraft?: AiProductDraft;
};

export type AiProductDraftField = "name" | "sku" | "productCode" | "description" | "price";

export type AiProductDraft = {
  kind: "createProduct";
  missingForIntent: "purchase" | "sale";
  suggested: {
    name: string;
    sku: string;
    productCode?: string;
    description?: string;
    supplierId: string;
    price: number;
    cost: number;
    stock: number;
    minStock: number;
    active: boolean;
  };
  requiredFields: AiProductDraftField[];
  options: {
    name: string[];
    sku: string[];
    productCode: string[];
    description: string[];
    price: number[];
  };
};

