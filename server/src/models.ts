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
    productCode: { type: String, trim: true }, // Código do produto
    description: { type: String, trim: true }, // Descrição do produto
    category: { type: String, trim: true, default: "SABONETE" },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    minStock: { type: Number, required: true, min: 0, default: 10 },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
    active: { type: Boolean, default: true },
    // Foto do produto (armazenada no MongoDB). Evitamos retornar o buffer nas listagens,
    // então `photoData` fica `select: false`.
    photoContentType: { type: String, default: null },
    photoData: { type: Buffer, select: false },
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
    billingStatus: {
      type: String,
      enum: ["PENDENTE", "FATURADO", "CANCELADO"],
      default: "FATURADO",
    },
    invoice: {
      number: { type: String, trim: true },
      key: { type: String, trim: true },
      status: { type: String, enum: ["EMITIDA", "PENDENTE", "CANCELADA"], default: "EMITIDA" },
      issuedAt: { type: Date },
      xmlUrl: { type: String, trim: true },
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
      enum: ["ABERTA", "AGUARDANDO_APROVACAO", "APROVADA", "RECEBIDA", "REJEITADA", "CANCELADA"],
      default: "RECEBIDA",
    },
    approval: {
      required: { type: Boolean, default: false },
      status: { type: String, enum: ["PENDENTE", "APROVADA", "REJEITADA"], default: "APROVADA" },
      requestedBy: { type: String, trim: true, default: "Sistema" },
      requestedAt: { type: Date },
      reviewedBy: { type: String, trim: true },
      reviewedAt: { type: Date },
      reason: { type: String, trim: true },
    },
    stockApplied: { type: Boolean, default: true },
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
      enum: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO", "REJEITADO"],
      default: "PENDENTE",
    },
    approval: {
      required: { type: Boolean, default: false },
      status: { type: String, enum: ["PENDENTE", "APROVADA", "REJEITADA"], default: "APROVADA" },
      requestedBy: { type: String, trim: true, default: "Sistema" },
      requestedAt: { type: Date },
      reviewedBy: { type: String, trim: true },
      reviewedAt: { type: Date },
      reason: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

const checklistItemSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    title: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
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
      enum: ["claro", "escuro", "oceano", "sabonete", "rosa", "neutro"],
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

const supplierSchema = new mongoose.Schema(
  {
    businessId: { type: String, default: "geral", index: true },
    name: { type: String, required: true, trim: true },
    document: { type: String, trim: true }, // CNPJ ou CPF (opcional)
    contact: { type: String, required: true, trim: true }, // Telefone
    pixKey: { type: String, trim: true }, // Chave PIX
    city: { type: String, trim: true }, // Cidade
    businessArea: { type: String, trim: true }, // Ramo de atuação
    paymentCondition: {
      type: String,
      enum: ["BOLETO", "PIX", "DINHEIRO", "CREDITO"],
      default: "PIX",
    }, // Condição de pagamento
    status: {
      type: String,
      enum: ["ATIVO", "INATIVO"],
      default: "ATIVO",
    },
  },
  { timestamps: true }
);

settingSchema.index({ userId: 1 }, { unique: true });

export const CustomerModel = mongoose.model("Customer", customerSchema);
export const ProductModel = mongoose.model("Product", productSchema);
export const SaleModel = mongoose.model("Sale", saleSchema);
export const PurchaseModel = mongoose.model("Purchase", purchaseSchema);
export const ExpenseModel = mongoose.model("Expense", expenseSchema);
export const ChecklistItemModel = mongoose.model("ChecklistItem", checklistItemSchema);
export const SettingModel = mongoose.model("Setting", settingSchema);
export const BusinessModel = mongoose.model("Business", businessSchema);
export const SupplierModel = mongoose.model("Supplier", supplierSchema);

export type SaleItemInput = {
  product: Types.ObjectId;
  quantity: number;
  unitPrice: number;
};

export type Customer = InferSchemaType<typeof customerSchema>;
export type Product = InferSchemaType<typeof productSchema>;
export type Supplier = InferSchemaType<typeof supplierSchema>;
