import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import mongoose, { isValidObjectId, Types } from "mongoose";
import dns from "node:dns";
import {
  BusinessModel,
  ChecklistItemModel,
  CustomerModel,
  ExpenseModel,
  ProductModel,
  PurchaseModel,
  SaleItemInput,
  SaleModel,
  SettingModel,
  SupplierModel,
} from "./models";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const isVercel = process.env.VERCEL === "1";
const dnsServers = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const explicitAllowedOrigins = [
  ...(process.env.CLIENT_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  process.env.CLIENT_URL?.trim() || "",
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, ""));
const allowVercelPreviews = (process.env.ALLOW_VERCEL_PREVIEWS || "true").toLowerCase() === "true";
const purchaseApprovalThreshold = Number(process.env.PURCHASE_APPROVAL_THRESHOLD || 1500);
const expenseApprovalThreshold = Number(process.env.EXPENSE_APPROVAL_THRESHOLD || 800);
const whatsappApiUrl = (process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v20.0").replace(/\/$/, "");
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const whatsappNotifyTo = process.env.WHATSAPP_NOTIFY_TO?.trim();
let dbConnected = false;
let connectPromise: Promise<typeof mongoose> | null = null;

if (!mongoUri) {
  throw new Error("Defina MONGODB_URI no arquivo .env");
}

if (!adminEmail || !adminPassword) {
  throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env");
}

if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
  console.log(`DNS customizado para MongoDB: ${dnsServers.join(", ")}`);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, "");
      if (explicitAllowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      if (allowVercelPreviews) {
        try {
          const hostname = new URL(normalizedOrigin).hostname;
          if (hostname.endsWith(".vercel.app")) {
            return callback(null, true);
          }
        } catch {
          // Ignora origem malformada e cai no bloqueio abaixo.
        }
      }

      return callback(new Error("Origem nao permitida por CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

function getScopeContext(req: Request) {
  const scope = String(req.query.scope || "negocio");
  const bodyBusinessId =
    req.body && typeof req.body === "object" && "businessId" in req.body
      ? String((req.body as { businessId?: string }).businessId || "").trim()
      : "";
  const queryBusinessId = String(req.query.businessId || "").trim();
  const businessId = queryBusinessId || bodyBusinessId || "geral";
  return {
    scope: scope === "geral" ? "geral" : "negocio",
    businessId,
  };
}

function getBusinessFilter(req: Request) {
  const context = getScopeContext(req);
  if (context.scope === "geral") {
    return {};
  }
  return { businessId: context.businessId };
}

function blockWriteInGeneralScope(req: Request, res: Response) {
  const context = getScopeContext(req);
  if (context.scope === "geral") {
    res.status(400).json({
      message:
        "O ERP Geral e apenas para consolidacao. Selecione um ERP especifico para lancamentos.",
    });
    return true;
  }
  return false;
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

function safeGrowth(current: number, previous: number) {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function linearForecast(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length < 2) {
    return filtered[filtered.length - 1] || 0;
  }

  const n = filtered.length;
  const xMean = (n + 1) / 2;
  const yMean = filtered.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i + 1;
    numerator += (x - xMean) * (filtered[i] - yMean);
    denominator += (x - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  const forecast = intercept + slope * (n + 1);
  return Math.max(0, forecast);
}

function formatPeriodKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatPeriodLabel(periodKey: string) {
  const [year, month] = periodKey.split("-");
  const monthNames = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return `${monthNames[Number(month) - 1]}/${year.slice(2)}`;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Falha ao consultar ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSgsLatestValue(code: number) {
  try {
    const data = await fetchJsonWithTimeout<Array<{ valor: string }>>(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs/${code}/dados/ultimos/1?formato=json`
    );
    const rawValue = data[0]?.valor;
    if (!rawValue) return null;
    return Number(rawValue.replace(",", "."));
  } catch {
    return null;
  }
}

function generateInvoicePayload(businessId: string, saleId: string, status: "EMITIDA" | "PENDENTE") {
  const now = new Date();
  const seed = `${now.getTime()}`.slice(-8);
  const number = `NF-${businessId.toUpperCase()}-${seed}`;
  const key = `${businessId.replace(/[^a-z0-9]/gi, "").toUpperCase()}${saleId
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 20)}${seed}`;

  return {
    number,
    key,
    status,
    issuedAt: now,
    xmlUrl: `/api/invoices/${number}.xml`,
  };
}

function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Informe um telefone válido para WhatsApp.");
  }
  if (digits.startsWith("55")) {
    return digits;
  }
  return `55${digits}`;
}

async function sendWhatsAppTextMessage(toPhone: string, body: string) {
  if (!whatsappPhoneNumberId || !whatsappAccessToken) {
    throw new Error("Defina WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN no backend.");
  }

  const response = await fetch(`${whatsappApiUrl}/${whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${whatsappAccessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWhatsAppPhone(toPhone),
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (raw as { error?: { message?: string } })?.error?.message ||
      "Falha ao enviar mensagem pelo WhatsApp Business.";
    throw new Error(message);
  }
  return raw;
}

function isWhatsAppConfigured() {
  return Boolean(whatsappPhoneNumberId && whatsappAccessToken);
}

async function notifySystemWhatsApp(body: string) {
  if (!whatsappNotifyTo || !isWhatsAppConfigured()) {
    return;
  }
  try {
    await sendWhatsAppTextMessage(whatsappNotifyTo, body);
  } catch (error) {
    console.error("Falha ao enviar notificação operacional no WhatsApp:", error);
  }
}

async function normalizeSaleItemsAndApplyStock(
  businessId: string,
  items: SaleItemInput[]
): Promise<
  {
    product: Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[]
> {
  const normalizedItems: {
    product: Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[] = [];

  for (const item of items) {
    if (!isValidObjectId(item.product)) {
      throw new Error("Produto inválido na venda.");
    }
    const product = await ProductModel.findOne({ _id: item.product, businessId });
    if (!product) {
      throw new Error("Produto da venda não encontrado.");
    }
    if (item.quantity > product.stock) {
      throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock}.`);
    }
    product.stock -= item.quantity;
    await product.save();

    normalizedItems.push({
      product: product._id as Types.ObjectId,
      name: product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice || product.price,
      total: (item.unitPrice || product.price) * item.quantity,
    });
  }

  return normalizedItems;
}

async function applyPurchaseStock(
  businessId: string,
  items: Array<{ product?: Types.ObjectId; quantity: number; cost: number }>
) {
  for (const item of items) {
    if (!item.product) continue;
    const product = await ProductModel.findOne({ _id: item.product, businessId });
    if (!product) continue;
    product.stock += item.quantity;
    product.cost = item.cost;
    await product.save();
  }
}

async function ensureMongoConnection() {
  if (mongoose.connection.readyState === 1) {
    dbConnected = true;
    return;
  }

  if (!connectPromise) {
    connectPromise = mongoose
      .connect(mongoUri!, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        family: 4,
      })
      .then((connection) => {
        dbConnected = true;
        return connection;
      })
      .catch((error) => {
        dbConnected = false;
        connectPromise = null;
        throw error;
      });
  }

  await connectPromise;
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "E-Sentinel API",
    database: dbConnected ? "connected" : "disconnected",
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password?.trim()) {
    return res.status(400).json({ message: "Informe e-mail e senha." });
  }

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase() || password !== adminPassword) {
    return res.status(401).json({ message: "Credenciais invalidas." });
  }

  const settings = await SettingModel.findOneAndUpdate(
    { userId: "admin" },
    {
      $setOnInsert: {
        userId: "admin",
        userName: "Administrador",
        userEmail: adminEmail,
        userRole: "Gestor",
      },
    },
    { upsert: true, new: true }
  );

  await BusinessModel.updateOne(
    { businessId: "geral" },
    { $setOnInsert: { businessId: "geral", name: "ERP Geral", active: true } },
    { upsert: true }
  );

  res.json({
    token: Buffer.from(`${settings.userId}:${Date.now()}`).toString("base64"),
    user: {
      id: settings.userId,
      name: settings.userName,
      email: settings.userEmail,
      role: settings.userRole,
    },
  });
});

app.use("/api", async (req, res, next) => {
  if (req.path === "/health") {
    return next();
  }
  if (!dbConnected) {
    try {
      await ensureMongoConnection();
    } catch (_error) {
      // O erro é tratado abaixo com retorno 503.
    }
  }
  if (!dbConnected) {
    return res.status(503).json({
      message:
        "Banco de dados indisponivel no momento. Verifique a conexao com MongoDB Atlas.",
    });
  }
  next();
});

app.get("/api/customers", async (req, res) => {
  const customers = await CustomerModel.find(getBusinessFilter(req)).sort({ createdAt: -1 });
  res.json(customers);
});

app.post("/api/customers", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const customer = await CustomerModel.create({ ...req.body, businessId });
  res.status(201).json(customer);
});

app.get("/api/products", async (req, res) => {
  const products = await ProductModel.find(getBusinessFilter(req)).sort({ createdAt: -1 });
  res.json(products);
});

app.post("/api/products", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const product = await ProductModel.create({ ...req.body, businessId });
  res.status(201).json(product);
});

app.patch("/api/products/:id/stock", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  const { stock } = req.body as { stock?: number };
  if (typeof stock !== "number" || stock < 0) {
    return res.status(400).json({ message: "Estoque inválido." });
  }
  const product = await ProductModel.findOneAndUpdate(
    { _id: id, businessId },
    { stock },
    { new: true }
  );
  if (!product) {
    return res.status(404).json({ message: "Produto não encontrado." });
  }
  res.json(product);
});

app.get("/api/suppliers", async (req, res) => {
  const suppliers = await SupplierModel.find(getBusinessFilter(req)).sort({ createdAt: -1 });
  res.json(suppliers);
});

app.post("/api/suppliers", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const supplier = await SupplierModel.create({ ...req.body, businessId });
  res.status(201).json(supplier);
});

app.get("/api/sales", async (req, res) => {
  const sales = await SaleModel.find(getBusinessFilter(req))
    .populate("customer", "name")
    .sort({ createdAt: -1 });
  res.json(sales);
});

app.post("/api/sales", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { customer, items, paymentMethod, status, createdBy } = req.body as {
    customer?: string;
    items?: SaleItemInput[];
    paymentMethod?: string;
    status?: string;
    createdBy?: string;
  };

  if (!items?.length) {
    return res.status(400).json({ message: "Informe ao menos um item da venda." });
  }

  let normalizedItems: {
    product: Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[] = [];
  try {
    normalizedItems = await normalizeSaleItemsAndApplyStock(businessId, items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao lançar venda.";
    if (message.includes("não encontrado")) {
      return res.status(404).json({ message });
    }
    return res.status(400).json({ message });
  }

  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const saleStatus = status || "PAGO";
  const sale = await SaleModel.create({
    businessId,
    customer: customer && isValidObjectId(customer) ? customer : undefined,
    items: normalizedItems,
    paymentMethod: paymentMethod || "PIX",
    status: saleStatus,
    billingStatus: saleStatus === "CANCELADO" ? "CANCELADO" : saleStatus === "PENDENTE" ? "PENDENTE" : "FATURADO",
    invoice: generateInvoicePayload(businessId, new Types.ObjectId().toString(), saleStatus === "PAGO" ? "EMITIDA" : "PENDENTE"),
    totalAmount,
    createdBy: createdBy || "Admin",
  });

  if (sale.invoice?.key) {
    sale.invoice = generateInvoicePayload(
      businessId,
      String(sale._id),
      saleStatus === "PAGO" ? "EMITIDA" : "PENDENTE"
    );
    await sale.save();
  }

  res.status(201).json(sale);
});

app.get("/api/integrations/whatsapp/status", async (_req, res) => {
  res.json({
    configured: isWhatsAppConfigured(),
    apiUrl: whatsappApiUrl,
    phoneNumberIdConfigured: Boolean(whatsappPhoneNumberId),
    accessTokenConfigured: Boolean(whatsappAccessToken),
    notifyTo: whatsappNotifyTo || "",
  });
});

app.post("/api/integrations/whatsapp/send", async (req, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };
  if (!phone?.trim()) {
    return res.status(400).json({ message: "Informe o telefone de destino." });
  }
  if (!message?.trim()) {
    return res.status(400).json({ message: "Informe a mensagem para envio." });
  }

  const result = await sendWhatsAppTextMessage(phone, message.trim());
  res.status(201).json({
    sent: true,
    phone: normalizeWhatsAppPhone(phone),
    provider: "WHATSAPP_BUSINESS",
    result,
  });
});

app.post("/api/integrations/whatsapp/sales/:id", async (req, res) => {
  const sale = await SaleModel.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ message: "Venda não encontrada." });
  }
  const { phone, customerName } = req.body as { phone?: string; customerName?: string };
  if (!phone?.trim()) {
    return res.status(400).json({ message: "Informe o telefone de destino." });
  }

  const invoiceNumber = sale.invoice?.number || "Pendente";
  const status = sale.status || "PENDENTE";
  const body = [
    `Olá${customerName?.trim() ? `, ${customerName.trim()}` : ""}!`,
    "Resumo da sua compra no E-Sentinel:",
    `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sale.totalAmount)}`,
    `Pagamento: ${sale.paymentMethod}`,
    `Status: ${status}`,
    `NF: ${invoiceNumber}`,
    "",
    "Obrigado pela preferência.",
  ].join("\n");

  const result = await sendWhatsAppTextMessage(phone, body);
  res.status(201).json({
    sent: true,
    phone: normalizeWhatsAppPhone(phone),
    provider: "WHATSAPP_BUSINESS",
    result,
  });
});

app.get("/api/purchases", async (req, res) => {
  const purchases = await PurchaseModel.find(getBusinessFilter(req)).sort({ createdAt: -1 });
  res.json(purchases);
});

app.post("/api/purchases", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { supplier, items, status } = req.body as {
    supplier: string;
    items: Array<{ product?: string; description: string; quantity: number; cost: number }>;
    status?: string;
  };

  if (!supplier || !items?.length) {
    return res.status(400).json({ message: "Fornecedor e itens são obrigatórios." });
  }

  const normalizedItems: Array<{
    product?: Types.ObjectId;
    description: string;
    quantity: number;
    cost: number;
    total: number;
  }> = [];

  for (const item of items) {
    normalizedItems.push({
      product: item.product && isValidObjectId(item.product) ? new Types.ObjectId(item.product) : undefined,
      description: item.description,
      quantity: item.quantity,
      cost: item.cost,
      total: item.quantity * item.cost,
    });
  }

  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const needsApproval = totalAmount >= purchaseApprovalThreshold;
  if (!needsApproval) {
    await applyPurchaseStock(businessId, normalizedItems);
  }

  const purchase = await PurchaseModel.create({
    businessId,
    supplier,
    items: normalizedItems,
    status: needsApproval ? "AGUARDANDO_APROVACAO" : status || "RECEBIDA",
    approval: {
      required: needsApproval,
      status: needsApproval ? "PENDENTE" : "APROVADA",
      requestedBy: "Sistema",
      requestedAt: new Date(),
    },
    stockApplied: !needsApproval,
    totalAmount,
  });
  if (needsApproval) {
    await notifySystemWhatsApp(
      [
        "Atenção: nova compra aguardando aprovação",
        `ERP: ${businessId}`,
        `Fornecedor: ${supplier}`,
        `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalAmount)}`,
        `ID: ${String(purchase._id)}`,
      ].join("\n")
    );
  }
  res.status(201).json(purchase);
});

app.get("/api/expenses", async (req, res) => {
  const expenses = await ExpenseModel.find(getBusinessFilter(req)).sort({ dueDate: -1 });
  res.json(expenses);
});

app.post("/api/expenses", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const payload = req.body as { amount?: number; status?: string };
  const amount = Number(payload.amount || 0);
  const needsApproval = amount >= expenseApprovalThreshold;
  const expense = await ExpenseModel.create({
    ...req.body,
    businessId,
    status: needsApproval ? "AGUARDANDO_APROVACAO" : payload.status || "PENDENTE",
    approval: {
      required: needsApproval,
      status: needsApproval ? "PENDENTE" : "APROVADA",
      requestedBy: "Sistema",
      requestedAt: new Date(),
    },
  });
  if (needsApproval) {
    await notifySystemWhatsApp(
      [
        "Atenção: nova despesa aguardando aprovação",
        `ERP: ${businessId}`,
        `Descrição: ${String((req.body as { description?: string }).description || "Sem descrição")}`,
        `Valor: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)}`,
        `ID: ${String(expense._id)}`,
      ].join("\n")
    );
  }
  res.status(201).json(expense);
});

app.get("/api/checklist-items", async (req, res) => {
  const items = await ChecklistItemModel.find(getBusinessFilter(req)).sort({ createdAt: -1 });
  res.json(items);
});

app.post("/api/checklist-items", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { title, notes } = req.body as { title?: string; notes?: string };
  if (!title?.trim()) {
    return res.status(400).json({ message: "Informe um título para a ideia." });
  }
  const item = await ChecklistItemModel.create({
    businessId,
    title: title.trim(),
    notes: notes?.trim() || "",
    completed: false,
  });
  res.status(201).json(item);
});

app.patch("/api/checklist-items/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { completed, title, notes } = req.body as {
    completed?: boolean;
    title?: string;
    notes?: string;
  };
  const updatePayload: {
    completed?: boolean;
    completedAt?: Date | null;
    title?: string;
    notes?: string;
  } = {};
  if (typeof completed === "boolean") {
    updatePayload.completed = completed;
    updatePayload.completedAt = completed ? new Date() : null;
  }
  if (typeof title === "string" && title.trim()) {
    updatePayload.title = title.trim();
  }
  if (typeof notes === "string") {
    updatePayload.notes = notes.trim();
  }
  const item = await ChecklistItemModel.findOneAndUpdate(
    { _id: req.params.id, businessId },
    updatePayload,
    { new: true }
  );
  if (!item) {
    return res.status(404).json({ message: "Item de checklist não encontrado." });
  }
  res.json(item);
});

app.delete("/api/checklist-items/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const removed = await ChecklistItemModel.findOneAndDelete({
    _id: req.params.id,
    businessId,
  });
  if (!removed) {
    return res.status(404).json({ message: "Item de checklist não encontrado." });
  }
  res.json({ deleted: true, id: req.params.id });
});

app.get("/api/approvals/purchases", async (req, res) => {
  const pending = await PurchaseModel.find({
    ...getBusinessFilter(req),
    status: "AGUARDANDO_APROVACAO",
  }).sort({ createdAt: -1 });
  res.json(pending);
});

app.get("/api/approvals/expenses", async (req, res) => {
  const pending = await ExpenseModel.find({
    ...getBusinessFilter(req),
    status: "AGUARDANDO_APROVACAO",
  }).sort({ createdAt: -1 });
  res.json(pending);
});

app.patch("/api/approvals/purchases/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { action, reason, reviewedBy } = req.body as {
    action?: "aprovar" | "rejeitar";
    reason?: string;
    reviewedBy?: string;
  };
  if (!action || !["aprovar", "rejeitar"].includes(action)) {
    return res.status(400).json({ message: "Acao invalida. Use aprovar ou rejeitar." });
  }

  const purchase = await PurchaseModel.findOne({ _id: req.params.id, businessId });
  if (!purchase) {
    return res.status(404).json({ message: "Compra nao encontrada." });
  }
  if (purchase.status !== "AGUARDANDO_APROVACAO") {
    return res.status(400).json({ message: "Compra nao esta pendente de aprovacao." });
  }

  if (action === "aprovar") {
    if (!purchase.stockApplied) {
      await applyPurchaseStock(businessId, purchase.items as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>);
      purchase.stockApplied = true;
    }
    purchase.status = "RECEBIDA";
    purchase.approval = {
      required: true,
      status: "APROVADA",
      requestedBy: purchase.approval?.requestedBy || "Sistema",
      requestedAt: purchase.approval?.requestedAt || purchase.createdAt || new Date(),
      reviewedBy: reviewedBy || "Gestor",
      reviewedAt: new Date(),
      reason: reason?.trim() || "Aprovacao automatizada via fluxo de compras.",
    };
  } else {
    purchase.status = "REJEITADA";
    purchase.approval = {
      required: true,
      status: "REJEITADA",
      requestedBy: purchase.approval?.requestedBy || "Sistema",
      requestedAt: purchase.approval?.requestedAt || purchase.createdAt || new Date(),
      reviewedBy: reviewedBy || "Gestor",
      reviewedAt: new Date(),
      reason: reason?.trim() || "Rejeicao registrada no fluxo de aprovacao.",
    };
  }

  await purchase.save();
  await notifySystemWhatsApp(
    [
      "Compra revisada no fluxo de aprovação",
      `ERP: ${businessId}`,
      `ID: ${String(purchase._id)}`,
      `Status: ${purchase.status}`,
      `Revisor: ${reviewedBy || "Gestor"}`,
    ].join("\n")
  );
  res.json(purchase);
});

app.patch("/api/approvals/expenses/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { action, reason, reviewedBy } = req.body as {
    action?: "aprovar" | "rejeitar" | "pagar";
    reason?: string;
    reviewedBy?: string;
  };
  if (!action || !["aprovar", "rejeitar", "pagar"].includes(action)) {
    return res.status(400).json({ message: "Acao invalida. Use aprovar, rejeitar ou pagar." });
  }

  const expense = await ExpenseModel.findOne({ _id: req.params.id, businessId });
  if (!expense) {
    return res.status(404).json({ message: "Despesa nao encontrada." });
  }

  if (action === "aprovar") {
    if (expense.status !== "AGUARDANDO_APROVACAO") {
      return res.status(400).json({ message: "Despesa nao esta aguardando aprovacao." });
    }
    expense.status = "PENDENTE";
    expense.approval = {
      required: true,
      status: "APROVADA",
      requestedBy: expense.approval?.requestedBy || "Sistema",
      requestedAt: expense.approval?.requestedAt || expense.createdAt || new Date(),
      reviewedBy: reviewedBy || "Gestor",
      reviewedAt: new Date(),
      reason: reason?.trim() || "Despesa aprovada para pagamento.",
    };
  }

  if (action === "rejeitar") {
    expense.status = "REJEITADO";
    expense.approval = {
      required: true,
      status: "REJEITADA",
      requestedBy: expense.approval?.requestedBy || "Sistema",
      requestedAt: expense.approval?.requestedAt || expense.createdAt || new Date(),
      reviewedBy: reviewedBy || "Gestor",
      reviewedAt: new Date(),
      reason: reason?.trim() || "Despesa rejeitada no fluxo de aprovacao.",
    };
  }

  if (action === "pagar") {
    if (expense.status === "AGUARDANDO_APROVACAO") {
      return res.status(400).json({ message: "Aprove a despesa antes de pagar." });
    }
    if (expense.status === "REJEITADO") {
      return res.status(400).json({ message: "Despesa rejeitada nao pode ser paga." });
    }
    expense.status = "PAGO";
    expense.paymentDate = new Date();
    if (!expense.approval?.required) {
      expense.approval = {
        required: false,
        status: "APROVADA",
        requestedBy: "Sistema",
        requestedAt: expense.createdAt || new Date(),
        reviewedBy: reviewedBy || "Sistema",
        reviewedAt: new Date(),
        reason: "Pagamento executado automaticamente.",
      };
    }
  }

  await expense.save();
  await notifySystemWhatsApp(
    [
      "Despesa revisada no fluxo de aprovação",
      `ERP: ${businessId}`,
      `ID: ${String(expense._id)}`,
      `Status: ${expense.status}`,
      `Revisor: ${reviewedBy || "Gestor"}`,
    ].join("\n")
  );
  res.json(expense);
});

app.get("/api/businesses", async (_req, res) => {
  await BusinessModel.updateOne(
    { businessId: "geral" },
    { $setOnInsert: { businessId: "geral", name: "ERP Geral", active: true } },
    { upsert: true }
  );
  const businesses = await BusinessModel.find({ active: true }).sort({ createdAt: 1 });
  res.json(businesses);
});

app.post("/api/businesses", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    return res.status(400).json({ message: "Nome do ERP e obrigatorio." });
  }
  const baseSlug = slugify(name) || "erp";
  const businessId = `${baseSlug}-${Date.now().toString().slice(-6)}`;
  const business = await BusinessModel.create({
    businessId,
    name: name.trim(),
    active: true,
  });
  res.status(201).json(business);
});

app.get("/api/settings", async (_req, res) => {
  const settings = await SettingModel.findOneAndUpdate(
    { userId: "admin" },
    { $setOnInsert: { userId: "admin" } },
    { upsert: true, new: true }
  );
  res.json(settings);
});

app.put("/api/settings/theme", async (req, res) => {
  const { theme } = req.body as {
    theme?: "claro" | "escuro" | "oceano" | "sabonete" | "rosa" | "neutro";
  };
  if (!theme) {
    return res.status(400).json({ message: "Tema é obrigatório." });
  }

  const settings = await SettingModel.findOneAndUpdate(
    { userId: "admin" },
    { theme },
    { upsert: true, new: true }
  );
  res.json(settings);
});

app.put("/api/settings/profile", async (req, res) => {
  const { userName, userEmail, userRole, companyName } = req.body as {
    userName?: string;
    userEmail?: string;
    userRole?: string;
    companyName?: string;
  };

  if (!userName?.trim() || !userEmail?.trim()) {
    return res.status(400).json({ message: "Nome e e-mail do usuário são obrigatórios." });
  }

  const settings = await SettingModel.findOneAndUpdate(
    { userId: "admin" },
    {
      userName: userName.trim(),
      userEmail: userEmail.trim(),
      userRole: userRole?.trim() || "Gestor",
      companyName: companyName?.trim() || "E-Sentinel Sabonetes",
    },
    { upsert: true, new: true }
  );
  res.json(settings);
});

app.get("/api/economic/indicators", async (_req, res) => {
  let usdBrl: number | null = null;
  let eurBrl: number | null = null;

  try {
    const fxData = await fetchJsonWithTimeout<{
      USDBRL?: { bid?: string };
      EURBRL?: { bid?: string };
    }>("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL");
    usdBrl = fxData.USDBRL?.bid ? Number(fxData.USDBRL.bid) : null;
    eurBrl = fxData.EURBRL?.bid ? Number(fxData.EURBRL.bid) : null;
  } catch {
    // Fica com null quando a API externa falhar.
  }

  const [selic, ipca] = await Promise.all([fetchSgsLatestValue(432), fetchSgsLatestValue(433)]);

  res.json({
    updatedAt: new Date().toISOString(),
    exchange: {
      usdBrl,
      eurBrl,
      source: "AwesomeAPI",
    },
    indicators: {
      selic,
      ipca,
      source: "Banco Central (SGS)",
    },
  });
});

app.get("/api/dashboard", async (req, res) => {
  const businessFilter = getBusinessFilter(req);
  const [revenueAgg, expenseAgg, lowStock, salesCount, purchaseCount] = await Promise.all([
    SaleModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    ExpenseModel.aggregate([
      { $match: { ...businessFilter, status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    ProductModel.find({ ...businessFilter, $expr: { $lte: ["$stock", "$minStock"] } })
      .sort({ stock: 1 })
      .limit(10),
    SaleModel.countDocuments(businessFilter),
    PurchaseModel.countDocuments(businessFilter),
  ]);

  const revenue = revenueAgg[0]?.total || 0;
  const expenses = expenseAgg[0]?.total || 0;
  res.json({
    revenue,
    expenses,
    profit: revenue - expenses,
    salesCount,
    purchaseCount,
    lowStock,
  });
});

app.get("/api/bi/insights", async (req, res) => {
  const businessFilter = getBusinessFilter(req);
  const now = new Date();
  const { start: monthStart, end: nextMonthStart } = monthBounds(now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const { start: previousMonthStart, end: previousMonthEnd } = monthBounds(previousMonthDate);
  const last30Start = new Date(now);
  last30Start.setDate(now.getDate() - 30);

  const monthlyPeriods: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyPeriods.push(formatPeriodKey(date));
  }

  const [
    currentRevenueAgg,
    previousRevenueAgg,
    currentExpenseAgg,
    previousExpenseAgg,
    monthlySalesAgg,
    monthlyExpensesAgg,
    topProductsAgg,
    costByCategoryAgg,
    currentSalesCount,
    stockoutAgg,
  ] = await Promise.all([
    SaleModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: monthStart, $lt: nextMonthStart } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    SaleModel.aggregate([
      {
        $match: {
          ...businessFilter,
          status: { $ne: "CANCELADO" },
          createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    ExpenseModel.aggregate([
      {
        $match: {
          ...businessFilter,
          status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
          dueDate: { $gte: monthStart, $lt: nextMonthStart },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    ExpenseModel.aggregate([
      {
        $match: {
          ...businessFilter,
          status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
          dueDate: { $gte: previousMonthStart, $lt: previousMonthEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    SaleModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          total: { $sum: "$totalAmount" },
        },
      },
    ]),
    ExpenseModel.aggregate([
      {
        $match: {
          ...businessFilter,
          status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
          dueDate: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$dueDate" } },
          total: { $sum: "$amount" },
        },
      },
    ]),
    SaleModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: monthStart, $lt: nextMonthStart } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          revenue: { $sum: "$items.total" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]),
    ExpenseModel.aggregate([
      {
        $match: {
          ...businessFilter,
          status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
          dueDate: { $gte: monthStart, $lt: nextMonthStart },
        },
      },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
    SaleModel.countDocuments({ ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: monthStart, $lt: nextMonthStart } }),
    SaleModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: last30Start } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          quantity30d: { $sum: "$items.quantity" },
        },
      },
      { $sort: { quantity30d: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const currentRevenue = currentRevenueAgg[0]?.total || 0;
  const previousRevenue = previousRevenueAgg[0]?.total || 0;
  const currentExpenses = currentExpenseAgg[0]?.total || 0;
  const previousExpenses = previousExpenseAgg[0]?.total || 0;
  const currentProfit = currentRevenue - currentExpenses;
  const previousProfit = previousRevenue - previousExpenses;
  const margin = currentRevenue > 0 ? (currentProfit / currentRevenue) * 100 : 0;
  const avgTicket = currentSalesCount > 0 ? currentRevenue / currentSalesCount : 0;
  const costRatio = currentRevenue > 0 ? (currentExpenses / currentRevenue) * 100 : 0;

  const salesMap = new Map<string, number>();
  monthlySalesAgg.forEach((row) => salesMap.set(row._id, row.total));
  const expensesMap = new Map<string, number>();
  monthlyExpensesAgg.forEach((row) => expensesMap.set(row._id, row.total));

  const timeseries = monthlyPeriods.map((period) => {
    const revenue = salesMap.get(period) || 0;
    const expenses = expensesMap.get(period) || 0;
    return {
      period,
      label: formatPeriodLabel(period),
      revenue,
      expenses,
      profit: revenue - expenses,
    };
  });

  const revenueTrend = timeseries.map((item) => item.revenue);
  const expenseTrend = timeseries.map((item) => item.expenses);
  const forecastRevenue = linearForecast(revenueTrend);
  const forecastExpenses = linearForecast(expenseTrend);
  const forecastProfit = forecastRevenue - forecastExpenses;

  const productIds = stockoutAgg
    .map((item) => item._id)
    .filter((value) => value && isValidObjectId(value));
  const productsInfo = await ProductModel.find({ ...businessFilter, _id: { $in: productIds } });
  const productMap = new Map(productsInfo.map((product) => [String(product._id), product]));

  const stockRisk = stockoutAgg
    .map((item) => {
      const product = productMap.get(String(item._id));
      if (!product) return null;
      const avgDailySold = (item.quantity30d || 0) / 30;
      const projectedDaysToStockout = avgDailySold > 0 ? product.stock / avgDailySold : null;
      return {
        productId: String(product._id),
        name: product.name,
        stock: product.stock,
        minStock: product.minStock,
        avgDailySold: Number(avgDailySold.toFixed(2)),
        projectedDaysToStockout:
          projectedDaysToStockout === null ? null : Number(projectedDaysToStockout.toFixed(1)),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => {
      const valueA = a.projectedDaysToStockout ?? Number.POSITIVE_INFINITY;
      const valueB = b.projectedDaysToStockout ?? Number.POSITIVE_INFINITY;
      return valueA - valueB;
    })
    .slice(0, 5);

  res.json({
    updatedAt: now.toISOString(),
    kpis: {
      revenue: currentRevenue,
      expenses: currentExpenses,
      profit: currentProfit,
      margin,
      salesCount: currentSalesCount,
      averageTicket: avgTicket,
      costRatio,
      revenueGrowth: safeGrowth(currentRevenue, previousRevenue),
      profitGrowth: safeGrowth(currentProfit, previousProfit),
    },
    timeseries,
    topProducts: topProductsAgg.map((row) => ({
      name: row._id,
      revenue: row.revenue,
      quantity: row.quantity,
    })),
    costByCategory: costByCategoryAgg.map((row) => ({
      category: row._id || "Sem categoria",
      total: row.total,
    })),
    forecast: {
      nextRevenue: forecastRevenue,
      nextExpenses: forecastExpenses,
      nextProfit: forecastProfit,
      confidence: timeseries.length >= 5 ? "media" : "baixa",
      stockRisk,
    },
  });
});

app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Erro interno no servidor." });
});

async function connectMongoWithRetry() {
  try {
    await ensureMongoConnection();
    dbConnected = true;
    console.log("MongoDB conectado com sucesso.");
  } catch (error) {
    dbConnected = false;
    console.error("Erro ao conectar no MongoDB:", error);
    setTimeout(connectMongoWithRetry, 10000);
  }
}

mongoose.connection.on("connected", () => {
  dbConnected = true;
});

mongoose.connection.on("disconnected", () => {
  dbConnected = false;
  setTimeout(connectMongoWithRetry, 10000);
});

if (isVercel) {
  void ensureMongoConnection().catch(() => {
    console.error("Erro ao conectar no MongoDB durante cold start.");
  });
} else {
  app.listen(port, () => {
    console.log(`API rodando em http://localhost:${port}`);
  });
  void connectMongoWithRetry();
}

export default app;
