import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import mongoose, { isValidObjectId, Types } from "mongoose";
import dns from "node:dns";
import {
  BusinessModel,
  CustomerModel,
  ExpenseModel,
  ProductModel,
  PurchaseModel,
  SaleItemInput,
  SaleModel,
  SettingModel,
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

  const normalizedItems: {
    product: Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[] = [];

  for (const item of items) {
    if (!isValidObjectId(item.product)) {
      return res.status(400).json({ message: "Produto inválido na venda." });
    }

    const product = await ProductModel.findOne({ _id: item.product, businessId });
    if (!product) {
      return res.status(404).json({ message: "Produto da venda não encontrado." });
    }

    if (item.quantity > product.stock) {
      return res.status(400).json({
        message: `Estoque insuficiente para ${product.name}. Disponível: ${product.stock}.`,
      });
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

  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const sale = await SaleModel.create({
    businessId,
    customer: customer && isValidObjectId(customer) ? customer : undefined,
    items: normalizedItems,
    paymentMethod: paymentMethod || "PIX",
    status: status || "PAGO",
    totalAmount,
    createdBy: createdBy || "Admin",
  });

  res.status(201).json(sale);
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
    if (item.product && isValidObjectId(item.product)) {
      const product = await ProductModel.findOne({ _id: item.product, businessId });
      if (product) {
        product.stock += item.quantity;
        product.cost = item.cost;
        await product.save();
      }
    }

    normalizedItems.push({
      product: item.product && isValidObjectId(item.product) ? new Types.ObjectId(item.product) : undefined,
      description: item.description,
      quantity: item.quantity,
      cost: item.cost,
      total: item.quantity * item.cost,
    });
  }

  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const purchase = await PurchaseModel.create({
    businessId,
    supplier,
    items: normalizedItems,
    status: status || "RECEBIDA",
    totalAmount,
  });
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
  const expense = await ExpenseModel.create({ ...req.body, businessId });
  res.status(201).json(expense);
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
    theme?: "claro" | "escuro" | "oceano" | "sabonete" | "rosa";
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

app.get("/api/dashboard", async (req, res) => {
  const businessFilter = getBusinessFilter(req);
  const [revenueAgg, expenseAgg, lowStock, salesCount, purchaseCount] = await Promise.all([
    SaleModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" } } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    ExpenseModel.aggregate([
      { $match: { ...businessFilter, status: { $ne: "CANCELADO" } } },
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
