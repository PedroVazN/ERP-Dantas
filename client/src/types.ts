export type Theme = "claro" | "escuro" | "oceano" | "sabonete" | "rosa";

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
};

export type Purchase = {
  _id: string;
  supplier: string;
  totalAmount: number;
  status: string;
  createdAt: string;
};

export type Expense = {
  _id: string;
  description: string;
  category: string;
  amount: number;
  status: "PAGO" | "PENDENTE";
  dueDate: string;
};

export type Dashboard = {
  revenue: number;
  expenses: number;
  profit: number;
  salesCount: number;
  purchaseCount: number;
  lowStock: Product[];
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
