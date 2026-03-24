import type { Expense, Product, Purchase, Supplier } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";

type PurchaseFormState = {
  supplierId: string;
  productId: string;
  quantity: number;
  cost: number;
  items: Array<{ productId: string; description: string; quantity: number; cost: number }>;
};

export type ComprasModuleProps = {
  submitPurchase: (event: FormEvent) => Promise<void> | void;
  purchaseForm: PurchaseFormState;
  setPurchaseForm: Dispatch<SetStateAction<PurchaseFormState>>;
  suppliers: Supplier[];
  filteredProductsBySupplier: Product[];
  purchases: Purchase[];
  reviewPurchase: (purchaseId: string, action: "aprovar" | "rejeitar") => void;
  editPurchase: (purchase: Purchase) => void;
  deletePurchase: (purchase: Purchase) => void;
  products: Product[];
  expenses: Expense[];
  formatBRL: (value: number) => string;
};

export default function ComprasModule(props: ComprasModuleProps) {
  const [screen, setScreen] = useState<"lista" | "criar">("lista");
  const [supplierFilter, setSupplierFilter] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lineDrafts, setLineDrafts] = useState<Record<string, { quantity: string; cost: string }>>({});

  const pageSize = 7;
  const todayIso = new Date().toISOString().slice(0, 10);

  const statusOptions = useMemo(() => {
    return ["TODOS", ...Array.from(new Set(props.purchases.map((item) => item.status)))];
  }, [props.purchases]);

  const filteredPurchases = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...props.purchases]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((item) => {
        if (supplierFilter !== "TODOS" && item.supplier !== supplierFilter) return false;
        if (statusFilter !== "TODOS" && item.status !== statusFilter) return false;
        if (!normalizedSearch) return true;
        const numberText = `oc-${String(item._id).slice(-4).toLowerCase()}`;
        return (
          item.supplier.toLowerCase().includes(normalizedSearch) ||
          item.status.toLowerCase().includes(normalizedSearch) ||
          numberText.includes(normalizedSearch)
        );
      });
  }, [props.purchases, search, statusFilter, supplierFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPurchases.slice(start, start + pageSize);
  }, [currentPage, filteredPurchases]);

  const pendingPurchaseApprovals = useMemo(
    () => props.purchases.filter((item) => item.status === "AGUARDANDO_APROVACAO").length,
    [props.purchases]
  );
  const criticalStockCount = useMemo(
    () => props.products.filter((item) => item.stock <= item.minStock).length,
    [props.products]
  );
  const overdueExpenses = useMemo(
    () =>
      props.expenses.filter((expense) => {
        const dueDateIso = expense.dueDate.slice(0, 10);
        return expense.status === "PENDENTE" && dueDateIso < todayIso;
      }),
    [props.expenses, todayIso]
  );
  const overdueExpensesCount = overdueExpenses.length;
  const overdueExpensesTotal = useMemo(
    () => overdueExpenses.reduce((acc, item) => acc + item.amount, 0),
    [overdueExpenses]
  );

  function getPurchaseBadgeClass(status: Purchase["status"]) {
    if (status === "APROVADA" || status === "RECEBIDA") return "status-chip success";
    if (status === "AGUARDANDO_APROVACAO") return "status-chip warning";
    if (status === "REJEITADA" || status === "CANCELADA") return "status-chip danger";
    return "status-chip neutral";
  }

  function getApprovalBadgeClass(status?: Purchase["approval"] extends { status?: infer T } ? T : string) {
    if (status === "APROVADA") return "status-chip success";
    if (status === "REJEITADA") return "status-chip danger";
    if (status === "PENDENTE") return "status-chip warning";
    return "status-chip neutral";
  }

  function resetToList() {
    setScreen("lista");
    setPage(1);
  }

  const activeSupplier = useMemo(() => {
    return props.suppliers.find((item) => item._id === props.purchaseForm.supplierId) || null;
  }, [props.purchaseForm.supplierId, props.suppliers]);

  function updateLineDraft(productId: string, field: "quantity" | "cost", value: string) {
    setLineDrafts((prev) => ({
      ...prev,
      [productId]: { quantity: prev[productId]?.quantity || "", cost: prev[productId]?.cost || "", [field]: value },
    }));
  }

  function addPurchaseFromLine(productId: string) {
    const draft = lineDrafts[productId];
    const quantity = Number(draft?.quantity || 0);
    const cost = Number(draft?.cost || 0);
    if (!props.purchaseForm.supplierId || quantity <= 0 || !Number.isFinite(cost) || cost <= 0) return;
    const product = props.filteredProductsBySupplier.find((item) => item._id === productId);
    if (!product) return;

    props.setPurchaseForm((prev) => {
      const existingIndex = prev.items.findIndex((item) => item.productId === productId);
      const nextItems = [...prev.items];
      if (existingIndex >= 0) {
        const current = nextItems[existingIndex];
        if (!current) return prev;
        nextItems[existingIndex] = {
          ...current,
          quantity: current.quantity + quantity,
          cost,
        };
      } else {
        nextItems.push({
          productId,
          description: product.name,
          quantity,
          cost,
        });
      }
      return {
        ...prev,
        productId,
        quantity,
        cost,
        items: nextItems,
      };
    });
    setLineDrafts((prev) => ({ ...prev, [productId]: { quantity: "", cost: "" } }));
  }

  function removeOrderItem(productId: string) {
    props.setPurchaseForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.productId !== productId),
    }));
  }

  function clearOrderItems() {
    props.setPurchaseForm((prev) => ({ ...prev, items: [] }));
  }

  return (
    <section className="module-grid animated compras-module">
      <section className="table-card" style={{ gridColumn: "1 / -1" }}>
        <div className="order-header">
          <h3>Ordens de compra</h3>
          <div className="view-switch">
            <button
              type="button"
              className={screen === "lista" ? "" : "ghost-btn"}
              onClick={() => resetToList()}
            >
              Tela em lista
            </button>
            <button
              type="button"
              className={screen === "criar" ? "" : "ghost-btn"}
              onClick={() => setScreen("criar")}
            >
              Emitir nova ordem
            </button>
          </div>
        </div>
        <p className="theme-helper">
          Workflow de compra: adiciona estoque e gera despesa após aprovação/recebimento.
        </p>
        <div className="prediction-grid" style={{ marginBottom: 12 }}>
          <div className="prediction-card">
            <span>Estoque crítico</span>
            <strong>{criticalStockCount}</strong>
          </div>
          <div className="prediction-card">
            <span>Compras aguardando aprovação</span>
            <strong>{pendingPurchaseApprovals}</strong>
          </div>
          <div className="prediction-card">
            <span>Despesas vencidas</span>
            <strong>
              {overdueExpensesCount} ({props.formatBRL(overdueExpensesTotal)})
            </strong>
          </div>
        </div>

        {screen === "lista" ? (
          <>
            <div className="order-toolbar">
              <div className="form-field">
                <label>Fornecedor</label>
                <select
                  value={supplierFilter}
                  onChange={(event) => {
                    setSupplierFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="TODOS">Todos</option>
                  {props.suppliers.map((item) => (
                    <option key={item._id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status === "TODOS" ? "Todos" : status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Buscar</label>
                <input
                  placeholder="Buscar por número, fornecedor ou status"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fornecedor</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Aprovação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPurchases.length ? (
                    paginatedPurchases.map((item) => (
                      <tr key={item._id}>
                        <td>OC-{String(item._id).slice(-4).toUpperCase()}</td>
                        <td>{item.supplier}</td>
                        <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                        <td>{props.formatBRL(item.totalAmount)}</td>
                        <td>
                          <span className={getPurchaseBadgeClass(item.status)}>
                            {item.status.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>
                          <span className={getApprovalBadgeClass(item.approval?.status)}>
                            {(item.approval?.status || "N/A").replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {item.status === "AGUARDANDO_APROVACAO" ? (
                              <>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => props.reviewPurchase(item._id, "aprovar")}
                                >
                                  Aprovar
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn danger"
                                  onClick={() => props.reviewPurchase(item._id, "rejeitar")}
                                >
                                  Rejeitar
                                </button>
                              </>
                            ) : null}
                            <button type="button" className="ghost-btn" onClick={() => props.editPurchase(item)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => props.deletePurchase(item)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="empty">
                        Nenhuma ordem encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="list-footer">
              <button
                type="button"
                className="ghost-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              <small>
                {currentPage} de {totalPages}
              </small>
              <button
                type="button"
                className="ghost-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Próxima
              </button>
            </div>
          </>
        ) : (
          <form className="form-card order-form" onSubmit={props.submitPurchase}>
            <h3>Emitir nova ordem de compra</h3>
            <div className="order-toolbar">
              <div className="form-field">
                <label>Fornecedor</label>
                <select
                  value={props.purchaseForm.supplierId}
                  onChange={(event) => {
                    props.setPurchaseForm({
                      ...props.purchaseForm,
                      supplierId: event.target.value,
                      productId: "",
                      items: [],
                    });
                    setLineDrafts({});
                  }}
                  required
                >
                  <option value="">Selecione o fornecedor</option>
                  {props.suppliers
                    .filter((s) => s.status === "ATIVO")
                    .map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-field">
                <label>CNPJ do fornecedor</label>
                <input value={activeSupplier?.document || "-"} readOnly />
              </div>
              <div className="form-field">
                <label>Condição de pagamento</label>
                <input value={activeSupplier?.paymentCondition || "-"} readOnly />
              </div>
            </div>

            <div className="table-scroll">
              <table className="order-items-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Quantidade</th>
                    <th>Custo (R$)</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {props.purchaseForm.supplierId ? (
                    props.filteredProductsBySupplier.length ? (
                      props.filteredProductsBySupplier.map((item) => (
                        <tr key={item._id}>
                          <td>{item.name}</td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              placeholder="Qtd."
                              value={lineDrafts[item._id]?.quantity || ""}
                              onChange={(event) => updateLineDraft(item._id, "quantity", event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.preventDefault();
                              }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Custo"
                              value={lineDrafts[item._id]?.cost || ""}
                              onChange={(event) => updateLineDraft(item._id, "cost", event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.preventDefault();
                              }}
                            />
                          </td>
                          <td>
                            <button type="button" onClick={() => addPurchaseFromLine(item._id)}>
                              Adicionar à ordem
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="empty">
                          Não há produtos vinculados a esse fornecedor.
                        </td>
                      </tr>
                    )
                  ) : (
                    <tr>
                      <td colSpan={4} className="empty">
                        Selecione um fornecedor para carregar os produtos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-scroll" style={{ marginTop: 10 }}>
              <table className="order-items-table">
                <thead>
                  <tr>
                    <th>Itens da ordem</th>
                    <th>Quantidade</th>
                    <th>Custo (R$)</th>
                    <th>Total</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {props.purchaseForm.items.length ? (
                    props.purchaseForm.items.map((item) => (
                      <tr key={item.productId}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>{props.formatBRL(item.cost)}</td>
                        <td>{props.formatBRL(item.quantity * item.cost)}</td>
                        <td>
                          <button type="button" className="ghost-btn danger" onClick={() => removeOrderItem(item.productId)}>
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty">
                        Nenhum item adicionado na ordem.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-actions">
              <button type="submit" disabled={!props.purchaseForm.items.length}>
                Finalizar ordem de compra
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={!props.purchaseForm.items.length}
                onClick={clearOrderItems}
              >
                Limpar itens
              </button>
              <button type="button" className="ghost-btn" onClick={resetToList}>
                Voltar para lista
              </button>
            </div>
          </form>
        )}
      </section>
    </section>
  );
}

