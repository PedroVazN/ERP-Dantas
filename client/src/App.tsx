import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import type {
  AuthUser,
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
];

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
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

  function scopedPath(path: string) {
    if (!workspaceId) {
      return path;
    }
    if (workspaceId === "geral") {
      return `${path}?scope=geral`;
    }
    return `${path}?scope=negocio&businessId=${encodeURIComponent(workspaceId)}`;
  }

  async function loadAllData() {
    if (!workspaceId) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const [dashboardData, customersData, productsData, salesData, purchasesData, expensesData, settingsData] =
        await Promise.all([
          api.get<Dashboard>(scopedPath("/dashboard")),
          api.get<Customer[]>(scopedPath("/customers")),
          api.get<Product[]>(scopedPath("/products")),
          api.get<Sale[]>(scopedPath("/sales")),
          api.get<Purchase[]>(scopedPath("/purchases")),
          api.get<Expense[]>(scopedPath("/expenses")),
          api.get<Settings>("/settings"),
        ]);

      setDashboard(dashboardData);
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
      status: "RECEBIDA",
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
      status: "PENDENTE",
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

  if (authChecking) {
    return <div className="auth-checking">Verificando sessão...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-layout">
        <section className="auth-panel">
          <div className="auth-brand">
            <div className="brand-mark">ED</div>
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
            <div className="brand-mark">ED</div>
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
          <div className="brand-mark">ED</div>
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
              onClick={() => setActiveModule(key as ModuleKey)}
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
          <button className="ghost-btn" onClick={() => setActiveModule("usuario")}>
            Abrir preferências
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <h2>{moduleMeta[activeModule].label}</h2>
            <p>
              {currentDate} -{" "}
              {workspaceId === "geral"
                ? "ERP Geral (consolidado)"
                : `ERP Especial: ${selectedBusiness?.name || workspaceId}`}
            </p>
          </div>
          <div className="header-actions">
            <button className="ghost-btn" onClick={loadAllData}>
              Atualizar dados
            </button>
            <button className="ghost-btn" onClick={() => setWorkspaceId(null)}>
              Trocar ERP
            </button>
            <button className="ghost-btn" onClick={handleLogout}>
              Sair ({currentUser?.name || "Usuário"})
            </button>
          </div>
        </header>

        {loading && <p className="feedback">Carregando dados...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && activeModule === "dashboard" && dashboard && (
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

            <section className="quick-grid animated">
              <button className="quick-card" onClick={() => setActiveModule("vendas")}>
                <h4>Novo pedido</h4>
                <p>Registrar venda rapidamente no caixa</p>
              </button>
              <button className="quick-card" onClick={() => setActiveModule("produtos")}>
                <h4>Gerir estoque</h4>
                <p>Atualizar catálogo e acompanhar mínimos</p>
              </button>
              <button className="quick-card" onClick={() => setActiveModule("financeiro")}>
                <h4>Fluxo financeiro</h4>
                <p>Controlar despesas e contas futuras</p>
              </button>
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
              <button className="ghost-btn" onClick={() => setActiveModule("clientes")}>
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
                  </tr>
                </thead>
                <tbody>
                  {sales.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td>{formatBRL(item.totalAmount)}</td>
                      <td>{item.paymentMethod}</td>
                      <td>{item.status}</td>
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
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td>{item.supplier}</td>
                      <td>{formatBRL(item.totalAmount)}</td>
                      <td>{item.status}</td>
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
                Escolha um dos 5 temas elegantes e aplique imediatamente no seu ERP.
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
