import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api, API_URL } from "./api";
import type {
  AuthUser,
  BiInsights,
  Business,
  ChecklistItem,
  Customer,
  Dashboard,
  EconomicIndicators,
  Expense,
  LoginResponse,
  Product,
  Purchase,
  Sale,
  Settings,
  Supplier,
  Theme,
  WhatsAppStatus,
} from "./types";
import "./App.css";

const SESSION_KEY = "e_sentinel_session";
const BUSINESS_KEY = "e_sentinel_workspace";

type ModuleKey =
  | "dashboard"
  | "clientes"
  | "produtos"
  | "vendas"
  | "compras"
  | "fornecedores"
  | "financeiro"
  | "checklist"
  | "usuario";

const moduleMeta: Record<ModuleKey, { label: string; short: string; helper: string }> = {
  dashboard: { label: "Dashboard", short: "DB", helper: "Visão geral do negócio" },
  clientes: { label: "Clientes", short: "CL", helper: "Cadastro e relacionamento" },
  produtos: { label: "Produtos", short: "PR", helper: "Catálogo e estoque" },
  vendas: { label: "Vendas", short: "VD", helper: "PDV e faturamento" },
  compras: { label: "Compras", short: "CP", helper: "Fornecedores e entradas" },
  fornecedores: { label: "Fornecedores", short: "FR", helper: "Cadastro de fornecedores" },
  financeiro: { label: "Financeiro", short: "FN", helper: "Contas e despesas" },
  checklist: { label: "Checklist", short: "CK", helper: "Ideias e futuros implementos" },
  usuario: { label: "Usuário", short: "US", helper: "Perfil e preferências" },
};

const themeOptions: Array<{ value: Theme; label: string; description: string }> = [
  { value: "claro", label: "Claro", description: "Visual clean e executivo para o dia a dia." },
  { value: "escuro", label: "Escuro", description: "Interface premium para foco e contraste." },
  { value: "oceano", label: "Oceano", description: "Tom moderno e elegante com identidade azul." },
  {
    value: "sabonete",
    label: "Sabonete",
    description: "Paleta premium verde-azulada inspirada em textura de sabonete.",
  },
  {
    value: "rosa",
    label: "Rosa",
    description: "Tema sofisticado em tons rosados e roxo profundo.",
  },
  {
    value: "neutro",
    label: "Neutro",
    description: "Paleta suave e elegante para uma experiencia clean e profissional.",
  },
];

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [businessForm, setBusinessForm] = useState({ name: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [biInsights, setBiInsights] = useState<BiInsights | null>(null);
  const [biRefreshing, setBiRefreshing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [economicIndicators, setEconomicIndicators] = useState<EconomicIndicators | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [theme, setTheme] = useState<Theme>("claro");
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "" });
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    productCode: "",
    description: "",
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 10,
    supplierId: "",
  });
  const [productPhotoFile, setProductPhotoFile] = useState<File | null>(null);
  const [saleForm, setSaleForm] = useState({
    productId: "",
    quantity: 1,
    paymentMethod: "PIX",
  });
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(null);
  const [whatsAppForm, setWhatsAppForm] = useState({ phone: "", message: "" });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalKind, setEditModalKind] = useState<
    | "customer"
    | "product"
    | "supplier"
    | "sale"
    | "purchase"
    | "expense"
    | "checklist"
    | null
  >(null);
  const [editModalSubtitle, setEditModalSubtitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [editCustomerForm, setEditCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "ATIVO" as "ATIVO" | "INATIVO",
  });
  const [editProductForm, setEditProductForm] = useState({
    name: "",
    sku: "",
    productCode: "",
    description: "",
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 10,
    supplierId: "",
    active: true,
  });
  const [editProductHasPhoto, setEditProductHasPhoto] = useState(false);
  const [editProductPhotoFile, setEditProductPhotoFile] = useState<File | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState({
    name: "",
    document: "",
    contact: "",
    pixKey: "",
    city: "",
    businessArea: "",
    paymentCondition: "PIX" as "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO",
    status: "ATIVO" as "ATIVO" | "INATIVO",
  });
  const [editSaleForm, setEditSaleForm] = useState({
    paymentMethod: "PIX",
    status: "PAGO",
  });
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    status: "RECEBIDA" as Purchase["status"],
  });
  const [editExpenseForm, setEditExpenseForm] = useState({
    description: "",
    category: "OPERACIONAL",
    amount: 0,
    dueDate: new Date().toISOString().slice(0, 10),
    status: "PENDENTE" as Expense["status"],
  });
  const [editChecklistForm, setEditChecklistForm] = useState({
    title: "",
    notes: "",
  });

  function closeEditModal() {
    setEditModalOpen(false);
    setEditModalKind(null);
    setEditingId(null);
    setEditModalSubtitle("");
    setEditProductPhotoFile(null);
    setEditProductHasPhoto(false);
  }

  function openEditModal(kind: NonNullable<typeof editModalKind>, id: string, subtitle: string) {
    setEditModalKind(kind);
    setEditingId(id);
    setEditModalSubtitle(subtitle);
    setEditModalOpen(true);
  }

  function AppModal(props: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
  }) {
    return (
      <div className="app-modal-overlay" onClick={props.onClose}>
        <div className="app-modal" onClick={(event) => event.stopPropagation()}>
          <div className="app-modal-header">
            <div>
              <h3>{props.title}</h3>
              {props.subtitle ? <p>{props.subtitle}</p> : null}
            </div>
            <button type="button" className="ghost-btn" onClick={props.onClose}>
              Fechar
            </button>
          </div>
          <div className="app-modal-body">{props.children}</div>
        </div>
      </div>
    );
  }
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: "",
    productId: "",
    quantity: 1,
    cost: 0,
  });
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    document: "",
    contact: "",
    pixKey: "",
    city: "",
    businessArea: "",
    paymentCondition: "PIX" as "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO",
  });
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "OPERACIONAL",
    amount: 0,
    dueDate: new Date().toISOString().slice(0, 10),
  });
  const [checklistForm, setChecklistForm] = useState({
    title: "",
    notes: "",
  });
  const [userForm, setUserForm] = useState({
    userName: "Administrador",
    userEmail: "",
    userRole: "Gestor",
    companyName: "E-Sentinel Sabonetes",
  });

  const totalOpenReceivables = useMemo(
    () =>
      sales
        .filter((sale) => sale.status === "PENDENTE")
        .reduce((acc, sale) => acc + sale.totalAmount, 0),
    [sales]
  );

  const filteredProductsBySupplier = useMemo(() => {
    if (!purchaseForm.supplierId) {
      return [];
    }
    return products.filter((product) => {
      if (!product.supplier) {
        return false;
      }
      const supplierId =
        typeof product.supplier === "string" ? product.supplier : product.supplier?._id || "";
      return supplierId === purchaseForm.supplierId;
    });
  }, [products, purchaseForm.supplierId]);

  const currentDate = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "full",
      }).format(new Date()),
    []
  );

  const isGeneralWorkspace = workspaceId === "geral";
  const selectedBusiness = businesses.find((item) => item.businessId === workspaceId) || null;
  const pendingApprovalsCount = useMemo(
    () =>
      purchases.filter((item) => item.status === "AGUARDANDO_APROVACAO").length +
      expenses.filter((item) => item.status === "AGUARDANDO_APROVACAO").length,
    [expenses, purchases]
  );
  const maxTimeseriesValue = useMemo(() => {
    if (!biInsights?.timeseries.length) return 1;
    return Math.max(
      ...biInsights.timeseries.flatMap((item) => [item.revenue, item.expenses, item.profit]),
      1
    );
  }, [biInsights]);
  const maxTopProductValue = useMemo(() => {
    if (!biInsights?.topProducts.length) return 1;
    return Math.max(...biInsights.topProducts.map((item) => item.revenue), 1);
  }, [biInsights]);
  const maxCostCategoryValue = useMemo(() => {
    if (!biInsights?.costByCategory.length) return 1;
    return Math.max(...biInsights.costByCategory.map((item) => item.total), 1);
  }, [biInsights]);

  function scopedPath(path: string) {
    if (!workspaceId) {
      return path;
    }
    if (workspaceId === "geral") {
      return `${path}?scope=geral`;
    }
    return `${path}?scope=negocio&businessId=${encodeURIComponent(workspaceId)}`;
  }

  function selectModule(module: ModuleKey) {
    setActiveModule(module);
    setMobileMenuOpen(false);
  }

  async function loadDashboardBi(silent = false) {
    if (!workspaceId) return;
    try {
      if (silent) {
        setBiRefreshing(true);
      }
      const [dashboardData, biData] = await Promise.all([
        api.get<Dashboard>(scopedPath("/dashboard")),
        api.get<BiInsights>(scopedPath("/bi/insights")),
      ]);
      setDashboard(dashboardData);
      setBiInsights(biData);
    } finally {
      if (silent) {
        setBiRefreshing(false);
      }
    }
  }

  async function loadAllData() {
    if (!workspaceId) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const [
        customersData,
        productsData,
        salesData,
        purchasesData,
        suppliersData,
        expensesData,
        checklistData,
        economicData,
        settingsData,
      ] =
        await Promise.all([
          api.get<Customer[]>(scopedPath("/customers")),
          api.get<Product[]>(scopedPath("/products")),
          api.get<Sale[]>(scopedPath("/sales")),
          api.get<Purchase[]>(scopedPath("/purchases")),
          api.get<Supplier[]>(scopedPath("/suppliers")),
          api.get<Expense[]>(scopedPath("/expenses")),
          api.get<ChecklistItem[]>(scopedPath("/checklist-items")),
          api.get<EconomicIndicators>("/economic/indicators"),
          api.get<Settings>("/settings"),
        ]);

      await loadDashboardBi(true);
      setCustomers(customersData);
      setProducts(productsData);
      setSales(salesData);
      setPurchases(purchasesData);
      setSuppliers(suppliersData);
      setExpenses(expensesData);
      setChecklistItems(checklistData);
      setEconomicIndicators(economicData);
      setSettings(settingsData);
      setTheme(settingsData.theme || "claro");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBusinesses() {
    setWorkspaceLoading(true);
    try {
      const data = await api.get<Business[]>("/businesses");
      setBusinesses(data);
      const storedWorkspace = localStorage.getItem(BUSINESS_KEY);
      if (storedWorkspace && data.some((item) => item.businessId === storedWorkspace)) {
        setWorkspaceId(storedWorkspace);
      } else if (data.length > 0) {
        setWorkspaceId(data[0].businessId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar ERPs";
      setAuthError(message);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const parsed = JSON.parse(session) as { token: string; user: AuthUser };
        if (parsed?.token && parsed?.user) {
          setCurrentUser(parsed.user);
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setAuthChecking(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadBusinesses();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    localStorage.setItem(BUSINESS_KEY, workspaceId);
    loadAllData();
  }, [isAuthenticated, workspaceId]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId || activeModule !== "dashboard") return;
    const intervalId = window.setInterval(() => {
      void loadDashboardBi(true).catch((err) => {
        const message = err instanceof Error ? err.message : "Erro ao atualizar BI";
        setError(message);
      });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [activeModule, isAuthenticated, workspaceId]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [workspaceId]);

  useEffect(() => {
    if (!isAuthenticated || activeModule !== "usuario") return;
    void loadWhatsAppStatus();
  }, [activeModule, isAuthenticated]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!settings) return;
    setUserForm({
      userName: settings.userName || "Administrador",
      userEmail: settings.userEmail || "",
      userRole: settings.userRole || "Gestor",
      companyName: settings.companyName || "E-Sentinel Sabonetes",
    });
  }, [settings]);

  async function handleThemeChange(nextTheme: Theme) {
    setTheme(nextTheme);
    try {
      const newSettings = await api.put<Settings>("/settings/theme", { theme: nextTheme });
      setSettings(newSettings);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao trocar tema";
      setError(message);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    try {
      setAuthError("");
      const response = await api.post<LoginResponse>("/auth/login", loginForm);
      localStorage.setItem(SESSION_KEY, JSON.stringify(response));
      setCurrentUser(response.user);
      setIsAuthenticated(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha no login";
      setAuthError(message);
    }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(BUSINESS_KEY);
    setIsAuthenticated(false);
    setCurrentUser(null);
    setWorkspaceId(null);
  }

  async function handleCreateBusiness(event: FormEvent) {
    event.preventDefault();
    const created = await api.post<Business>("/businesses", businessForm);
    setBusinessForm({ name: "" });
    const updated = [...businesses, created];
    setBusinesses(updated);
    setWorkspaceId(created.businessId);
  }

  async function submitCustomer(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    await api.post<Customer>(scopedPath("/customers"), { ...customerForm, status: "ATIVO" });
    setCustomerForm({ name: "", email: "", phone: "" });
    await loadAllData();
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    if (!productForm.supplierId) {
      setError("Selecione um fornecedor para o produto.");
      return;
    }
    const created = await api.post<Product>(scopedPath("/products"), {
      ...productForm,
      supplier: productForm.supplierId,
      category: "SABONETE",
      active: true,
    });
    if (productPhotoFile) {
      const formData = new FormData();
      formData.append("photo", productPhotoFile);
      await api.postFormData<{ ok: boolean; hasPhoto: boolean }>(scopedPath(`/products/${created._id}/photo`), formData);
    }
    setProductPhotoFile(null);
    setProductForm({ name: "", sku: "", productCode: "", description: "", price: 0, cost: 0, stock: 0, minStock: 10, supplierId: "" });
    await loadAllData();
  }

  async function submitSale(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    const product = products.find((item) => item._id === saleForm.productId);
    if (!product) {
      setError("Selecione um produto válido.");
      return;
    }

    const quantity = Number(saleForm.quantity);
    if (quantity > product.stock) {
      setError(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock} unidades.`);
      return;
    }

    try {
      setError("");
      await api.post<Sale>(scopedPath("/sales"), {
        items: [
          {
            product: product._id,
            quantity: quantity,
            unitPrice: product.price,
          },
        ],
        paymentMethod: saleForm.paymentMethod,
        status: "PAGO",
        createdBy: "Admin",
      });
      setSaleForm({ productId: "", quantity: 1, paymentMethod: "PIX" });
      await loadAllData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao lançar venda.";
      setError(message);
    }
  }

  async function loadWhatsAppStatus() {
    try {
      const status = await api.get<WhatsAppStatus>("/integrations/whatsapp/status");
      setWhatsAppStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao consultar status do WhatsApp.";
      setError(message);
    }
  }

  async function sendManualWhatsAppMessage(event: FormEvent) {
    event.preventDefault();
    if (!whatsAppForm.phone.trim() || !whatsAppForm.message.trim()) {
      setError("Preencha telefone e mensagem para enviar no WhatsApp.");
      return;
    }
    try {
      await api.post<{ sent: boolean; phone: string; provider: string }>("/integrations/whatsapp/send", {
        phone: whatsAppForm.phone.trim(),
        message: whatsAppForm.message.trim(),
      });
      setWhatsAppForm((prev) => ({ ...prev, message: "" }));
      await loadWhatsAppStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem manual no WhatsApp.";
      setError(message);
    }
  }

  async function submitSupplier(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    await api.post<Supplier>(scopedPath("/suppliers"), {
      ...supplierForm,
      status: "ATIVO",
    });
    setSupplierForm({
      name: "",
      document: "",
      contact: "",
      pixKey: "",
      city: "",
      businessArea: "",
      paymentCondition: "PIX",
    });
    await loadAllData();
  }

  async function submitPurchase(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    const product = products.find((item) => item._id === purchaseForm.productId);
    if (!product) return;
    const supplier = suppliers.find((item) => item._id === purchaseForm.supplierId);
    if (!supplier) {
      setError("Selecione um fornecedor cadastrado.");
      return;
    }

    await api.post<Purchase>(scopedPath("/purchases"), {
      supplier: supplier.name,
      items: [
        {
          product: product._id,
          description: product.name,
          quantity: Number(purchaseForm.quantity),
          cost: Number(purchaseForm.cost),
        },
      ],
    });
    setPurchaseForm({ supplierId: "", productId: "", quantity: 1, cost: 0 });
    await loadAllData();
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    await api.post<Expense>(scopedPath("/expenses"), {
      ...expenseForm,
    });
    setExpenseForm({
      description: "",
      category: "OPERACIONAL",
      amount: 0,
      dueDate: new Date().toISOString().slice(0, 10),
    });
    await loadAllData();
  }

  async function submitChecklistItem(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para cadastrar ideias.");
      return;
    }
    await api.post<ChecklistItem>(scopedPath("/checklist-items"), checklistForm);
    setChecklistForm({ title: "", notes: "" });
    await loadAllData();
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar checklist.");
      return;
    }
    await api.patch<ChecklistItem>(scopedPath(`/checklist-items/${item._id}`), {
      completed: !item.completed,
    });
    await loadAllData();
  }

  function editChecklistItem(item: ChecklistItem) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar checklist.");
      return;
    }
    setEditChecklistForm({ title: item.title, notes: item.notes || "" });
    openEditModal("checklist", item._id, `Editar: ${item.title}`);
  }

  async function deleteChecklistItem(item: ChecklistItem) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar checklist.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir a ideia "${item.title}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/checklist-items/${item._id}`));
    await loadAllData();
  }

  function editCustomer(item: Customer) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar clientes.");
      return;
    }
    setEditCustomerForm({
      name: item.name,
      email: item.email || "",
      phone: item.phone || "",
      status: item.status,
    });
    openEditModal("customer", item._id, `Editar: ${item.name}`);
  }

  async function deleteCustomer(item: Customer) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar clientes.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/inativar o cliente "${item.name}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/customers/${item._id}`));
    await loadAllData();
  }

  function editProduct(item: Product) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar produtos.");
      return;
    }
    setEditProductHasPhoto(Boolean(item.hasPhoto));
    setEditProductPhotoFile(null);
    const supplierId = typeof item.supplier === "string" ? item.supplier : item.supplier?._id || "";
    setEditProductForm({
      name: item.name,
      sku: item.sku,
      productCode: item.productCode || "",
      description: item.description || "",
      price: item.price,
      cost: item.cost,
      stock: item.stock,
      minStock: item.minStock,
      supplierId,
      active: item.active,
    });
    openEditModal("product", item._id, `Editar: ${item.name}`);
  }

  async function deleteProduct(item: Product) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar produtos.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/inativar o produto "${item.name}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/products/${item._id}`));
    await loadAllData();
  }

  function editSupplier(item: Supplier) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar fornecedores.");
      return;
    }
    setEditSupplierForm({
      name: item.name,
      document: item.document || "",
      contact: item.contact,
      pixKey: item.pixKey || "",
      city: item.city || "",
      businessArea: item.businessArea || "",
      paymentCondition: item.paymentCondition,
      status: item.status,
    });
    openEditModal("supplier", item._id, `Editar: ${item.name}`);
  }

  async function deleteSupplier(item: Supplier) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar fornecedores.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/inativar o fornecedor "${item.name}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/suppliers/${item._id}`));
    await loadAllData();
  }

  function editSale(item: Sale) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar vendas.");
      return;
    }
    setEditSaleForm({
      paymentMethod: item.paymentMethod || "PIX",
      status: item.status || "PAGO",
    });
    openEditModal("sale", item._id, `Editar venda: ${formatBRL(item.totalAmount)}`);
  }

  async function deleteSale(item: Sale) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar vendas.");
      return;
    }
    const confirmDelete = window.confirm(
      `Deseja cancelar/excluir a venda de ${formatBRL(item.totalAmount)}? (O estoque será estornado)`
    );
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/sales/${item._id}`));
    await loadAllData();
  }

  function editPurchase(item: Purchase) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar compras.");
      return;
    }
    setEditPurchaseForm({ status: item.status });
    openEditModal("purchase", item._id, `Editar compra: ${formatBRL(item.totalAmount)}`);
  }

  async function deletePurchase(item: Purchase) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar compras.");
      return;
    }
    const confirmDelete = window.confirm(
      `Deseja cancelar/excluir a compra de ${formatBRL(item.totalAmount)}? (Se já entrou no estoque, será estornado)`
    );
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/purchases/${item._id}`));
    await loadAllData();
  }

  function editExpense(item: Expense) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar despesas.");
      return;
    }
    setEditExpenseForm({
      description: item.description,
      category: item.category,
      amount: item.amount,
      dueDate: item.dueDate.slice(0, 10),
      status: item.status,
    });
    openEditModal("expense", item._id, `Editar despesa: ${item.description}`);
  }

  async function deleteExpense(item: Expense) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar despesas.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/rejeitar a despesa "${item.description}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/expenses/${item._id}`));
    await loadAllData();
  }

  async function submitUserProfile(event: FormEvent) {
    event.preventDefault();
    const updated = await api.put<Settings>("/settings/profile", userForm);
    setSettings(updated);
  }

  async function reviewPurchase(purchaseId: string, action: "aprovar" | "rejeitar") {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para aprovar.");
      return;
    }
    await api.patch<Purchase>(scopedPath(`/approvals/purchases/${purchaseId}`), {
      action,
      reviewedBy: currentUser?.name || "Gestor",
    });
    await loadAllData();
  }

  async function reviewExpense(expenseId: string, action: "aprovar" | "rejeitar" | "pagar") {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para aprovar.");
      return;
    }
    await api.patch<Expense>(scopedPath(`/approvals/expenses/${expenseId}`), {
      action,
      reviewedBy: currentUser?.name || "Gestor",
    });
    await loadAllData();
  }

  if (authChecking) {
    return <div className="auth-checking">Verificando sessão...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-layout">
        <section className="auth-panel">
          <div className="auth-brand">
            <div className="brand-mark">E-S</div>
            <div>
              <h1>E-Sentinel</h1>
              <p>Gestão moderna para operação de sabonetes</p>
            </div>
          </div>
          <h2>Acesse sua conta</h2>
          <p className="auth-subtitle">Ambiente seguro com visual executivo e alta produtividade.</p>
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-field">
              <label>E-mail</label>
              <small className="field-help">Informe o e-mail cadastrado para acessar o ERP.</small>
              <input
                type="email"
                placeholder="ex.: financeiro@empresa.com"
                value={loginForm.email}
                onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Senha</label>
              <small className="field-help">Sua senha de acesso (não compartilhe).</small>
              <input
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                required
              />
            </div>
            <button type="submit">Entrar no ERP</button>
          </form>
          {authError && <p className="error">{authError}</p>}
        </section>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="auth-layout">
        <section className="auth-panel workspace-panel">
          <div className="auth-brand">
            <div className="brand-mark">E-S</div>
            <div>
              <h1>Selecione seu ERP</h1>
              <p>Escolha o ambiente geral ou um ERP especifico por negocio.</p>
            </div>
          </div>

          {workspaceLoading ? <p className="feedback">Carregando ERPs...</p> : null}

          <div className="workspace-list">
            {businesses.map((item) => (
              <button
                key={item.businessId}
                className="workspace-card"
                onClick={() => setWorkspaceId(item.businessId)}
              >
                <strong>{item.name}</strong>
                <small>
                  {item.businessId === "geral"
                    ? "Consolidacao de todos os negocios"
                    : `ERP especial: ${item.businessId}`}
                </small>
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={handleCreateBusiness}>
            <div className="form-field">
              <label>Novo ERP especial</label>
              <small className="field-help">Crie um ambiente separado por negócio (ex.: “Loja Centro”).</small>
              <input
                placeholder="ex.: Loja Centro"
                value={businessForm.name}
                onChange={(event) => setBusinessForm({ name: event.target.value })}
                required
              />
            </div>
            <button type="submit">Criar novo ERP especial</button>
          </form>

          {authError && <p className="error">{authError}</p>}
          <button className="ghost-btn" onClick={handleLogout}>
            Sair da conta
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="erp-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E-S</div>
          <div>
            <h1>E-Sentinel</h1>
            <p>
              {selectedBusiness?.name || settings?.companyName || "Gestão inteligente de sabonetes"}
            </p>
          </div>
        </div>
        <nav className="menu">
          {Object.entries(moduleMeta).map(([key, meta]) => (
            <button
              key={key}
              className={activeModule === key ? "nav-button active" : "nav-button"}
              onClick={() => selectModule(key as ModuleKey)}
            >
              <span className="nav-icon">{meta.short}</span>
              <span>
                <strong>{meta.label}</strong>
                <small>{meta.helper}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="theme-switch">
          <small>Personalize o visual no módulo de usuário.</small>
          <button className="ghost-btn" onClick={() => selectModule("usuario")}>
            Abrir preferências
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="mobile-topbar">
          <div className="mobile-brand">
            <div className="brand-mark">E-S</div>
            <div>
              <strong>E-Sentinel</strong>
              <small>{moduleMeta[activeModule].label}</small>
            </div>
          </div>
          <button className="ghost-btn mobile-menu-trigger" onClick={() => setMobileMenuOpen((prev) => !prev)}>
            {mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          </button>
        </header>

        {mobileMenuOpen ? (
          <section className="mobile-menu-panel">
            <nav className="menu mobile-menu-list">
              {Object.entries(moduleMeta).map(([key, meta]) => (
                <button
                  key={key}
                  className={activeModule === key ? "nav-button active" : "nav-button"}
                  onClick={() => selectModule(key as ModuleKey)}
                >
                  <span className="nav-icon">{meta.short}</span>
                  <span>
                    <strong>{meta.label}</strong>
                    <small>{meta.helper}</small>
                  </span>
                </button>
              ))}
            </nav>
          </section>
        ) : null}

        <header className="content-header">
          <div>
            <h2>{moduleMeta[activeModule].label}</h2>
            <p>
              {currentDate} -{" "}
              {workspaceId === "geral"
                ? "ERP Geral (consolidado)"
                : `ERP Especial: ${selectedBusiness?.name || workspaceId}`}
            </p>
            {!isGeneralWorkspace && pendingApprovalsCount > 0 ? (
              <p>{pendingApprovalsCount} item(ns) aguardando aprovacao automatizada.</p>
            ) : null}
          </div>
          <div className="header-actions">
            <button className="ghost-btn" onClick={loadAllData}>
              Atualizar dados
            </button>
            <button className="ghost-btn" onClick={() => setWorkspaceId(null)}>
              Trocar ERP
            </button>
            <button
              className="ghost-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
            >
              Sair ({currentUser?.name || "Usuário"})
            </button>
          </div>
        </header>

        {loading && <p className="feedback">Carregando dados...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && activeModule === "dashboard" && dashboard && biInsights && (
          <>
            <section className="kpi-grid">
              <article className="kpi-card animated delay-1">
                <h3>Faturamento</h3>
                <strong>{formatBRL(dashboard.revenue)}</strong>
                <span>Receita total em vendas</span>
              </article>
              <article className="kpi-card animated delay-2">
                <h3>Despesas</h3>
                <strong>{formatBRL(dashboard.expenses)}</strong>
                <span>Custos operacionais lançados</span>
              </article>
              <article className="kpi-card animated delay-3">
                <h3>Lucro</h3>
                <strong>{formatBRL(dashboard.profit)}</strong>
                <span>Resultado consolidado</span>
              </article>
              <article className="kpi-card animated delay-4">
                <h3>Contas a receber</h3>
                <strong>{formatBRL(totalOpenReceivables)}</strong>
                <span>Valores pendentes</span>
              </article>
            </section>

            <section className="kpi-grid kpi-grid-bi">
              <article className="kpi-card animated delay-1">
                <h3>Margem líquida</h3>
                <strong>{biInsights.kpis.margin.toFixed(1)}%</strong>
                <span>Eficiência sobre faturamento do mês</span>
              </article>
              <article className="kpi-card animated delay-2">
                <h3>Crescimento de vendas</h3>
                <strong>{formatPct(biInsights.kpis.revenueGrowth)}</strong>
                <span>Comparativo com o mês anterior</span>
              </article>
              <article className="kpi-card animated delay-3">
                <h3>Crescimento do lucro</h3>
                <strong>{formatPct(biInsights.kpis.profitGrowth)}</strong>
                <span>Variação mensal do resultado</span>
              </article>
              <article className="kpi-card animated delay-4">
                <h3>Ticket médio</h3>
                <strong>{formatBRL(biInsights.kpis.averageTicket)}</strong>
                <span>{biInsights.kpis.salesCount} vendas no mês corrente</span>
              </article>
            </section>

            <section className="quick-grid animated">
              <button className="quick-card" onClick={() => selectModule("vendas")}>
                <h4>Novo pedido</h4>
                <p>Registrar venda rapidamente no caixa</p>
              </button>
              <button className="quick-card" onClick={() => selectModule("produtos")}>
                <h4>Gerir estoque</h4>
                <p>Atualizar catálogo e acompanhar mínimos</p>
              </button>
              <button className="quick-card" onClick={() => selectModule("financeiro")}>
                <h4>Fluxo financeiro</h4>
                <p>Controlar despesas e contas futuras</p>
              </button>
            </section>

            <section className="module-grid animated bi-grid">
              <article className="table-card">
                <h3>Relatório visual: receita x custo x lucro (6 meses)</h3>
                <p className="theme-helper">
                  Atualização em tempo real a cada 15s{" "}
                  {biRefreshing ? "(sincronizando...)" : `(última: ${new Date(biInsights.updatedAt).toLocaleTimeString("pt-BR")})`}
                </p>
                <div className="bi-series-list">
                  {biInsights.timeseries.map((point) => (
                    <div className="bi-series-row" key={point.period}>
                      <div className="bi-series-head">
                        <strong>{point.label}</strong>
                        <span>{formatBRL(point.profit)}</span>
                      </div>
                      <div className="bi-series-bars">
                        <div
                          className="bi-bar revenue"
                          style={{ width: `${(point.revenue / maxTimeseriesValue) * 100}%` }}
                          title={`Receita: ${formatBRL(point.revenue)}`}
                        />
                        <div
                          className="bi-bar expenses"
                          style={{ width: `${(point.expenses / maxTimeseriesValue) * 100}%` }}
                          title={`Custos: ${formatBRL(point.expenses)}`}
                        />
                        <div
                          className="bi-bar profit"
                          style={{ width: `${(Math.max(point.profit, 0) / maxTimeseriesValue) * 100}%` }}
                          title={`Lucro: ${formatBRL(point.profit)}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="table-card">
                <h3>Top produtos por faturamento no mês</h3>
                {biInsights.topProducts.length === 0 ? (
                  <p className="empty">Sem vendas suficientes para análise neste período.</p>
                ) : (
                  <div className="bi-rank-list">
                    {biInsights.topProducts.map((item) => (
                      <div className="bi-rank-row" key={item.name}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.quantity} unidades vendidas</small>
                        </div>
                        <div className="bi-rank-metric">
                          <span>{formatBRL(item.revenue)}</span>
                          <div
                            className="bi-rank-meter"
                            style={{ width: `${(item.revenue / maxTopProductValue) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="module-grid animated bi-grid">
              <article className="table-card">
                <h3>Custos por categoria (mês atual)</h3>
                {biInsights.costByCategory.length === 0 ? (
                  <p className="empty">Nenhum custo lançado no mês atual.</p>
                ) : (
                  <div className="bi-rank-list">
                    {biInsights.costByCategory.map((item) => (
                      <div className="bi-rank-row" key={item.category}>
                        <strong>{item.category}</strong>
                        <div className="bi-rank-metric">
                          <span>{formatBRL(item.total)}</span>
                          <div
                            className="bi-rank-meter expenses"
                            style={{ width: `${(item.total / maxCostCategoryValue) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="table-card">
                <h3>Análise preditiva para decisão</h3>
                <div className="prediction-grid">
                  <div className="prediction-card">
                    <span>Receita projetada</span>
                    <strong>{formatBRL(biInsights.forecast.nextRevenue)}</strong>
                  </div>
                  <div className="prediction-card">
                    <span>Custos projetados</span>
                    <strong>{formatBRL(biInsights.forecast.nextExpenses)}</strong>
                  </div>
                  <div className="prediction-card">
                    <span>Lucro projetado</span>
                    <strong>{formatBRL(biInsights.forecast.nextProfit)}</strong>
                  </div>
                </div>
                <p className="theme-helper">
                  Confiança da projeção: <strong>{biInsights.forecast.confidence}</strong>. Baseada na tendência dos últimos meses.
                </p>
                <h4 className="bi-subtitle">Risco de ruptura de estoque</h4>
                {biInsights.forecast.stockRisk.length === 0 ? (
                  <p className="empty">Sem risco imediato detectado com base no giro recente.</p>
                ) : (
                  <div className="bi-risk-list">
                    {biInsights.forecast.stockRisk.map((risk) => (
                      <div className="bi-risk-row" key={risk.productId}>
                        <div>
                          <strong>{risk.name}</strong>
                          <small>
                            Estoque: {risk.stock} | Mínimo: {risk.minStock} | Giro diário: {risk.avgDailySold}
                          </small>
                        </div>
                        <span>
                          {risk.projectedDaysToStockout === null
                            ? "Sem previsão"
                            : `${risk.projectedDaysToStockout} dias`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="table-card animated">
              <h3>Produtos com estoque crítico</h3>
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>SKU</th>
                    <th>Estoque</th>
                    <th>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.lowStock.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        Nenhum item em nível crítico no momento.
                      </td>
                    </tr>
                  ) : (
                    dashboard.lowStock.map((item) => (
                      <tr key={item._id}>
                        <td>{item.name}</td>
                        <td>{item.sku}</td>
                        <td>{item.stock}</td>
                        <td>{item.minStock}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="promo-card animated">
              <h3>ERP pronto para crescer com seu negócio</h3>
              <p>
                Expanda com fiscal, múltiplas lojas, permissões por perfil e painéis analíticos
                avançados sem trocar de plataforma.
              </p>
              <button className="ghost-btn" onClick={() => selectModule("clientes")}>
                Explorar módulos
              </button>
            </section>
          </>
        )}

        {!loading && activeModule === "clientes" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitCustomer}>
              <h3>Novo cliente</h3>
              <div className="form-field">
                <label>Nome</label>
                <small className="field-help">Como o cliente será identificado no sistema.</small>
                <input
                  placeholder="ex.: Maria Silva"
                  value={customerForm.name}
                  onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>E-mail</label>
                <small className="field-help">Opcional. Útil para envio de comprovantes e contato.</small>
                <input
                  placeholder="ex.: maria@email.com"
                  value={customerForm.email}
                  onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Telefone</label>
                <small className="field-help">Opcional. Use DDD + número para contato/WhatsApp.</small>
                <input
                  placeholder="ex.: (11) 99999-9999"
                  value={customerForm.phone}
                  onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })}
                />
              </div>
              <button type="submit">Cadastrar</button>
            </form>
            <section className="table-card">
              <h3>Lista de clientes</h3>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((item) => (
                    <tr key={item._id}>
                      <td>{item.name}</td>
                      <td>{item.email || "-"}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.status}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-btn" onClick={() => editCustomer(item)}>
                            Editar
                          </button>
                          <button type="button" className="ghost-btn danger" onClick={() => deleteCustomer(item)}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "produtos" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitProduct}>
              <h3>Novo produto</h3>
              <div className="form-field">
                <label>Nome</label>
                <small className="field-help">Nome do item no catálogo (ex.: “Sabonete Lavanda 90g”).</small>
                <input
                  placeholder="ex.: Sabonete Lavanda 90g"
                  value={productForm.name}
                  onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>SKU</label>
                <small className="field-help">Identificador único do produto (não repita).</small>
                <input
                  placeholder="ex.: SAB-LAV-90"
                  value={productForm.sku}
                  onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Código do produto</label>
                <small className="field-help">Opcional. Código interno/etiqueta.</small>
                <input
                  placeholder="ex.: 00123"
                  value={productForm.productCode}
                  onChange={(event) => setProductForm({ ...productForm, productCode: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Descrição</label>
                <small className="field-help">Opcional. Detalhes para consulta rápida e notas.</small>
                <textarea
                  rows={3}
                  placeholder="ex.: Base vegetal, aroma lavanda, embalagem kraft..."
                  value={productForm.description}
                  onChange={(event) => setProductForm({ ...productForm, description: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Fornecedor</label>
                <small className="field-help">Quem fornece/produz este item (obrigatório).</small>
                <select
                  value={productForm.supplierId}
                  onChange={(event) => setProductForm({ ...productForm, supplierId: event.target.value })}
                  required
                >
                  <option value="">Selecione o fornecedor</option>
                  {suppliers.filter((s) => s.status === "ATIVO").map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Preço de venda</label>
                <small className="field-help">Quanto você cobra do cliente (R$).</small>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="ex.: 12,90"
                  value={productForm.price}
                  onChange={(event) => setProductForm({ ...productForm, price: Number(event.target.value) })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Custo</label>
                <small className="field-help">Quanto custa para produzir/comprar (R$).</small>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="ex.: 6,20"
                  value={productForm.cost}
                  onChange={(event) => setProductForm({ ...productForm, cost: Number(event.target.value) })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Estoque inicial</label>
                <small className="field-help">Quantidade disponível agora (unidades).</small>
                <input
                  type="number"
                  min={0}
                  placeholder="ex.: 100"
                  value={productForm.stock}
                  onChange={(event) => setProductForm({ ...productForm, stock: Number(event.target.value) })}
                />
              </div>
              <div className="form-field">
                <label>Estoque mínimo</label>
                <small className="field-help">Alerta de reposição quando o estoque ficar abaixo deste número.</small>
                <input
                  type="number"
                  min={0}
                  placeholder="ex.: 10"
                  value={productForm.minStock}
                  onChange={(event) => setProductForm({ ...productForm, minStock: Number(event.target.value) })}
                />
              </div>
              <div className="form-field">
                <label>Foto do produto</label>
                <small className="field-help">Opcional. Envie uma imagem para o catálogo (salva no MongoDB).</small>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setProductPhotoFile(file);
                  }}
                />
              </div>
              <button type="submit">Cadastrar produto</button>
            </form>
            <section className="table-card">
              <h3>Produtos</h3>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>SKU</th>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Preço</th>
                    <th>Custo</th>
                    <th>Estoque</th>
                    <th>Foto</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((item) => (
                    <tr key={item._id}>
                      <td>{item.name}</td>
                      <td>{item.sku}</td>
                      <td>{item.productCode || "-"}</td>
                      <td>{item.description || "-"}</td>
                      <td>{formatBRL(item.price)}</td>
                      <td>{formatBRL(item.cost)}</td>
                      <td>{item.stock}</td>
                      <td>
                        {item.hasPhoto ? (
                          <img
                            className="product-photo-thumb"
                            src={`${API_URL}${scopedPath(`/products/${item._id}/photo`)}`}
                            alt={`Foto de ${item.name}`}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-btn" onClick={() => editProduct(item)}>
                            Editar
                          </button>
                          <button type="button" className="ghost-btn danger" onClick={() => deleteProduct(item)}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "vendas" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitSale}>
              <h3>Registrar venda</h3>
              <div className="form-field">
                <label>Produto</label>
                <small className="field-help">Selecione o item vendido (mostra estoque atual).</small>
                <select
                  value={saleForm.productId}
                  onChange={(event) => setSaleForm({ ...saleForm, productId: event.target.value })}
                  required
                >
                  <option value="">Selecione o produto</option>
                  {products.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} ({item.stock} un.)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Quantidade</label>
                <small className="field-help">Unidades vendidas (não pode exceder o estoque).</small>
                <input
                  type="number"
                  min={1}
                  placeholder="ex.: 2"
                  value={saleForm.quantity}
                  onChange={(event) => setSaleForm({ ...saleForm, quantity: Number(event.target.value) })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Forma de pagamento</label>
                <small className="field-help">Como o cliente pagou (PIX, dinheiro, cartão, boleto).</small>
                <select
                  value={saleForm.paymentMethod}
                  onChange={(event) => setSaleForm({ ...saleForm, paymentMethod: event.target.value })}
                >
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </div>
              <button type="submit">Lançar venda</button>
              <button type="button" className="ghost-btn" onClick={() => setPixModalOpen(true)}>
                Abrir PIX
              </button>
            </form>
            <section className="table-card">
              <h3>Vendas recentes</h3>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Total</th>
                    <th>Pagamento</th>
                    <th>Status</th>
                    <th>Faturamento</th>
                    <th>NF-e</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td>{formatBRL(item.totalAmount)}</td>
                      <td>{item.paymentMethod}</td>
                      <td>{item.status}</td>
                      <td>{item.billingStatus || "-"}</td>
                      <td>{item.invoice?.number || "Gerando..."}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-btn" onClick={() => editSale(item)}>
                            Editar
                          </button>
                          <button type="button" className="ghost-btn danger" onClick={() => deleteSale(item)}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {pixModalOpen ? (
              <div className="pix-modal-overlay" onClick={() => setPixModalOpen(false)}>
                <div className="pix-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="pix-modal-header">
                    <h3>Pagamento via PIX</h3>
                    <button type="button" className="ghost-btn" onClick={() => setPixModalOpen(false)}>
                      Fechar
                    </button>
                  </div>
                  <img src="/pix.jpg" alt="QR Code PIX" className="pix-modal-image" />
                </div>
              </div>
            ) : null}
          </section>
        )}

        {!loading && activeModule === "compras" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitPurchase}>
              <h3>Registrar compra</h3>
              <div className="form-field">
                <label>Fornecedor</label>
                <small className="field-help">De quem você está comprando (filtra os produtos vinculados).</small>
                <select
                  value={purchaseForm.supplierId}
                  onChange={(event) => {
                    setPurchaseForm({ ...purchaseForm, supplierId: event.target.value, productId: "" });
                  }}
                  required
                >
                  <option value="">Selecione o fornecedor</option>
                  {suppliers.filter((s) => s.status === "ATIVO").map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Produto</label>
                <small className="field-help">Item que está entrando no estoque.</small>
                <select
                  value={purchaseForm.productId}
                  onChange={(event) => setPurchaseForm({ ...purchaseForm, productId: event.target.value })}
                  required
                  disabled={!purchaseForm.supplierId}
                >
                  <option value="">
                    {purchaseForm.supplierId ? "Selecione o produto" : "Selecione primeiro o fornecedor"}
                  </option>
                  {filteredProductsBySupplier.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Quantidade</label>
                <small className="field-help">Unidades compradas (serão somadas ao estoque).</small>
                <input
                  type="number"
                  min={1}
                  placeholder="ex.: 50"
                  value={purchaseForm.quantity}
                  onChange={(event) => setPurchaseForm({ ...purchaseForm, quantity: Number(event.target.value) })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Custo unitário</label>
                <small className="field-help">Valor por unidade (R$).</small>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="ex.: 4,80"
                  value={purchaseForm.cost}
                  onChange={(event) => setPurchaseForm({ ...purchaseForm, cost: Number(event.target.value) })}
                  required
                />
              </div>
              <button type="submit">Lançar compra</button>
            </form>
            <section className="table-card">
              <h3>Compras recentes</h3>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Fornecedor</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Aprovação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td>{item.supplier}</td>
                      <td>{formatBRL(item.totalAmount)}</td>
                      <td>{item.status}</td>
                      <td>{item.approval?.status || "-"}</td>
                      <td>
                        <div className="table-actions">
                          {item.status === "AGUARDANDO_APROVACAO" ? (
                            <>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => reviewPurchase(item._id, "aprovar")}
                              >
                                Aprovar
                              </button>
                              <button
                                type="button"
                                className="ghost-btn danger"
                                onClick={() => reviewPurchase(item._id, "rejeitar")}
                              >
                                Rejeitar
                              </button>
                            </>
                          ) : null}
                          <button type="button" className="ghost-btn" onClick={() => editPurchase(item)}>
                            Editar
                          </button>
                          <button type="button" className="ghost-btn danger" onClick={() => deletePurchase(item)}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "fornecedores" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitSupplier}>
              <h3>Novo fornecedor</h3>
              <div className="form-field">
                <label>Nome</label>
                <small className="field-help">Razão social ou nome do fornecedor.</small>
                <input
                  placeholder="ex.: Fornecedor ABC"
                  value={supplierForm.name}
                  onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>CNPJ/CPF</label>
                <small className="field-help">Opcional. Ajuda em emissão e controle fiscal.</small>
                <input
                  placeholder="ex.: 12.345.678/0001-99"
                  value={supplierForm.document}
                  onChange={(event) => setSupplierForm({ ...supplierForm, document: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Contato (telefone)</label>
                <small className="field-help">Telefone principal (usado para comunicação).</small>
                <input
                  placeholder="ex.: (11) 98888-7777"
                  value={supplierForm.contact}
                  onChange={(event) => setSupplierForm({ ...supplierForm, contact: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Chave PIX</label>
                <small className="field-help">Opcional. Facilita pagamento via PIX.</small>
                <input
                  placeholder="ex.: chave@pix.com"
                  value={supplierForm.pixKey}
                  onChange={(event) => setSupplierForm({ ...supplierForm, pixKey: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Cidade</label>
                <small className="field-help">Opcional. Para logística e relatórios.</small>
                <input
                  placeholder="ex.: São Paulo"
                  value={supplierForm.city}
                  onChange={(event) => setSupplierForm({ ...supplierForm, city: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Ramo de atuação</label>
                <small className="field-help">Opcional. Ex.: embalagens, fragrâncias, insumos.</small>
                <input
                  placeholder="ex.: Insumos"
                  value={supplierForm.businessArea}
                  onChange={(event) => setSupplierForm({ ...supplierForm, businessArea: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Condição de pagamento</label>
                <small className="field-help">Forma mais comum de pagamento para este fornecedor.</small>
                <select
                  value={supplierForm.paymentCondition}
                  onChange={(event) =>
                    setSupplierForm({
                      ...supplierForm,
                      paymentCondition: event.target.value as "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO",
                    })
                  }
                >
                  <option value="BOLETO">Boleto</option>
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </div>
              <button type="submit">Cadastrar fornecedor</button>
            </form>
            <section className="table-card">
              <h3>Lista de fornecedores</h3>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CNPJ/CPF</th>
                    <th>Contato</th>
                    <th>Cidade</th>
                    <th>Ramo</th>
                    <th>Pagamento</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty">
                        Nenhum fornecedor cadastrado ainda.
                      </td>
                    </tr>
                  ) : (
                    suppliers.map((item) => (
                      <tr key={item._id}>
                        <td>{item.name}</td>
                        <td>{item.document || "-"}</td>
                        <td>{item.contact}</td>
                        <td>{item.city || "-"}</td>
                        <td>{item.businessArea || "-"}</td>
                        <td>{item.paymentCondition}</td>
                        <td>{item.status}</td>
                        <td>
                          <div className="table-actions">
                            <button type="button" className="ghost-btn" onClick={() => editSupplier(item)}>
                              Editar
                            </button>
                            <button type="button" className="ghost-btn danger" onClick={() => deleteSupplier(item)}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "financeiro" && (
          <>
            <section className="table-card animated economic-card">
              <h3>Câmbio e indicadores econômicos</h3>
              <p className="theme-helper">
                Fonte: {economicIndicators?.exchange.source || "AwesomeAPI"} e{" "}
                {economicIndicators?.indicators.source || "Banco Central (SGS)"}.
              </p>
              <div className="economic-grid">
                <article className="economic-item">
                  <strong>USD/BRL</strong>
                  <span>
                    {economicIndicators?.exchange.usdBrl
                      ? formatBRL(economicIndicators.exchange.usdBrl)
                      : "Indisponível"}
                  </span>
                </article>
                <article className="economic-item">
                  <strong>EUR/BRL</strong>
                  <span>
                    {economicIndicators?.exchange.eurBrl
                      ? formatBRL(economicIndicators.exchange.eurBrl)
                      : "Indisponível"}
                  </span>
                </article>
                <article className="economic-item">
                  <strong>SELIC (%)</strong>
                  <span>
                    {typeof economicIndicators?.indicators.selic === "number"
                      ? `${economicIndicators.indicators.selic.toFixed(2)}%`
                      : "Indisponível"}
                  </span>
                </article>
                <article className="economic-item">
                  <strong>IPCA (%)</strong>
                  <span>
                    {typeof economicIndicators?.indicators.ipca === "number"
                      ? `${economicIndicators.indicators.ipca.toFixed(2)}%`
                      : "Indisponível"}
                  </span>
                </article>
              </div>
            </section>

            <section className="module-grid animated">
              <form className="form-card" onSubmit={submitExpense}>
                <h3>Nova despesa</h3>
                <div className="form-field">
                  <label>Descrição</label>
                  <small className="field-help">O que é esta despesa (ex.: “Aluguel”, “Embalagens”).</small>
                  <input
                    placeholder="ex.: Aluguel"
                    value={expenseForm.description}
                    onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Categoria</label>
                  <small className="field-help">Tipo da despesa para relatórios (ex.: operacional, marketing).</small>
                  <input
                    placeholder="ex.: OPERACIONAL"
                    value={expenseForm.category}
                    onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Valor</label>
                  <small className="field-help">Quanto será pago (R$).</small>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="ex.: 350,00"
                    value={expenseForm.amount}
                    onChange={(event) => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Vencimento</label>
                  <small className="field-help">Data limite para pagamento.</small>
                  <input
                    type="date"
                    value={expenseForm.dueDate}
                    onChange={(event) => setExpenseForm({ ...expenseForm, dueDate: event.target.value })}
                    required
                  />
                </div>
                <button type="submit">Lançar despesa</button>
              </form>
              <section className="table-card">
                <h3>Contas a pagar</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Aprovação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((item) => (
                      <tr key={item._id}>
                        <td>{item.description}</td>
                        <td>{item.category}</td>
                        <td>{new Date(item.dueDate).toLocaleDateString("pt-BR")}</td>
                        <td>{formatBRL(item.amount)}</td>
                        <td>{item.status}</td>
                        <td>{item.approval?.status || "-"}</td>
                        <td>
                          <div className="table-actions">
                            {item.status === "AGUARDANDO_APROVACAO" ? (
                              <>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => reviewExpense(item._id, "aprovar")}
                                >
                                  Aprovar
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn danger"
                                  onClick={() => reviewExpense(item._id, "rejeitar")}
                                >
                                  Rejeitar
                                </button>
                              </>
                            ) : null}
                            {item.status === "PENDENTE" ? (
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => reviewExpense(item._id, "pagar")}
                              >
                                Marcar pago
                              </button>
                            ) : null}
                            <button type="button" className="ghost-btn" onClick={() => editExpense(item)}>
                              Editar
                            </button>
                            <button type="button" className="ghost-btn danger" onClick={() => deleteExpense(item)}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </section>
          </>
        )}

        {!loading && activeModule === "checklist" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitChecklistItem}>
              <h3>Nova ideia de implementação</h3>
              <div className="form-field">
                <label>Título</label>
                <small className="field-help">Nome curto da melhoria/funcionalidade desejada.</small>
                <input
                  placeholder="ex.: Emitir NF-e automática"
                  value={checklistForm.title}
                  onChange={(event) => setChecklistForm({ ...checklistForm, title: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Detalhes</label>
                <small className="field-help">Opcional. Contexto, regras e observações.</small>
                <textarea
                  rows={4}
                  placeholder="Descreva o que precisa, quando usar, regras de negócio..."
                  value={checklistForm.notes}
                  onChange={(event) => setChecklistForm({ ...checklistForm, notes: event.target.value })}
                />
              </div>
              <button type="submit">Adicionar à checklist</button>
            </form>
            <section className="table-card">
              <h3>Checklist de futuros implementos</h3>
              <table>
                <thead>
                  <tr>
                    <th>Ideia</th>
                    <th>Detalhes</th>
                    <th>Criada em</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {checklistItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        Nenhuma ideia cadastrada ainda.
                      </td>
                    </tr>
                  ) : (
                    checklistItems.map((item) => (
                      <tr key={item._id}>
                        <td>{item.title}</td>
                        <td>{item.notes || "-"}</td>
                        <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                        <td>{item.completed ? "Concluída" : "Pendente"}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => toggleChecklistItem(item)}
                            >
                              {item.completed ? "Marcar pendente" : "Marcar concluída"}
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => editChecklistItem(item)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => deleteChecklistItem(item)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "usuario" && (
          <section className="module-grid animated user-grid">
            <form className="form-card" onSubmit={submitUserProfile}>
              <h3>Gestão do usuário</h3>
              <div className="form-field">
                <label>Nome do usuário</label>
                <small className="field-help">Como você quer aparecer no sistema e nas aprovações.</small>
                <input
                  placeholder="ex.: Administrador"
                  value={userForm.userName}
                  onChange={(event) => setUserForm({ ...userForm, userName: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>E-mail</label>
                <small className="field-help">E-mail do responsável (usado em comunicação/relatórios).</small>
                <input
                  type="email"
                  placeholder="ex.: admin@empresa.com"
                  value={userForm.userEmail}
                  onChange={(event) => setUserForm({ ...userForm, userEmail: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label>Cargo</label>
                <small className="field-help">Seu papel (ex.: Gestor, Financeiro).</small>
                <input
                  placeholder="ex.: Gestor"
                  value={userForm.userRole}
                  onChange={(event) => setUserForm({ ...userForm, userRole: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Nome da empresa</label>
                <small className="field-help">Nome exibido no cabeçalho e no módulo do usuário.</small>
                <input
                  placeholder="ex.: E-Sentinel Sabonetes"
                  value={userForm.companyName}
                  onChange={(event) => setUserForm({ ...userForm, companyName: event.target.value })}
                />
              </div>
              <button type="submit">Salvar perfil</button>
            </form>

            <section className="table-card">
              <h3>Tema da interface</h3>
              <p className="theme-helper">
                Escolha um dos 6 temas elegantes e aplique imediatamente no seu ERP.
              </p>
              <div className="theme-cards">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={theme === option.value ? "theme-card active" : "theme-card"}
                    onClick={() => handleThemeChange(option.value)}
                  >
                    <span className={`theme-preview ${option.value}`}></span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="table-card whatsapp-card">
              <h3>WhatsApp Business</h3>
              <p className="theme-helper">
                Integração nativa do sistema para notificações operacionais, envio manual e cobranças.
              </p>
              <div className="whatsapp-status">
                <span>
                  Status:{" "}
                  <strong>{whatsAppStatus?.configured ? "Conectado" : "Não configurado"}</strong>
                </span>
                <span>
                  Notificação interna: <strong>{whatsAppStatus?.notifyTo || "Não definido"}</strong>
                </span>
              </div>
              <form className="whatsapp-form" onSubmit={sendManualWhatsAppMessage}>
                <div className="form-field">
                  <label>Telefone de destino</label>
                  <small className="field-help">DDD + número. Ex.: 11999999999.</small>
                  <input
                    placeholder="ex.: 11999999999"
                    value={whatsAppForm.phone}
                    onChange={(event) => setWhatsAppForm({ ...whatsAppForm, phone: event.target.value })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Mensagem</label>
                  <small className="field-help">Texto que será enviado pelo WhatsApp Business.</small>
                  <textarea
                    rows={4}
                    placeholder="Digite sua mensagem..."
                    value={whatsAppForm.message}
                    onChange={(event) => setWhatsAppForm({ ...whatsAppForm, message: event.target.value })}
                    required
                  />
                </div>
                <div className="table-actions">
                  <button type="submit" className="ghost-btn">
                    Enviar mensagem
                  </button>
                  <button type="button" className="ghost-btn" onClick={loadWhatsAppStatus}>
                    Atualizar status
                  </button>
                </div>
              </form>
            </section>
          </section>
        )}

        {editModalOpen && editModalKind && editingId ? (
          <AppModal
            title={
              editModalKind === "customer"
                ? "Editar cliente"
                : editModalKind === "product"
                  ? "Editar produto"
                  : editModalKind === "supplier"
                    ? "Editar fornecedor"
                    : editModalKind === "sale"
                      ? "Editar venda"
                      : editModalKind === "purchase"
                        ? "Editar compra"
                        : editModalKind === "expense"
                          ? "Editar despesa"
                          : "Editar item"
            }
            subtitle={editModalSubtitle}
            onClose={closeEditModal}
          >
            {editModalKind === "customer" ? (
              <>
                <div className="form-field">
                  <label>Nome</label>
                  <input
                    value={editCustomerForm.name}
                    onChange={(event) => setEditCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>E-mail</label>
                  <input
                    value={editCustomerForm.email}
                    onChange={(event) => setEditCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Telefone</label>
                  <input
                    value={editCustomerForm.phone}
                    onChange={(event) => setEditCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Status</label>
                  <select
                    value={editCustomerForm.status}
                    onChange={(event) =>
                      setEditCustomerForm((prev) => ({
                        ...prev,
                        status: event.target.value === "INATIVO" ? "INATIVO" : "ATIVO",
                      }))
                    }
                  >
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                  </select>
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      if (!editCustomerForm.name.trim()) {
                        setError("O nome do cliente não pode ficar vazio.");
                        return;
                      }
                      await api.patch<Customer>(scopedPath(`/customers/${editingId}`), {
                        name: editCustomerForm.name.trim(),
                        email: editCustomerForm.email.trim(),
                        phone: editCustomerForm.phone.trim(),
                        status: editCustomerForm.status,
                      });
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}

            {editModalKind === "product" ? (
              <>
                <div className="form-field">
                  <label>Nome</label>
                  <input
                    value={editProductForm.name}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>SKU</label>
                  <input
                    value={editProductForm.sku}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, sku: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Código</label>
                  <input
                    value={editProductForm.productCode}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, productCode: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Descrição</label>
                  <textarea
                    rows={3}
                    value={editProductForm.description}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Fornecedor</label>
                  <select
                    value={editProductForm.supplierId}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, supplierId: event.target.value }))}
                    required
                  >
                    <option value="">Selecione</option>
                    {suppliers.filter((s) => s.status === "ATIVO").map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Preço</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editProductForm.price}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, price: Number(event.target.value) }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Custo</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editProductForm.cost}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, cost: Number(event.target.value) }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Estoque</label>
                  <input
                    type="number"
                    min={0}
                    value={editProductForm.stock}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, stock: Number(event.target.value) }))}
                  />
                </div>
                <div className="form-field">
                  <label>Estoque mínimo</label>
                  <input
                    type="number"
                    min={0}
                    value={editProductForm.minStock}
                    onChange={(event) =>
                      setEditProductForm((prev) => ({ ...prev, minStock: Number(event.target.value) }))
                    }
                  />
                </div>
                <div className="form-field">
                  <label>Ativo</label>
                  <select
                    value={editProductForm.active ? "true" : "false"}
                    onChange={(event) => setEditProductForm((prev) => ({ ...prev, active: event.target.value === "true" }))}
                  >
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Foto do produto</label>
                  <small className="field-help">Opcional. Para trocar a foto, selecione uma nova imagem.</small>
                  {editProductHasPhoto && editingId ? (
                    <img
                      className="product-photo-preview"
                      src={`${API_URL}${scopedPath(`/products/${editingId}/photo`)}`}
                      alt={`Foto de ${editProductForm.name || "produto"}`}
                    />
                  ) : (
                    <span className="field-help">Sem foto cadastrada.</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setEditProductPhotoFile(file);
                    }}
                  />
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      if (!editProductForm.name.trim() || !editProductForm.sku.trim() || !editProductForm.supplierId) {
                        setError("Preencha nome, SKU e fornecedor.");
                        return;
                      }
                      await api.patch<Product>(scopedPath(`/products/${editingId}`), {
                        name: editProductForm.name.trim(),
                        sku: editProductForm.sku.trim(),
                        productCode: editProductForm.productCode.trim(),
                        description: editProductForm.description.trim(),
                        price: editProductForm.price,
                        cost: editProductForm.cost,
                        stock: editProductForm.stock,
                        minStock: editProductForm.minStock,
                        supplier: editProductForm.supplierId,
                        active: editProductForm.active,
                      });
                      if (editProductPhotoFile) {
                        const formData = new FormData();
                        formData.append("photo", editProductPhotoFile);
                        await api.postFormData<{ ok: boolean; hasPhoto: boolean }>(
                          scopedPath(`/products/${editingId}/photo`),
                          formData
                        );
                      }
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}

            {editModalKind === "supplier" ? (
              <>
                <div className="form-field">
                  <label>Nome</label>
                  <input
                    value={editSupplierForm.name}
                    onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>CNPJ/CPF</label>
                  <input
                    value={editSupplierForm.document}
                    onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, document: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Contato</label>
                  <input
                    value={editSupplierForm.contact}
                    onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, contact: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Chave PIX</label>
                  <input
                    value={editSupplierForm.pixKey}
                    onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, pixKey: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Cidade</label>
                  <input
                    value={editSupplierForm.city}
                    onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Ramo</label>
                  <input
                    value={editSupplierForm.businessArea}
                    onChange={(event) => setEditSupplierForm((prev) => ({ ...prev, businessArea: event.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label>Pagamento</label>
                  <select
                    value={editSupplierForm.paymentCondition}
                    onChange={(event) =>
                      setEditSupplierForm((prev) => ({
                        ...prev,
                        paymentCondition: event.target.value as Supplier["paymentCondition"],
                      }))
                    }
                  >
                    <option value="BOLETO">BOLETO</option>
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">DINHEIRO</option>
                    <option value="CREDITO">CREDITO</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Status</label>
                  <select
                    value={editSupplierForm.status}
                    onChange={(event) =>
                      setEditSupplierForm((prev) => ({
                        ...prev,
                        status: event.target.value === "INATIVO" ? "INATIVO" : "ATIVO",
                      }))
                    }
                  >
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                  </select>
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      if (!editSupplierForm.name.trim() || !editSupplierForm.contact.trim()) {
                        setError("Preencha nome e contato.");
                        return;
                      }
                      await api.patch<Supplier>(scopedPath(`/suppliers/${editingId}`), {
                        name: editSupplierForm.name.trim(),
                        document: editSupplierForm.document.trim(),
                        contact: editSupplierForm.contact.trim(),
                        pixKey: editSupplierForm.pixKey.trim(),
                        city: editSupplierForm.city.trim(),
                        businessArea: editSupplierForm.businessArea.trim(),
                        paymentCondition: editSupplierForm.paymentCondition,
                        status: editSupplierForm.status,
                      });
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}

            {editModalKind === "sale" ? (
              <>
                <div className="form-field">
                  <label>Forma de pagamento</label>
                  <select
                    value={editSaleForm.paymentMethod}
                    onChange={(event) => setEditSaleForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                  >
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">DINHEIRO</option>
                    <option value="CARTAO">CARTAO</option>
                    <option value="BOLETO">BOLETO</option>
                    <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Status</label>
                  <select
                    value={editSaleForm.status}
                    onChange={(event) => setEditSaleForm((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    <option value="PAGO">PAGO</option>
                    <option value="PENDENTE">PENDENTE</option>
                    <option value="CANCELADO">CANCELADO</option>
                  </select>
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      await api.patch<Sale>(scopedPath(`/sales/${editingId}`), {
                        paymentMethod: editSaleForm.paymentMethod,
                        status: editSaleForm.status,
                      });
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}

            {editModalKind === "purchase" ? (
              <>
                <div className="form-field">
                  <label>Status</label>
                  <select
                    value={editPurchaseForm.status}
                    onChange={(event) =>
                      setEditPurchaseForm((prev) => ({ ...prev, status: event.target.value as Purchase["status"] }))
                    }
                  >
                    <option value="ABERTA">ABERTA</option>
                    <option value="AGUARDANDO_APROVACAO">AGUARDANDO_APROVACAO</option>
                    <option value="APROVADA">APROVADA</option>
                    <option value="RECEBIDA">RECEBIDA</option>
                    <option value="REJEITADA">REJEITADA</option>
                    <option value="CANCELADA">CANCELADA</option>
                  </select>
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      await api.patch<Purchase>(scopedPath(`/purchases/${editingId}`), {
                        status: editPurchaseForm.status,
                      });
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}

            {editModalKind === "expense" ? (
              <>
                <div className="form-field">
                  <label>Descrição</label>
                  <input
                    value={editExpenseForm.description}
                    onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Categoria</label>
                  <input
                    value={editExpenseForm.category}
                    onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Valor</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editExpenseForm.amount}
                    onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, amount: Number(event.target.value) }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Vencimento</label>
                  <input
                    type="date"
                    value={editExpenseForm.dueDate}
                    onChange={(event) => setEditExpenseForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Status</label>
                  <select
                    value={editExpenseForm.status}
                    onChange={(event) =>
                      setEditExpenseForm((prev) => ({ ...prev, status: event.target.value as Expense["status"] }))
                    }
                  >
                    <option value="PENDENTE">PENDENTE</option>
                    <option value="PAGO">PAGO</option>
                    <option value="AGUARDANDO_APROVACAO">AGUARDANDO_APROVACAO</option>
                    <option value="REJEITADO">REJEITADO</option>
                  </select>
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      if (!editExpenseForm.description.trim()) {
                        setError("A descrição não pode ficar vazia.");
                        return;
                      }
                      await api.patch<Expense>(scopedPath(`/expenses/${editingId}`), {
                        description: editExpenseForm.description.trim(),
                        category: editExpenseForm.category.trim(),
                        amount: editExpenseForm.amount,
                        dueDate: editExpenseForm.dueDate,
                        status: editExpenseForm.status,
                      });
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}

            {editModalKind === "checklist" ? (
              <>
                <div className="form-field">
                  <label>Título</label>
                  <input
                    value={editChecklistForm.title}
                    onChange={(event) => setEditChecklistForm((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Detalhes</label>
                  <textarea
                    rows={4}
                    value={editChecklistForm.notes}
                    onChange={(event) => setEditChecklistForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
                <div className="app-modal-footer">
                  <button type="button" className="ghost-btn" onClick={closeEditModal}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isGeneralWorkspace) {
                        setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar.");
                        return;
                      }
                      if (!editChecklistForm.title.trim()) {
                        setError("O título da ideia não pode ficar vazio.");
                        return;
                      }
                      await api.patch<ChecklistItem>(scopedPath(`/checklist-items/${editingId}`), {
                        title: editChecklistForm.title.trim(),
                        notes: editChecklistForm.notes.trim(),
                      });
                      closeEditModal();
                      await loadAllData();
                    }}
                  >
                    Salvar alterações
                  </button>
                </div>
              </>
            ) : null}
          </AppModal>
        ) : null}
      </main>
    </div>
  );
}

export default App;
