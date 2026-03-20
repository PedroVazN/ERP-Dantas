import dotenv from "dotenv";
import { Request, Response, NextFunction } from "express";
import mongoose, { isValidObjectId, Types } from "mongoose";
import dns from "node:dns";
import { fetch as undiciFetch } from "undici";
import { app, upload } from "./app";
import { blockWriteInGeneralScope, getBusinessFilter, getScopeContext } from "./middleware/scope";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoute } from "./routes/health";
import { registerCustomerRoutes } from "./routes/customers";
import { registerProductRoutes } from "./routes/products";
import { registerSupplierRoutes } from "./routes/suppliers";
import { registerSalesRoutes } from "./routes/sales";
import { registerPurchaseRoutes } from "./routes/purchases";
import { registerExpenseRoutes } from "./routes/expenses";
import { registerChecklistRoutes } from "./routes/checklist";
import { registerApprovalsRoutes } from "./routes/approvals";
import { registerWhatsAppRoutes } from "./routes/whatsapp";
import { registerBusinessRoutes } from "./routes/businesses";
import { registerSettingsRoutes } from "./routes/settings";
import { registerEconomicIndicatorsRoutes } from "./routes/economicIndicators";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerBiInsightsRoutes } from "./routes/bi";
import { registerAiRoutes } from "./routes/ai";
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

const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const isVercel = process.env.VERCEL === "1";
const dnsServers = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
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

registerHealthRoute(app, { getDbConnected: () => dbConnected });
registerAuthRoutes(app, { adminEmail: adminEmail!, adminPassword: adminPassword! });

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

registerCustomerRoutes(app);
registerProductRoutes(app);

 

registerSupplierRoutes(app);

registerSalesRoutes(app, { normalizeSaleItemsAndApplyStock, generateInvoicePayload });

registerWhatsAppRoutes(app, {
  whatsappApiUrl,
  whatsappPhoneNumberId,
  whatsappAccessToken,
  whatsappNotifyTo,
  isWhatsAppConfigured,
  sendWhatsAppTextMessage,
  normalizeWhatsAppPhone,
});

registerPurchaseRoutes(app, {
  purchaseApprovalThreshold,
  applyPurchaseStock,
  notifySystemWhatsApp,
});

registerExpenseRoutes(app, {
  expenseApprovalThreshold,
  notifySystemWhatsApp,
});

registerChecklistRoutes(app);

registerApprovalsRoutes(app, {
  applyPurchaseStock,
  notifySystemWhatsApp,
});

registerAiRoutes(app, {
  purchaseApprovalThreshold,
  aiPlanTtlMs,
  autoApprovePurchasesForAi,
  applyPurchaseStock,
  normalizeSaleItemsAndApplyStock,
  generateInvoicePayload,
});

registerBusinessRoutes(app);
registerSettingsRoutes(app);
registerEconomicIndicatorsRoutes(app, { fetchFxRates, fetchSgsLatestValue });
registerDashboardRoutes(app);
registerBiInsightsRoutes(app, {
  monthBounds,
  formatPeriodKey,
  formatPeriodLabel,
  linearForecast,
  safeGrowth,
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
