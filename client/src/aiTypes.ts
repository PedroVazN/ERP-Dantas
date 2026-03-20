export type AiPlanActionStatus = "READY" | "NEEDS_INFO" | "ERROR" | string;

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

export type AiPlan = {
  planId: string;
  status: AiPlanActionStatus;
  source: "rules" | "openrouter" | string;
  summary: string;
  warnings: string[];
  requiresConfirmation: boolean;
  questions?: string[];
  actionsPreview?: string[];
  productDraft?: AiProductDraft;
  purchaseDraft?: AiPurchaseDraft;
};

export type AiMessage = { id: string; role: "user" | "assistant"; content: string };

export type AiSupplierOption = {
  supplierId: string;
  supplierName: string;
};

export type AiProductOption = {
  productId: string;
  label: string;
};

export type AiPurchaseDraft =
  | {
      mode: "productFound";
      supplierOptions: AiSupplierOption[];
      productsBySupplierId: Record<string, AiProductOption[]>;
      defaultSupplierId: string;
      defaultSupplierName: string;
      defaultProductId: string;
      defaultProductLabel: string;
    }
  | {
      mode: "productMissing";
      supplierOptions: AiSupplierOption[];
      defaultSupplierId?: string;
    };

