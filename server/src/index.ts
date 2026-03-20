import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import mongoose, { isValidObjectId, Types } from "mongoose";
import dns from "node:dns";
import { fetch as undiciFetch } from "undici";
import multer from "multer";
import crypto from "node:crypto";
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
const aiPlanTtlMs = Number(process.env.AI_PLAN_TTL_MS || 5 * 60 * 1000); // 5 min
const autoApprovePurchasesForAi = (process.env.AI_AUTO_APPROVE_PURCHASES || "true").toLowerCase() === "true";

const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
const openRouterBaseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const openRouterModel = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
const openRouterTimeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 10000);
const whatsappApiUrl = (process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v20.0").replace(/\/$/, "");
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const whatsappNotifyTo = process.env.WHATSAPP_NOTIFY_TO?.trim();
let dbConnected = false;
let connectPromise: Promise<typeof mongoose> | null = null;

const fetchImpl: typeof fetch = (globalThis.fetch || undiciFetch) as typeof fetch;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

type AiIntent = "purchase" | "sale" | "customer_create" | "unknown";

type AiPlanAction =
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

type AiPlanRecord = {
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
};

const aiPlanStore = new Map<string, AiPlanRecord>();

function newPlanId() {
  return crypto.randomBytes(16).toString("hex");
}

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

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLooseNumber(raw: string) {
  const normalized = raw.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractAiIntent(message: string): {
  intent: AiIntent;
  quantity?: number;
  productName?: string;
  customerName?: string;
  unitCost?: number;
  unitPrice?: number;
  paymentMethod?:
    | "PIX"
    | "DINHEIRO"
    | "CARTAO"
    | "BOLETO"
    | "TRANSFERENCIA"
    | undefined;
} {
  const lower = message.toLowerCase();

  const paymentMethod =
    lower.includes("pix")
      ? "PIX"
      : lower.includes("dinheiro")
        ? "DINHEIRO"
        : lower.includes("cartao") || lower.includes("cartão")
          ? "CARTAO"
          : lower.includes("boleto")
            ? "BOLETO"
            : lower.includes("transferencia")
              ? "TRANSFERENCIA"
              : undefined;

  const purchaseMatch = lower.match(/(?:compre|comprar)\s+(\d+)\s+(.+)$/i);
  if (purchaseMatch) {
    const quantity = Number(purchaseMatch[1]);
    const productName = purchaseMatch[2].trim();
    const costMatch = lower.match(/(?:\bpor\b|\ba\b)\s+(\d+(?:[.,]\d+)?)/);
    const unitCost = costMatch ? parseLooseNumber(costMatch[1]) : null;
    return { intent: "purchase", quantity, productName, unitCost: unitCost ?? undefined };
  }

  const saleMatch = lower.match(/(?:vender|venda)\s+(\d+)\s+(.+)$/i);
  if (saleMatch) {
    const quantity = Number(saleMatch[1]);
    const productName = saleMatch[2].trim();
    const priceMatch = lower.match(/(?:\bpor\b|\ba\b)\s+(\d+(?:[.,]\d+)?)/);
    const unitPrice = priceMatch ? parseLooseNumber(priceMatch[1]) : null;
    return {
      intent: "sale",
      quantity,
      productName,
      unitPrice: unitPrice ?? undefined,
      paymentMethod,
    };
  }

  const customerCreateMatch = lower.match(/(?:cadastrar|criar|adicionar)\s+(?:um\s+)?cliente\s+(.+)$/i);
  if (customerCreateMatch) {
    const customerName = customerCreateMatch[1].trim();
    return { intent: "customer_create", customerName };
  }

  // “cliente João” sem prefixo explícito: tentamos apenas se estiver muito claro
  if (lower.includes("cliente") && (lower.includes("cadastrar") || lower.includes("criar") || lower.includes("adicionar"))) {
    const nameMatch = lower.match(/cliente\s+(.+)$/i);
    if (nameMatch) {
      return { intent: "customer_create", customerName: nameMatch[1].trim() };
    }
  }

  return { intent: "unknown" };
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
    const response = await fetchImpl(url, { signal: controller.signal });
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
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`
    );
    const rawValue = data[0]?.valor;
    if (!rawValue) return null;
    return Number(rawValue.replace(",", "."));
  } catch {
    return null;
  }
}

function normalizeNumberOrNull(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = Number(value.replace(",", "."));
    return Number.isFinite(normalized) ? normalized : null;
  }
  return null;
}

async function fetchFxRates() {
  // Tentativa 1: AwesomeAPI (rápida e simples).
  try {
    const fxData = await fetchJsonWithTimeout<{
      USDBRL?: { bid?: string };
      EURBRL?: { bid?: string };
    }>("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL", 9000);
    const usdBrl = normalizeNumberOrNull(fxData.USDBRL?.bid);
    const eurBrl = normalizeNumberOrNull(fxData.EURBRL?.bid);
    if (usdBrl && eurBrl) {
      return { usdBrl, eurBrl, source: "AwesomeAPI" as const };
    }
  } catch {
    // Ignora e cai no fallback.
  }

  // Tentativa 2: fallback público (ER API).
  try {
    const [usd, eur] = await Promise.all([
      fetchJsonWithTimeout<{ rates?: Record<string, number> }>("https://open.er-api.com/v6/latest/USD", 9000),
      fetchJsonWithTimeout<{ rates?: Record<string, number> }>("https://open.er-api.com/v6/latest/EUR", 9000),
    ]);
    const usdBrl = normalizeNumberOrNull(usd.rates?.BRL);
    const eurBrl = normalizeNumberOrNull(eur.rates?.BRL);
    if (usdBrl && eurBrl) {
      return { usdBrl, eurBrl, source: "ER API" as const };
    }
  } catch {
    // Ignora e devolve null.
  }

  return { usdBrl: null, eurBrl: null, source: "Indisponível" as const };
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
  const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
  const filter = {
    ...getBusinessFilter(req),
    ...(includeInactive ? {} : { status: "ATIVO" }),
  };
  const customers = await CustomerModel.find(filter).sort({ createdAt: -1 });
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

app.patch("/api/customers/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const payload = req.body as Partial<{
    name: string;
    email: string;
    phone: string;
    status: "ATIVO" | "INATIVO";
  }>;
  const update: Record<string, unknown> = {};
  if (typeof payload.name === "string") update.name = payload.name.trim();
  if (typeof payload.email === "string") update.email = payload.email.trim();
  if (typeof payload.phone === "string") update.phone = payload.phone.trim();
  if (payload.status === "ATIVO" || payload.status === "INATIVO") update.status = payload.status;

  const customer = await CustomerModel.findOneAndUpdate({ _id: id, businessId }, update, { new: true });
  if (!customer) {
    return res.status(404).json({ message: "Cliente não encontrado." });
  }
  res.json(customer);
});

app.delete("/api/customers/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const customer = await CustomerModel.findOneAndUpdate(
    { _id: id, businessId },
    { status: "INATIVO" },
    { new: true }
  );
  if (!customer) {
    return res.status(404).json({ message: "Cliente não encontrado." });
  }
  res.json({ deleted: true });
});

app.get("/api/products", async (req, res) => {
  const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
  const filter = {
    ...getBusinessFilter(req),
    ...(includeInactive ? {} : { active: true }),
  };
  const products = await ProductModel.find(filter).populate("supplier", "name").sort({ createdAt: -1 });
  const payload = products.map((p) => {
    const obj = p.toObject() as Record<string, unknown>;
    const hasPhoto = Boolean(obj.photoContentType);
    // Evita mandar o buffer para o cliente.
    delete obj.photoData;
    obj.hasPhoto = hasPhoto;
    return obj;
  });
  res.json(payload);
});

app.get("/api/products/:id/photo", async (req, res) => {
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }

  const product = await ProductModel.findOne({ _id: id, businessId }).select("photoContentType").select("+photoData");
  if (!product || !product.photoData) {
    return res.status(404).json({ message: "Foto não encontrada." });
  }

  if (!product.photoContentType) {
    res.setHeader("Content-Type", "application/octet-stream");
  } else {
    res.setHeader("Content-Type", product.photoContentType);
  }
  return res.send(product.photoData);
});

app.post("/api/products/:id/photo", upload.single("photo"), async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }

  const file = (req as unknown as { file?: { mimetype?: string; buffer?: Buffer } }).file;
  if (!file?.buffer) {
    return res.status(400).json({ message: "Informe um arquivo de foto em 'photo'." });
  }

  const product = await ProductModel.findOne({ _id: id, businessId });
  if (!product) {
    return res.status(404).json({ message: "Produto não encontrado." });
  }

  product.photoContentType = file.mimetype || "application/octet-stream";
  product.photoData = file.buffer;
  await product.save();

  res.json({ ok: true, hasPhoto: true });
});

app.post("/api/products", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const product = await ProductModel.create({ ...req.body, businessId });
  res.status(201).json(product);
});

app.patch("/api/products/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const payload = req.body as Partial<{
    name: string;
    sku: string;
    productCode: string;
    description: string;
    price: number;
    cost: number;
    stock: number;
    minStock: number;
    supplier: string;
    active: boolean;
  }>;
  const update: Record<string, unknown> = {};
  if (typeof payload.name === "string") update.name = payload.name.trim();
  if (typeof payload.sku === "string") update.sku = payload.sku.trim();
  if (typeof payload.productCode === "string") update.productCode = payload.productCode.trim();
  if (typeof payload.description === "string") update.description = payload.description.trim();
  if (typeof payload.price === "number" && payload.price >= 0) update.price = payload.price;
  if (typeof payload.cost === "number" && payload.cost >= 0) update.cost = payload.cost;
  if (typeof payload.stock === "number" && payload.stock >= 0) update.stock = payload.stock;
  if (typeof payload.minStock === "number" && payload.minStock >= 0) update.minStock = payload.minStock;
  if (typeof payload.supplier === "string" && isValidObjectId(payload.supplier)) {
    update.supplier = new Types.ObjectId(payload.supplier);
  }
  if (typeof payload.active === "boolean") update.active = payload.active;

  const product = await ProductModel.findOneAndUpdate({ _id: id, businessId }, update, { new: true }).populate(
    "supplier",
    "name"
  );
  if (!product) {
    return res.status(404).json({ message: "Produto não encontrado." });
  }
  res.json(product);
});

app.delete("/api/products/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const product = await ProductModel.findOneAndUpdate({ _id: id, businessId }, { active: false }, { new: true });
  if (!product) {
    return res.status(404).json({ message: "Produto não encontrado." });
  }
  res.json({ deleted: true });
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
  const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
  const filter = {
    ...getBusinessFilter(req),
    ...(includeInactive ? {} : { status: "ATIVO" }),
  };
  const suppliers = await SupplierModel.find(filter).sort({ createdAt: -1 });
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

app.patch("/api/suppliers/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const payload = req.body as Partial<{
    name: string;
    document: string;
    contact: string;
    pixKey: string;
    city: string;
    businessArea: string;
    paymentCondition: "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO";
    status: "ATIVO" | "INATIVO";
  }>;
  const update: Record<string, unknown> = {};
  if (typeof payload.name === "string") update.name = payload.name.trim();
  if (typeof payload.document === "string") update.document = payload.document.trim();
  if (typeof payload.contact === "string") update.contact = payload.contact.trim();
  if (typeof payload.pixKey === "string") update.pixKey = payload.pixKey.trim();
  if (typeof payload.city === "string") update.city = payload.city.trim();
  if (typeof payload.businessArea === "string") update.businessArea = payload.businessArea.trim();
  if (
    payload.paymentCondition === "BOLETO" ||
    payload.paymentCondition === "PIX" ||
    payload.paymentCondition === "DINHEIRO" ||
    payload.paymentCondition === "CREDITO"
  ) {
    update.paymentCondition = payload.paymentCondition;
  }
  if (payload.status === "ATIVO" || payload.status === "INATIVO") update.status = payload.status;

  const supplier = await SupplierModel.findOneAndUpdate({ _id: id, businessId }, update, { new: true });
  if (!supplier) {
    return res.status(404).json({ message: "Fornecedor não encontrado." });
  }
  res.json(supplier);
});

app.delete("/api/suppliers/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const supplier = await SupplierModel.findOneAndUpdate(
    { _id: id, businessId },
    { status: "INATIVO" },
    { new: true }
  );
  if (!supplier) {
    return res.status(404).json({ message: "Fornecedor não encontrado." });
  }
  res.json({ deleted: true });
});

app.get("/api/sales", async (req, res) => {
  const includeCancelled = String(req.query.includeCancelled || "").toLowerCase() === "true";
  const filter = {
    ...getBusinessFilter(req),
    ...(includeCancelled ? {} : { status: { $ne: "CANCELADO" } }),
  };
  const sales = await SaleModel.find(filter)
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

app.patch("/api/sales/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const payload = req.body as Partial<{
    status: "PAGO" | "PENDENTE" | "CANCELADO";
    paymentMethod: "DINHEIRO" | "PIX" | "CARTAO" | "BOLETO" | "TRANSFERENCIA";
  }>;
  const sale = await SaleModel.findOne({ _id: id, businessId });
  if (!sale) {
    return res.status(404).json({ message: "Venda não encontrada." });
  }
  if (sale.status === "CANCELADO") {
    return res.status(400).json({ message: "Venda cancelada não pode ser alterada." });
  }

  const nextStatus = payload.status;
  const nextPayment =
    payload.paymentMethod === "DINHEIRO" ||
    payload.paymentMethod === "PIX" ||
    payload.paymentMethod === "CARTAO" ||
    payload.paymentMethod === "BOLETO" ||
    payload.paymentMethod === "TRANSFERENCIA"
      ? payload.paymentMethod
      : undefined;

  if (nextStatus === "CANCELADO") {
    for (const item of sale.items || []) {
      if (!item.product) continue;
      await ProductModel.updateOne(
        { _id: item.product, businessId },
        { $inc: { stock: item.quantity } }
      );
    }
    sale.status = "CANCELADO";
    sale.billingStatus = "CANCELADO";
    if (sale.invoice) {
      sale.invoice.status = "CANCELADA";
    }
  } else if (nextStatus === "PAGO" || nextStatus === "PENDENTE") {
    sale.status = nextStatus;
    sale.billingStatus = nextStatus === "PENDENTE" ? "PENDENTE" : "FATURADO";
  }

  if (nextPayment) {
    sale.paymentMethod = nextPayment;
  }

  await sale.save();
  const populated = await SaleModel.findById(sale._id).populate("customer", "name");
  res.json(populated);
});

app.delete("/api/sales/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const sale = await SaleModel.findOne({ _id: id, businessId });
  if (!sale) {
    return res.status(404).json({ message: "Venda não encontrada." });
  }
  if (sale.status !== "CANCELADO") {
    for (const item of sale.items || []) {
      if (!item.product) continue;
      await ProductModel.updateOne(
        { _id: item.product, businessId },
        { $inc: { stock: item.quantity } }
      );
    }
    sale.status = "CANCELADO";
    sale.billingStatus = "CANCELADO";
    if (sale.invoice) {
      sale.invoice.status = "CANCELADA";
    }
    await sale.save();
  }
  res.json({ deleted: true });
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
  const includeCancelled = String(req.query.includeCancelled || "").toLowerCase() === "true";
  const filter = {
    ...getBusinessFilter(req),
    ...(includeCancelled ? {} : { status: { $ne: "CANCELADA" } }),
  };
  const purchases = await PurchaseModel.find(filter).sort({ createdAt: -1 });
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

app.patch("/api/purchases/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const payload = req.body as Partial<{
    status:
      | "ABERTA"
      | "AGUARDANDO_APROVACAO"
      | "APROVADA"
      | "RECEBIDA"
      | "REJEITADA"
      | "CANCELADA";
  }>;
  const purchase = await PurchaseModel.findOne({ _id: id, businessId });
  if (!purchase) {
    return res.status(404).json({ message: "Compra não encontrada." });
  }
  if (purchase.status === "CANCELADA") {
    return res.status(400).json({ message: "Compra cancelada não pode ser alterada." });
  }

  const nextStatus = payload.status;
  if (nextStatus === "CANCELADA") {
    if (purchase.stockApplied) {
      for (const item of purchase.items || []) {
        if (!item.product) continue;
        await ProductModel.updateOne(
          { _id: item.product, businessId },
          { $inc: { stock: -item.quantity } }
        );
      }
      purchase.stockApplied = false;
    }
    purchase.status = "CANCELADA";
    if (purchase.approval) {
      purchase.approval.status = "REJEITADA";
    }
  } else if (
    nextStatus === "ABERTA" ||
    nextStatus === "AGUARDANDO_APROVACAO" ||
    nextStatus === "APROVADA" ||
    nextStatus === "RECEBIDA" ||
    nextStatus === "REJEITADA"
  ) {
    purchase.status = nextStatus;
  }

  await purchase.save();
  res.json(purchase);
});

app.delete("/api/purchases/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const purchase = await PurchaseModel.findOne({ _id: id, businessId });
  if (!purchase) {
    return res.status(404).json({ message: "Compra não encontrada." });
  }
  if (purchase.status !== "CANCELADA") {
    if (purchase.stockApplied) {
      for (const item of purchase.items || []) {
        if (!item.product) continue;
        await ProductModel.updateOne(
          { _id: item.product, businessId },
          { $inc: { stock: -item.quantity } }
        );
      }
      purchase.stockApplied = false;
    }
    purchase.status = "CANCELADA";
    if (purchase.approval) {
      purchase.approval.status = "REJEITADA";
    }
    await purchase.save();
  }
  res.json({ deleted: true });
});

app.get("/api/expenses", async (req, res) => {
  const includeRejected = String(req.query.includeRejected || "").toLowerCase() === "true";
  const filter = {
    ...getBusinessFilter(req),
    ...(includeRejected ? {} : { status: { $ne: "REJEITADO" } }),
  };
  const expenses = await ExpenseModel.find(filter).sort({ dueDate: -1 });
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

app.patch("/api/expenses/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const payload = req.body as Partial<{
    description: string;
    category: string;
    amount: number;
    dueDate: string;
    status: "PAGO" | "PENDENTE" | "AGUARDANDO_APROVACAO" | "REJEITADO";
  }>;
  const update: Record<string, unknown> = {};
  if (typeof payload.description === "string") update.description = payload.description.trim();
  if (typeof payload.category === "string") update.category = payload.category.trim();
  if (typeof payload.amount === "number" && payload.amount >= 0) update.amount = payload.amount;
  if (typeof payload.dueDate === "string" && payload.dueDate.trim()) update.dueDate = new Date(payload.dueDate);
  if (payload.status === "PAGO" || payload.status === "PENDENTE" || payload.status === "AGUARDANDO_APROVACAO" || payload.status === "REJEITADO") {
    update.status = payload.status;
  }

  const expense = await ExpenseModel.findOneAndUpdate({ _id: id, businessId }, update, { new: true });
  if (!expense) {
    return res.status(404).json({ message: "Despesa não encontrada." });
  }
  res.json(expense);
});

app.delete("/api/expenses/:id", async (req, res) => {
  if (blockWriteInGeneralScope(req, res)) {
    return;
  }
  const { businessId } = getScopeContext(req);
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  const expense = await ExpenseModel.findOneAndUpdate(
    { _id: id, businessId },
    { status: "REJEITADO" },
    { new: true }
  );
  if (!expense) {
    return res.status(404).json({ message: "Despesa não encontrada." });
  }
  res.json({ deleted: true });
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

app.post("/api/ai/plan", async (req, res) => {
  const { scope, businessId } = getScopeContext(req);
  if (scope === "geral") {
    res.status(400).json({
      message:
        "O ERP Geral e apenas para consolidacao. Selecione um ERP especifico para lancamentos.",
    });
    return;
  }

  const now = Date.now();
  for (const [id, record] of aiPlanStore.entries()) {
    if (record.expiresAt <= now) aiPlanStore.delete(id);
  }

  const payload = req.body as { message?: string };
  const message = payload.message?.trim() || "";
  if (!message) {
    return res.status(400).json({ message: "Informe uma mensagem para a IA." });
  }

  const extracted = extractAiIntent(message);
  const warnings: string[] = [];
  const questions: string[] = [];
  const actions: AiPlanAction[] = [];
  let status: AiPlanRecord["status"] = "READY";
  let summary = "";
  let actionsPreview: string[] = [];
  let source: AiPlanRecord["source"] = "rules";

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
      questions.push("Informe a quantidade e o nome do produto (ex.: \"compre 20 sabonetes de cidreira\").");
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
          questions.push("Nao consegui identificar o fornecedor do produto. Edite o produto e vincule um fornecedor.");
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
        // Product não existe: cria produto no momento de execução com defaults e compra logo em seguida.
        const supplierId = String(fallbackSupplier!._id);
        const supplierName = fallbackSupplier!.name;
        const sku = `${slugify(productName)}-${Date.now().toString().slice(-6)}`;
        const costToUse = unitCost ?? 0;

        actions.push({
          kind: "createProduct",
          input: {
            name: productName,
            sku,
            productCode: "",
            description: "",
            supplierId,
            price: 0,
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
        warnings.push("Produto nao existia. Vou criar com preco=0 e custo conforme o valor informado (ou 0).");
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
      questions.push("Informe a quantidade e o nome do produto (ex.: \"vender 5 sabonete X\").");
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
  };
  aiPlanStore.set(planId, record);

  return res.json({
    planId,
    status: record.status,
    source: record.source,
    summary: record.summary,
    warnings: record.warnings,
    requiresConfirmation: record.requiresConfirmation,
    questions: record.questions,
    actionsPreview: record.actionsPreview,
  });
});

app.post("/api/ai/execute", async (req, res) => {
  const { scope, businessId } = getScopeContext(req);
  const payload = req.body as { planId?: string; confirm?: boolean | string; clientNotes?: string };
  const planId = payload.planId?.trim() || "";
  if (!planId) {
    return res.status(400).json({ message: "planId ausente." });
  }

  const record = aiPlanStore.get(planId);
  if (!record) {
    return res.status(404).json({ ok: false, message: "Plano nao encontrado ou expirado." });
  }
  if (record.expiresAt <= Date.now()) {
    aiPlanStore.delete(planId);
    return res.status(400).json({ ok: false, message: "Plano expirado." });
  }

  if (record.scope.scope !== scope || record.scope.businessId !== businessId) {
    return res.status(400).json({ ok: false, message: "Plano nao pertence ao escopo atual." });
  }

  const confirm = payload.confirm;
  const isConfirmed = confirm === true || confirm === "I_CONFIRM";
  if (!isConfirmed) {
    return res.status(400).json({ ok: false, message: "Confirmação necessária para executar." });
  }

  if (record.executed) {
    return res.json({ ok: true, planId: record.planId, executedAt: new Date().toISOString(), results: {} });
  }

  if (record.status !== "READY" || !record.actions) {
    return res.status(400).json({ ok: false, message: "Plano não está pronto para execução." });
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
        const product = await ProductModel.create({
          businessId,
          name: action.input.name.trim(),
          sku: action.input.sku.trim(),
          productCode: action.input.productCode?.trim() || undefined,
          description: action.input.description?.trim() || undefined,
          supplier: new Types.ObjectId(action.input.supplierId),
          price: action.input.price,
          cost: action.input.cost,
          stock: action.input.stock,
          minStock: action.input.minStock,
          active: action.input.active,
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
        const product = await ProductModel.findOne({ _id: productId, businessId });
        if (!product) {
          throw new Error("Produto não encontrado para compra.");
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
          await applyPurchaseStock(businessId, normalizedItems as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>);
        }

        const purchase = await PurchaseModel.create({
          businessId,
          supplier: action.input.supplierName,
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
          await applyPurchaseStock(businessId, normalizedItems as Array<{ product?: Types.ObjectId; quantity: number; cost: number }>);
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
        const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);

        const sale = await SaleModel.create({
          businessId,
          items: normalizedItems,
          paymentMethod: action.input.paymentMethod,
          status: "PAGO",
          billingStatus: "FATURADO",
          invoice: generateInvoicePayload(
            businessId,
            new Types.ObjectId().toString(),
            "EMITIDA"
          ),
          totalAmount,
          createdBy: "IA",
        });

        if (sale.invoice?.key) {
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
    return res.status(400).json({ ok: false, planId, error: errors[0] });
  }

  record.executed = true;
  aiPlanStore.set(planId, record);

  return res.json({
    ok: true,
    planId,
    executedAt: new Date().toISOString(),
    results,
    warnings: runtimeWarnings,
  });
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
  const fx = await fetchFxRates();

  const [selic, ipca] = await Promise.all([fetchSgsLatestValue(432), fetchSgsLatestValue(433)]);

  res.json({
    updatedAt: new Date().toISOString(),
    exchange: {
      usdBrl: fx.usdBrl,
      eurBrl: fx.eurBrl,
      source: fx.source,
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
