import { useCallback, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
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
import { useCrudModuleHandlers } from "./hooks/useCrudModuleHandlers";
import { useAiHandlers } from "./hooks/useAiHandlers";
import { useUserHandlers } from "./hooks/useUserHandlers";
import { useBiDashboard } from "./hooks/useBiDashboard";
import { useWorkspaceData } from "./hooks/useWorkspaceData";
import { useWorkspaceSession } from "./hooks/useWorkspaceSession";
import { useWhatsAppStatusEffect } from "./hooks/useWhatsAppStatusEffect";
import { useDocumentThemeEffect } from "./hooks/useDocumentThemeEffect";
import { useUserFormFromSettingsEffect } from "./hooks/useUserFormFromSettingsEffect";
import GlobalModalsRenderer from "./components/GlobalModalsRenderer/GlobalModalsRenderer";
import SidebarNavigation from "./components/SidebarNavigation/SidebarNavigation";
import AppHeader from "./components/AppHeader/AppHeader";
import ModulesContentArea from "./components/ModulesContentArea/ModulesContentArea";
import type { AiPlan } from "./aiTypes";

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
  | "ia"
  | "usuario";

const moduleMeta: Record<ModuleKey, { label: string; short: string; helper: string }> = {
  ia: { label: "IA", short: "AI", helper: "Automatize compra/venda/cadastro" },
  dashboard: { label: "Dashboard", short: "DB", helper: "Visao geral do negocio" },
  clientes: { label: "Clientes", short: "CL", helper: "Cadastro e relacionamento" },
  produtos: { label: "Produtos", short: "PR", helper: "Catalogo e estoque" },
  vendas: { label: "Vendas", short: "VD", helper: "PDV e faturamento" },
  compras: { label: "Compras", short: "CP", helper: "Fornecedores e entradas" },
  fornecedores: { label: "Fornecedores", short: "FR", helper: "Cadastro de fornecedores" },
  financeiro: { label: "Financeiro", short: "FN", helper: "Contas e despesas" },
  checklist: { label: "Checklist", short: "CK", helper: "Ideias e futuros implementos" },
  usuario: { label: "Usuario", short: "US", helper: "Perfil e preferências" },
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

  const [productPhotoModalOpen, setProductPhotoModalOpen] = useState(false);
  const [productPhotoModalProductId, setProductPhotoModalProductId] = useState<string | null>(null);

  function openProductPhotoModal(productId: string) {
    setProductPhotoModalProductId(productId);
    setProductPhotoModalOpen(true);
  }

  function closeProductPhotoModal() {
    setProductPhotoModalOpen(false);
    setProductPhotoModalProductId(null);
  }
  const [saleForm, setSaleForm] = useState({
    productId: "",
    quantity: 1,
    paymentMethod: "PIX",
  });
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(null);
  const [whatsAppForm, setWhatsAppForm] = useState({ phone: "", message: "" });

  const [aiMessages, setAiMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>(
    []
  );
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null);
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

  const scopedPath = useCallback(
    (path: string) => {
      if (!workspaceId) {
        return path;
      }
      if (workspaceId === "geral") {
        return `${path}?scope=geral`;
      }
      return `${path}?scope=negocio&businessId=${encodeURIComponent(workspaceId)}`;
    },
    [workspaceId]
  );

  function selectModule(module: ModuleKey) {
    setActiveModule(module);
    setMobileMenuOpen(false);
  }
  
  const { loadDashboardBi } = useBiDashboard({
    workspaceId,
    isAuthenticated,
    activeModule,
    scopedPath,
    setDashboard,
    setBiInsights,
    setBiRefreshing,
    setError,
  });

  const { loadAllData, loadBusinesses } = useWorkspaceData({
    workspaceId,
    scopedPath,
    loadDashboardBi,
    setLoading,
    setError,
    setAuthError,
    setWorkspaceLoading,
    setCustomers,
    setProducts,
    setSales,
    setPurchases,
    setSuppliers,
    setExpenses,
    setChecklistItems,
    setEconomicIndicators,
    setSettings,
    setTheme,
    businessKey: BUSINESS_KEY,
    setBusinesses,
    setWorkspaceId,
  });

  const { handleThemeChange, loadWhatsAppStatus, sendManualWhatsAppMessage } = useUserHandlers({
    setTheme,
    setSettings,
    setError,
    setWhatsAppStatus,
    whatsAppForm,
    setWhatsAppForm,
  });

  const { handleAiSend, handleAiExecute } = useAiHandlers({
    workspaceId,
    scopedPath,
    aiInput,
    setAiInput,
    aiBusy,
    setAiBusy,
    aiPlan,
    setAiPlan,
    setAiMessages,
    setError,
  });

  useWorkspaceSession({
    SESSION_KEY,
    BUSINESS_KEY,
    isAuthenticated,
    workspaceId,
    setAuthChecking,
    setIsAuthenticated,
    setCurrentUser,
    setMobileMenuOpen,
    loadBusinesses,
    loadAllData,
  });

  useWhatsAppStatusEffect({
    isAuthenticated,
    activeModule,
    loadWhatsAppStatus,
  });

  useDocumentThemeEffect(theme);

  useUserFormFromSettingsEffect({
    settings,
    setUserForm,
  });

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

  const crudHandlers = useCrudModuleHandlers({
    isGeneralWorkspace,
    scopedPath,
    loadAllData,
    setError,
    currentUser,
    formatBRL,
    products,
    suppliers,
    customerForm,
    setCustomerForm,
    productForm,
    setProductForm,
    productPhotoFile,
    setProductPhotoFile,
    saleForm,
    setSaleForm,
    purchaseForm,
    setPurchaseForm,
    supplierForm,
    setSupplierForm,
    expenseForm,
    setExpenseForm,
    checklistForm,
    setChecklistForm,
    userForm,
    setSettings,
    openEditModal,
    setEditCustomerForm,
    setEditProductForm,
    setEditProductHasPhoto,
    setEditProductPhotoFile,
    setEditSupplierForm,
    setEditSaleForm,
    setEditPurchaseForm,
    setEditExpenseForm,
    setEditChecklistForm,
  });

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
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
              <small className="field-help">Crie um ambiente separado por negócio (ex.: &quot;Loja Centro&quot;).</small>
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
      <SidebarNavigation
        moduleMeta={moduleMeta}
        activeModule={activeModule}
        selectModule={(key) => selectModule(key as ModuleKey)}
        companyName={selectedBusiness?.name || settings?.companyName || "Gestão inteligente de sabonetes"}
      />

      <main className="content">
        <AppHeader
          moduleMeta={moduleMeta}
          activeModule={activeModule}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          selectModule={(key) => selectModule(key as ModuleKey)}
          currentDate={currentDate}
          workspaceId={workspaceId}
          selectedBusiness={selectedBusiness}
          isGeneralWorkspace={isGeneralWorkspace}
          pendingApprovalsCount={pendingApprovalsCount}
          currentUser={currentUser}
          loadAllData={loadAllData}
          setWorkspaceId={setWorkspaceId}
          handleLogout={handleLogout}
        />

        <ModulesContentArea
          loading={loading}
          error={error}
          activeModule={activeModule}

          dashboard={dashboard}
          biInsights={biInsights}
          biRefreshing={biRefreshing}
          totalOpenReceivables={totalOpenReceivables}
          formatBRL={formatBRL}
          formatPct={formatPct}
          maxTimeseriesValue={maxTimeseriesValue}
          maxTopProductValue={maxTopProductValue}
          maxCostCategoryValue={maxCostCategoryValue}
          selectModule={(key) => selectModule(key as any)}

          customerForm={customerForm}
          setCustomerForm={setCustomerForm}
          submitCustomer={crudHandlers.submitCustomer}
          customers={customers}
          editCustomer={crudHandlers.editCustomer}
          deleteCustomer={crudHandlers.deleteCustomer}

          scopedPath={scopedPath}
          productForm={productForm}
          setProductForm={setProductForm}
          setProductPhotoFile={setProductPhotoFile}
          submitProduct={crudHandlers.submitProduct}
          products={products}
          suppliers={suppliers}
          openProductPhotoModal={openProductPhotoModal}
          editProduct={crudHandlers.editProduct}
          deleteProduct={crudHandlers.deleteProduct}

          saleForm={saleForm}
          setSaleForm={setSaleForm}
          submitSale={crudHandlers.submitSale}
          sales={sales}
          editSale={crudHandlers.editSale}
          deleteSale={crudHandlers.deleteSale}
          pixModalOpen={pixModalOpen}
          setPixModalOpen={setPixModalOpen}

          purchaseForm={purchaseForm}
          setPurchaseForm={setPurchaseForm}
          submitPurchase={crudHandlers.submitPurchase}
          filteredProductsBySupplier={filteredProductsBySupplier}
          purchases={purchases}
          reviewPurchase={crudHandlers.reviewPurchase}
          editPurchase={crudHandlers.editPurchase}
          deletePurchase={crudHandlers.deletePurchase}

          supplierForm={supplierForm}
          setSupplierForm={setSupplierForm}
          submitSupplier={crudHandlers.submitSupplier}
          editSupplier={crudHandlers.editSupplier}
          deleteSupplier={crudHandlers.deleteSupplier}

          economicIndicators={economicIndicators}
          expenseForm={expenseForm}
          setExpenseForm={setExpenseForm}
          submitExpense={crudHandlers.submitExpense}
          expenses={expenses}
          reviewExpense={crudHandlers.reviewExpense}
          editExpense={crudHandlers.editExpense}
          deleteExpense={crudHandlers.deleteExpense}

          checklistForm={checklistForm}
          setChecklistForm={setChecklistForm}
          checklistItems={checklistItems}
          submitChecklistItem={crudHandlers.submitChecklistItem}
          toggleChecklistItem={crudHandlers.toggleChecklistItem}
          editChecklistItem={crudHandlers.editChecklistItem}
          deleteChecklistItem={crudHandlers.deleteChecklistItem}

          aiMessages={aiMessages}
          aiInput={aiInput}
          setAiInput={setAiInput}
          aiBusy={aiBusy}
          aiPlan={aiPlan}
          handleAiSend={handleAiSend}
          handleAiExecute={handleAiExecute}

          userForm={userForm}
          setUserForm={setUserForm}
          submitUserProfile={crudHandlers.submitUserProfile}
          themeOptions={themeOptions}
          theme={theme}
          handleThemeChange={handleThemeChange}
          whatsAppStatus={whatsAppStatus}
          whatsAppForm={whatsAppForm}
          setWhatsAppForm={setWhatsAppForm}
          sendManualWhatsAppMessage={sendManualWhatsAppMessage}
          loadWhatsAppStatus={loadWhatsAppStatus}
        />

        <GlobalModalsRenderer
          editModalOpen={editModalOpen}
          editModalKind={editModalKind}
          editingId={editingId}
          editModalSubtitle={editModalSubtitle}
          closeEditModal={closeEditModal}
          isGeneralWorkspace={isGeneralWorkspace}
          scopedPath={scopedPath}
          setError={setError}
          loadAllData={loadAllData}
          suppliers={suppliers}

          editCustomerForm={editCustomerForm}
          setEditCustomerForm={setEditCustomerForm}
          editProductForm={editProductForm}
          setEditProductForm={setEditProductForm}
          editProductHasPhoto={editProductHasPhoto}
          setEditProductPhotoFile={setEditProductPhotoFile}
          editProductPhotoFile={editProductPhotoFile}
          editSupplierForm={editSupplierForm}
          setEditSupplierForm={setEditSupplierForm}
          editSaleForm={editSaleForm}
          setEditSaleForm={setEditSaleForm}
          editPurchaseForm={editPurchaseForm}
          setEditPurchaseForm={setEditPurchaseForm}
          editExpenseForm={editExpenseForm}
          setEditExpenseForm={setEditExpenseForm}
          editChecklistForm={editChecklistForm}
          setEditChecklistForm={setEditChecklistForm}

          productPhotoModalOpen={productPhotoModalOpen}
          productPhotoModalProductId={productPhotoModalProductId}
          closeProductPhotoModal={closeProductPhotoModal}
        />
      </main>
    </div>
  );
}

export default App;
