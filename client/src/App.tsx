import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import type {
  AuthUser,
  BiInsights,
  Business,
  Customer,
  Dashboard,
  Expense,
  LoginResponse,
  Product,
  Purchase,
  Sale,
  Settings,
  Theme,
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
  | "financeiro"
  | "usuario";

const moduleMeta: Record<ModuleKey, { label: string; short: string; helper: string }> = {
  dashboard: { label: "Dashboard", short: "DB", helper: "Visão geral do negócio" },
  clientes: { label: "Clientes", short: "CL", helper: "Cadastro e relacionamento" },
  produtos: { label: "Produtos", short: "PR", helper: "Catálogo e estoque" },
  vendas: { label: "Vendas", short: "VD", helper: "PDV e faturamento" },
  compras: { label: "Compras", short: "CP", helper: "Fornecedores e entradas" },
  financeiro: { label: "Financeiro", short: "FN", helper: "Contas e despesas" },
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 10,
  });
  const [saleForm, setSaleForm] = useState({
    productId: "",
    quantity: 1,
    paymentMethod: "PIX",
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplier: "",
    productId: "",
    quantity: 1,
    cost: 0,
  });
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "OPERACIONAL",
    amount: 0,
    dueDate: new Date().toISOString().slice(0, 10),
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
      const [customersData, productsData, salesData, purchasesData, expensesData, settingsData] =
        await Promise.all([
          api.get<Customer[]>(scopedPath("/customers")),
          api.get<Product[]>(scopedPath("/products")),
          api.get<Sale[]>(scopedPath("/sales")),
          api.get<Purchase[]>(scopedPath("/purchases")),
          api.get<Expense[]>(scopedPath("/expenses")),
          api.get<Settings>("/settings"),
        ]);

      await loadDashboardBi(true);
      setCustomers(customersData);
      setProducts(productsData);
      setSales(salesData);
      setPurchases(purchasesData);
      setExpenses(expensesData);
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
    await api.post<Product>(scopedPath("/products"), {
      ...productForm,
      category: "SABONETE",
      active: true,
    });
    setProductForm({ name: "", sku: "", price: 0, cost: 0, stock: 0, minStock: 10 });
    await loadAllData();
  }

  async function submitSale(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    const product = products.find((item) => item._id === saleForm.productId);
    if (!product) return;

    await api.post<Sale>(scopedPath("/sales"), {
      items: [
        {
          product: product._id,
          quantity: Number(saleForm.quantity),
          unitPrice: product.price,
        },
      ],
      paymentMethod: saleForm.paymentMethod,
      status: "PAGO",
      createdBy: "Admin",
    });
    setSaleForm({ productId: "", quantity: 1, paymentMethod: "PIX" });
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

    await api.post<Purchase>(scopedPath("/purchases"), {
      supplier: purchaseForm.supplier,
      items: [
        {
          product: product._id,
          description: product.name,
          quantity: Number(purchaseForm.quantity),
          cost: Number(purchaseForm.cost),
        },
      ],
    });
    setPurchaseForm({ supplier: "", productId: "", quantity: 1, cost: 0 });
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
            <input
              type="email"
              placeholder="E-mail"
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Senha"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              required
            />
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
            <input
              placeholder="Nome do novo ERP especial"
              value={businessForm.name}
              onChange={(event) => setBusinessForm({ name: event.target.value })}
              required
            />
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
              <input
                placeholder="Nome"
                value={customerForm.name}
                onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                required
              />
              <input
                placeholder="E-mail"
                value={customerForm.email}
                onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })}
              />
              <input
                placeholder="Telefone"
                value={customerForm.phone}
                onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })}
              />
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
                  </tr>
                </thead>
                <tbody>
                  {customers.map((item) => (
                    <tr key={item._id}>
                      <td>{item.name}</td>
                      <td>{item.email || "-"}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.status}</td>
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
              <input
                placeholder="Nome"
                value={productForm.name}
                onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                required
              />
              <input
                placeholder="SKU"
                value={productForm.sku}
                onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })}
                required
              />
              <input
                type="number"
                placeholder="Preço de venda"
                value={productForm.price}
                onChange={(event) => setProductForm({ ...productForm, price: Number(event.target.value) })}
                required
              />
              <input
                type="number"
                placeholder="Custo"
                value={productForm.cost}
                onChange={(event) => setProductForm({ ...productForm, cost: Number(event.target.value) })}
                required
              />
              <input
                type="number"
                placeholder="Estoque inicial"
                value={productForm.stock}
                onChange={(event) => setProductForm({ ...productForm, stock: Number(event.target.value) })}
              />
              <input
                type="number"
                placeholder="Estoque mínimo"
                value={productForm.minStock}
                onChange={(event) => setProductForm({ ...productForm, minStock: Number(event.target.value) })}
              />
              <button type="submit">Cadastrar produto</button>
            </form>
            <section className="table-card">
              <h3>Produtos</h3>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>SKU</th>
                    <th>Preço</th>
                    <th>Custo</th>
                    <th>Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((item) => (
                    <tr key={item._id}>
                      <td>{item.name}</td>
                      <td>{item.sku}</td>
                      <td>{formatBRL(item.price)}</td>
                      <td>{formatBRL(item.cost)}</td>
                      <td>{item.stock}</td>
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
              <input
                type="number"
                min={1}
                placeholder="Quantidade"
                value={saleForm.quantity}
                onChange={(event) => setSaleForm({ ...saleForm, quantity: Number(event.target.value) })}
                required
              />
              <select
                value={saleForm.paymentMethod}
                onChange={(event) => setSaleForm({ ...saleForm, paymentMethod: event.target.value })}
              >
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="CARTAO">Cartão</option>
                <option value="BOLETO">Boleto</option>
              </select>
              <button type="submit">Lançar venda</button>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "compras" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitPurchase}>
              <h3>Registrar compra</h3>
              <input
                placeholder="Fornecedor"
                value={purchaseForm.supplier}
                onChange={(event) => setPurchaseForm({ ...purchaseForm, supplier: event.target.value })}
                required
              />
              <select
                value={purchaseForm.productId}
                onChange={(event) => setPurchaseForm({ ...purchaseForm, productId: event.target.value })}
                required
              >
                <option value="">Selecione o produto</option>
                {products.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                placeholder="Quantidade"
                value={purchaseForm.quantity}
                onChange={(event) => setPurchaseForm({ ...purchaseForm, quantity: Number(event.target.value) })}
                required
              />
              <input
                type="number"
                min={0}
                placeholder="Custo unitário"
                value={purchaseForm.cost}
                onChange={(event) => setPurchaseForm({ ...purchaseForm, cost: Number(event.target.value) })}
                required
              />
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
                        {item.status === "AGUARDANDO_APROVACAO" ? (
                          <div className="table-actions">
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
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "financeiro" && (
          <section className="module-grid animated">
            <form className="form-card" onSubmit={submitExpense}>
              <h3>Nova despesa</h3>
              <input
                placeholder="Descrição"
                value={expenseForm.description}
                onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })}
                required
              />
              <input
                placeholder="Categoria"
                value={expenseForm.category}
                onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}
                required
              />
              <input
                type="number"
                min={0}
                placeholder="Valor"
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })}
                required
              />
              <input
                type="date"
                value={expenseForm.dueDate}
                onChange={(event) => setExpenseForm({ ...expenseForm, dueDate: event.target.value })}
                required
              />
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {!loading && activeModule === "usuario" && (
          <section className="module-grid animated user-grid">
            <form className="form-card" onSubmit={submitUserProfile}>
              <h3>Gestão do usuário</h3>
              <input
                placeholder="Nome do usuário"
                value={userForm.userName}
                onChange={(event) => setUserForm({ ...userForm, userName: event.target.value })}
                required
              />
              <input
                type="email"
                placeholder="E-mail"
                value={userForm.userEmail}
                onChange={(event) => setUserForm({ ...userForm, userEmail: event.target.value })}
                required
              />
              <input
                placeholder="Cargo"
                value={userForm.userRole}
                onChange={(event) => setUserForm({ ...userForm, userRole: event.target.value })}
              />
              <input
                placeholder="Nome da empresa"
                value={userForm.companyName}
                onChange={(event) => setUserForm({ ...userForm, companyName: event.target.value })}
              />
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
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
