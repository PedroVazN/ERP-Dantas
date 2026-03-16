export type Theme = "claro" | "escuro" | "oceano" | "sabonete" | "rosa" | "neutro";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type Business = {
  _id: string;
  businessId: string;
  name: string;
  active: boolean;
};

export type Customer = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  status: "ATIVO" | "INATIVO";
};

export type Product = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  active: boolean;
};

export type Sale = {
  _id: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  billingStatus?: "PENDENTE" | "FATURADO" | "CANCELADO";
  invoice?: {
    number?: string;
    key?: string;
    status?: "EMITIDA" | "PENDENTE" | "CANCELADA";
    issuedAt?: string;
    xmlUrl?: string;
  };
  paymentReference?: {
    provider?: string;
    chargeId?: string;
    status?: string;
    paidAt?: string;
  };
};

export type Purchase = {
  _id: string;
  supplier: string;
  totalAmount: number;
  status: "ABERTA" | "AGUARDANDO_APROVACAO" | "APROVADA" | "RECEBIDA" | "REJEITADA" | "CANCELADA";
  createdAt: string;
  approval?: {
    required?: boolean;
    status?: "PENDENTE" | "APROVADA" | "REJEITADA";
    requestedBy?: string;
    requestedAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reason?: string;
  };
};

export type Expense = {
  _id: string;
  description: string;
  category: string;
  amount: number;
  status: "PAGO" | "PENDENTE" | "AGUARDANDO_APROVACAO" | "REJEITADO";
  dueDate: string;
  paymentDate?: string;
  approval?: {
    required?: boolean;
    status?: "PENDENTE" | "APROVADA" | "REJEITADA";
    requestedBy?: string;
    requestedAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reason?: string;
  };
};

export type Dashboard = {
  revenue: number;
  expenses: number;
  profit: number;
  salesCount: number;
  purchaseCount: number;
  lowStock: Product[];
};

export type BiTimeseriesPoint = {
  period: string;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export type BiStockRisk = {
  productId: string;
  name: string;
  stock: number;
  minStock: number;
  avgDailySold: number;
  projectedDaysToStockout: number | null;
};

export type BiInsights = {
  updatedAt: string;
  kpis: {
    revenue: number;
    expenses: number;
    profit: number;
    margin: number;
    salesCount: number;
    averageTicket: number;
    costRatio: number;
    revenueGrowth: number;
    profitGrowth: number;
  };
  timeseries: BiTimeseriesPoint[];
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  costByCategory: Array<{ category: string; total: number }>;
  forecast: {
    nextRevenue: number;
    nextExpenses: number;
    nextProfit: number;
    confidence: "baixa" | "media";
    stockRisk: BiStockRisk[];
  };
};

export type Settings = {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  companyName: string;
  theme: Theme;
  currency: string;
  taxRate: number;
};

export type PixCheckout = {
  checkoutId: string;
  status: string;
  amount: number;
  brCode: string;
  qrCodeBase64: string;
  expiresAt?: string;
  receiverKey?: string;
  product: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
  };
};

export type PixCheckoutStatus = {
  checkoutId: string;
  status: string;
  paid: boolean;
  expiresAt?: string;
  qrCodeBase64?: string;
  brCode?: string;
};
