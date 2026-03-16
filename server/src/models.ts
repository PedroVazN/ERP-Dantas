import mongoose, { InferSchemaType, Types } from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    document: { type: String, trim: true },
    address: { type: String, trim: true },
    status: {
      type: String,
      enum: ["ATIVO", "INATIVO"],
      default: "ATIVO",
    },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    category: { type: String, trim: true, default: "SABONETE" },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    minStock: { type: Number, required: true, min: 0, default: 10 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    items: { type: [saleItemSchema], required: true },
    paymentMethod: {
      type: String,
      enum: ["DINHEIRO", "PIX", "CARTAO", "BOLETO", "TRANSFERENCIA"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PAGO", "PENDENTE", "CANCELADO"],
      default: "PAGO",
    },
    totalAmount: { type: Number, required: true, min: 0 },
    saleDate: { type: Date, default: Date.now },
    createdBy: { type: String, default: "Sistema" },
  },
  { timestamps: true }
);

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    cost: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    supplier: { type: String, required: true, trim: true },
    items: { type: [purchaseItemSchema], required: true },
    status: {
      type: String,
      enum: ["ABERTA", "RECEBIDA", "CANCELADA"],
      default: "RECEBIDA",
    },
    totalAmount: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const expenseSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    paymentDate: { type: Date },
    status: {
      type: String,
      enum: ["PAGO", "PENDENTE"],
      default: "PENDENTE",
    },
  },
  { timestamps: true }
);

const settingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, default: "admin" },
    userName: { type: String, default: "Administrador" },
    userEmail: { type: String, default: "" },
    userRole: { type: String, default: "Gestor" },
    companyName: { type: String, default: "E-Sentinel Sabonetes" },
    currency: { type: String, default: "BRL" },
    taxRate: { type: Number, default: 0 },
    theme: {
      type: String,
      enum: ["claro", "escuro", "oceano", "sabonete", "rosa"],
      default: "claro",
    },
  },
  { timestamps: true }
);

const businessSchema = new mongoose.Schema(
  {
    businessId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

settingSchema.index({ userId: 1 }, { unique: true });

export const CustomerModel = mongoose.model("Customer", customerSchema);
export const ProductModel = mongoose.model("Product", productSchema);
export const SaleModel = mongoose.model("Sale", saleSchema);
export const PurchaseModel = mongoose.model("Purchase", purchaseSchema);
export const ExpenseModel = mongoose.model("Expense", expenseSchema);
export const SettingModel = mongoose.model("Setting", settingSchema);
export const BusinessModel = mongoose.model("Business", businessSchema);

export type SaleItemInput = {
  product: Types.ObjectId;
  quantity: number;
  unitPrice: number;
};

export type Customer = InferSchemaType<typeof customerSchema>;
export type Product = InferSchemaType<typeof productSchema>;
