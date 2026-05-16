import type { Expense, Product, Purchase, Supplier } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";

import { API_URL, api } from "../api";

type PurchaseFormState = {
  supplierId: string;
  productId: string;
  quantity: number;
  cost: number;
  extraExpenses: number;
  extraExpensesNote: string;
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
  markPurchaseReceived: (purchaseId: string) => void;
  updatePurchaseWorkflow: (
    purchaseId: string,
    payload: { approval?: "PENDENTE" | "APROVADA" | "REJEITADA"; received?: boolean; reason?: string }
  ) => void;
  editPurchase: (purchase: Purchase) => void;
  deletePurchase: (purchase: Purchase) => void;
  products: Product[];
  expenses: Expense[];
  formatBRL: (value: number) => string;
  scopedPath: (path: string) => string;
  loadAllData: () => Promise<void> | void;
};

type ImportItem = {
  line: number;
  productSku: string;
  productId: string;
  productName: string;
  description: string;
  quantity: number;
  cost: number;
  total: number;
  errors: string[];
  valid: boolean;
};

type ImportPreviewResponse = {
  supplierName: string;
  supplierId: string;
  extraExpenses: number;
  extraExpensesNote: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  items: ImportItem[];
  headerErrors: string[];
  itemsSubtotal: number;
  grandTotal: number;
};

type ApprovalStatus = "PENDENTE" | "APROVADA" | "REJEITADA";
type ReceiptStatus = "NAO_RECEBIDO" | "RECEBIDO";

export default function ComprasModule(props: ComprasModuleProps) {
  const [screen, setScreen] = useState<"lista" | "criar">("lista");
  const [supplierFilter, setSupplierFilter] = useState<string>("TODOS");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lineDrafts, setLineDrafts] = useState<Record<string, { quantity: string; cost: string }>>({});

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null);
  const [importMessage, setImportMessage] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

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

  const orderItemsSubtotal = useMemo(
    () => props.purchaseForm.items.reduce((acc, it) => acc + it.quantity * it.cost, 0),
    [props.purchaseForm.items]
  );
  const orderGrandTotal = orderItemsSubtotal + (props.purchaseForm.extraExpenses || 0);

  /**
   * Calcula o rateio das despesas extras para cada item da ordem em
   * função do peso de cada item no subtotal. Retorna o valor absoluto
   * do rateio, o percentual sobre o subtotal e o custo unitário "real"
   * (custo informado + rateio do frete/taxas / quantidade).
   */
  const itemsWithSharing = useMemo(() => {
    const extra = Number(props.purchaseForm.extraExpenses) || 0;
    const subtotal = orderItemsSubtotal;
    return props.purchaseForm.items.map((item) => {
      const itemTotal = item.quantity * item.cost;
      const share = subtotal > 0 ? itemTotal / subtotal : 0;
      const allocated = extra * share;
      const realUnitCost =
        item.quantity > 0 ? item.cost + allocated / item.quantity : item.cost;
      return {
        ...item,
        sharePercent: share * 100,
        allocatedExtra: allocated,
        realUnitCost,
        realTotal: itemTotal + allocated,
      };
    });
  }, [props.purchaseForm.items, props.purchaseForm.extraExpenses, orderItemsSubtotal]);

  function getPurchaseBadgeClass(status: Purchase["status"]) {
    if (status === "APROVADA" || status === "RECEBIDA") return "status-chip success";
    if (status === "AGUARDANDO_APROVACAO") return "status-chip warning";
    if (status === "REJEITADA" || status === "CANCELADA") return "status-chip danger";
    return "status-chip neutral";
  }

  function getApprovalChipTone(status: ApprovalStatus): "success" | "warning" | "danger" | "neutral" {
    if (status === "APROVADA") return "success";
    if (status === "REJEITADA") return "danger";
    if (status === "PENDENTE") return "warning";
    return "neutral";
  }

  function getReceiptChipTone(status: ReceiptStatus): "success" | "warning" {
    return status === "RECEBIDO" ? "success" : "warning";
  }

  function getApprovalStatus(item: Purchase): ApprovalStatus {
    return (item.approval?.status as ApprovalStatus) || "PENDENTE";
  }

  function getReceiptStatus(item: Purchase): ReceiptStatus {
    return item.status === "RECEBIDA" ? "RECEBIDO" : "NAO_RECEBIDO";
  }

  function isLocked(item: Purchase): boolean {
    return item.status === "CANCELADA";
  }

  async function handleApprovalChange(item: Purchase, value: ApprovalStatus) {
    if (isLocked(item)) return;
    if (value === getApprovalStatus(item)) return;

    if (value !== "APROVADA" && getReceiptStatus(item) === "RECEBIDO") {
      const ok = window.confirm(
        "Esta ordem já foi recebida. Alterar a aprovação irá reverter o estoque desta ordem. Deseja continuar?"
      );
      if (!ok) return;
    }
    await props.updatePurchaseWorkflow(item._id, { approval: value });
  }

  async function handleReceiptChange(item: Purchase, value: ReceiptStatus) {
    if (isLocked(item)) return;
    if (value === getReceiptStatus(item)) return;

    if (value === "RECEBIDO" && getApprovalStatus(item) !== "APROVADA") {
      window.alert("Aprove a ordem antes de marcar como recebida.");
      return;
    }
    if (value === "NAO_RECEBIDO") {
      const ok = window.confirm(
        "Reverter o recebimento irá descontar do estoque os itens já lançados desta ordem. Deseja continuar?"
      );
      if (!ok) return;
    }
    await props.updatePurchaseWorkflow(item._id, { received: value === "RECEBIDO" });
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

  function generatePurchasePdf(purchase: Purchase) {
    const items = purchase.items || [];
    const itemsSubtotal = items.reduce((acc, it) => acc + (it.total ?? it.quantity * it.cost), 0);
    const extra = typeof purchase.extraExpenses === "number" ? purchase.extraExpenses : 0;
    const note = (purchase.extraExpensesNote || "").trim();
    const rows = items
      .map((it) => {
        const itemTotal = it.total ?? it.quantity * it.cost;
        const share = itemsSubtotal > 0 ? itemTotal / itemsSubtotal : 0;
        const allocated = extra * share;
        const realUnit = it.quantity > 0 ? it.cost + allocated / it.quantity : it.cost;
        const realTotal = itemTotal + allocated;
        return `
        <tr>
          <td>${it.description}</td>
          <td style="text-align:right">${it.quantity}</td>
          <td style="text-align:right">${props.formatBRL(it.cost)}</td>
          <td style="text-align:right">${props.formatBRL(itemTotal)}</td>
          <td style="text-align:right">${(share * 100).toFixed(1)}%</td>
          <td style="text-align:right">${props.formatBRL(allocated)}</td>
          <td style="text-align:right"><strong>${props.formatBRL(realUnit)}</strong></td>
          <td style="text-align:right"><strong>${props.formatBRL(realTotal)}</strong></td>
        </tr>
      `;
      })
      .join("");

    const html = `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Pedido de Compra</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
          .doc { max-width: 900px; margin: 0 auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; }
          .header { background: #0f766e; color: #fff; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; }
          .brand h1 { margin: 0; font-size: 20px; letter-spacing: 0.4px; }
          .brand small { opacity: 0.95; }
          .tag { font-size: 12px; padding: 6px 10px; border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; }
          .content { padding: 18px 22px 20px; }
          .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 8px 20px; margin-bottom: 14px; }
          .meta-item { font-size: 13px; color: #374151; }
          .meta-item b { color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 9px 8px; font-size: 13px; }
          th { text-align: left; background: #f9fafb; color: #111827; }
          .num { text-align: right; white-space: nowrap; }
          .totals { margin-top: 14px; display: flex; justify-content: flex-end; }
          .total-box { min-width: 260px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; background: #f9fafb; }
          .total-line { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
          .total-final { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; color: #111827; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
          .obs { margin-top: 16px; font-size: 12px; color: #4b5563; line-height: 1.5; }
          .signatures { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
          .sign { border-top: 1px solid #9ca3af; padding-top: 8px; text-align: center; font-size: 12px; color: #6b7280; }
          .footer { padding: 12px 22px 16px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; background: #fafafa; }
          @media print { @page { margin: 0.6cm; } body { padding: 0; } .doc { border: none; border-radius: 0; } }
        </style>
      </head>
      <body>
        <div class="doc">
          <div class="header">
            <div class="brand">
              <h1>ERP Dantas</h1>
              <small>Pedido de Compra</small>
            </div>
            <span class="tag">OC-${String(purchase._id).slice(-4).toUpperCase()}</span>
          </div>
          <div class="content">
            <div class="meta-grid">
              <div class="meta-item"><b>Fornecedor:</b> ${purchase.supplier}</div>
              <div class="meta-item"><b>Data de emissão:</b> ${new Date(purchase.createdAt).toLocaleDateString("pt-BR")}</div>
              <div class="meta-item"><b>Status:</b> ${purchase.status}</div>
              <div class="meta-item"><b>Canal:</b> ERP Dantas</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="num">Qtd.</th>
                  <th class="num">Custo</th>
                  <th class="num">Subtotal</th>
                  <th class="num">% OC</th>
                  <th class="num">Rateio</th>
                  <th class="num">Custo c/ rateio</th>
                  <th class="num">Total c/ rateio</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="8">Sem itens no pedido.</td></tr>'}
              </tbody>
            </table>
            <div class="totals">
              <div class="total-box">
                <div class="total-line"><span>Subtotal (itens)</span><span>${props.formatBRL(itemsSubtotal)}</span></div>
                <div class="total-line"><span>Despesas extras${note ? ` (${note})` : ""}</span><span>${props.formatBRL(extra)}</span></div>
                <div class="total-final"><span>Total do pedido</span><span>${props.formatBRL(purchase.totalAmount)}</span></div>
              </div>
            </div>
            <div class="obs">
              Condições: valores sujeitos à confirmação do fornecedor. O recebimento físico dos itens deve ser validado
              no ERP para atualização de estoque.
            </div>
            <div class="signatures">
              <div class="sign">Assinatura do responsável pela compra</div>
              <div class="sign">Assinatura do fornecedor</div>
            </div>
          </div>
          <div class="footer">Documento gerado automaticamente pelo ERP Dantas.</div>
        </div>
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>`;

    const win = window.open("", "_blank", "width=960,height=720");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  async function downloadImportTemplate() {
    setImportMessage(null);
    try {
      const response = await fetch(
        `${API_URL}${props.scopedPath("/purchases/import/template")}`
      );
      if (!response.ok) {
        throw new Error("Não foi possível baixar o modelo.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "modelo-ordem-compra.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao baixar modelo.",
      });
    }
  }

  async function previewImportFile() {
    if (!importFile) {
      setImportMessage({ kind: "error", message: "Selecione um arquivo .xlsx para continuar." });
      return;
    }
    setImportLoading(true);
    setImportMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await api.postFormData<ImportPreviewResponse>(
        props.scopedPath("/purchases/import/preview"),
        formData
      );
      setImportPreview(response);
    } catch (error) {
      setImportPreview(null);
      setImportMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao ler planilha.",
      });
    } finally {
      setImportLoading(false);
    }
  }

  async function commitImport() {
    if (!importPreview) return;
    if (importPreview.headerErrors.length > 0) {
      setImportMessage({
        kind: "error",
        message: "Corrija os erros do cabeçalho da planilha antes de confirmar.",
      });
      return;
    }
    const validItems = importPreview.items.filter((row) => row.valid && row.productId);
    if (!validItems.length) {
      setImportMessage({
        kind: "error",
        message: "Nenhuma linha válida para importar.",
      });
      return;
    }
    setImportCommitting(true);
    setImportMessage(null);
    try {
      await api.post<Purchase>(props.scopedPath("/purchases/import/commit"), {
        supplierId: importPreview.supplierId,
        supplierName: importPreview.supplierName,
        extraExpenses: importPreview.extraExpenses,
        extraExpensesNote: importPreview.extraExpensesNote,
        items: validItems.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          cost: item.cost,
        })),
      });
      setImportMessage({
        kind: "success",
        message: `Ordem de compra importada com sucesso. ${validItems.length} item(s) lançado(s).`,
      });
      setImportPreview(null);
      setImportFile(null);
      await props.loadAllData();
    } catch (error) {
      setImportMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao confirmar importação.",
      });
    } finally {
      setImportCommitting(false);
    }
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
                <label>Status da ordem</label>
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

            <div className="table-scroll compras-list-table">
              <table>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fornecedor</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Status da Ordem</th>
                    <th>Aprovação</th>
                    <th>Recebimento</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPurchases.length ? (
                    paginatedPurchases.map((item) => {
                      const approvalStatus = getApprovalStatus(item);
                      const receiptStatus = getReceiptStatus(item);
                      const locked = isLocked(item);
                      return (
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
                            <select
                              className={`status-chip-select ${getApprovalChipTone(approvalStatus)}`}
                              value={approvalStatus}
                              disabled={locked}
                              title="Clique para alterar a aprovação"
                              onChange={(event) => handleApprovalChange(item, event.target.value as ApprovalStatus)}
                            >
                              <option value="PENDENTE">PENDENTE</option>
                              <option value="APROVADA">APROVADA</option>
                              <option value="REJEITADA">REJEITADA</option>
                            </select>
                          </td>
                          <td>
                            <select
                              className={`status-chip-select ${getReceiptChipTone(receiptStatus)}`}
                              value={receiptStatus}
                              disabled={locked || approvalStatus !== "APROVADA"}
                              title={
                                approvalStatus !== "APROVADA"
                                  ? "Aprove a ordem para alterar o recebimento"
                                  : "Clique para alterar o recebimento"
                              }
                              onChange={(event) => handleReceiptChange(item, event.target.value as ReceiptStatus)}
                            >
                              <option value="NAO_RECEBIDO">NÃO RECEBIDO</option>
                              <option value="RECEBIDO">RECEBIDO</option>
                            </select>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button type="button" className="ghost-btn" onClick={() => generatePurchasePdf(item)}>
                                PDF pedido
                              </button>
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
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="empty">
                        Nenhuma ordem encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="compras-list-cards">
              {paginatedPurchases.length ? (
                paginatedPurchases.map((item) => {
                  const approvalStatus = getApprovalStatus(item);
                  const receiptStatus = getReceiptStatus(item);
                  const locked = isLocked(item);
                  return (
                    <article className="compras-card" key={item._id}>
                      <div className="compras-card-head">
                        <strong>OC-{String(item._id).slice(-4).toUpperCase()}</strong>
                        <span>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="compras-card-supplier">{item.supplier}</p>
                      <div className="compras-card-metrics">
                        <span>{props.formatBRL(item.totalAmount)}</span>
                      </div>
                      <div className="compras-card-statuses compras-card-statuses-grid">
                        <div className="compras-card-status-item">
                          <small>Status da Ordem</small>
                          <span className={getPurchaseBadgeClass(item.status)}>{item.status.replaceAll("_", " ")}</span>
                        </div>
                        <div className="compras-card-status-item">
                          <small>Aprovação</small>
                          <select
                            className={`status-chip-select ${getApprovalChipTone(approvalStatus)}`}
                            value={approvalStatus}
                            disabled={locked}
                            onChange={(event) => handleApprovalChange(item, event.target.value as ApprovalStatus)}
                          >
                            <option value="PENDENTE">PENDENTE</option>
                            <option value="APROVADA">APROVADA</option>
                            <option value="REJEITADA">REJEITADA</option>
                          </select>
                        </div>
                        <div className="compras-card-status-item">
                          <small>Recebimento</small>
                          <select
                            className={`status-chip-select ${getReceiptChipTone(receiptStatus)}`}
                            value={receiptStatus}
                            disabled={locked || approvalStatus !== "APROVADA"}
                            onChange={(event) => handleReceiptChange(item, event.target.value as ReceiptStatus)}
                          >
                            <option value="NAO_RECEBIDO">NÃO RECEBIDO</option>
                            <option value="RECEBIDO">RECEBIDO</option>
                          </select>
                        </div>
                      </div>
                      <div className="table-actions">
                        <button type="button" className="ghost-btn" onClick={() => generatePurchasePdf(item)}>
                          PDF pedido
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => props.editPurchase(item)}>
                          Editar
                        </button>
                        <button type="button" className="ghost-btn danger" onClick={() => props.deletePurchase(item)}>
                          Excluir
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="empty">Nenhuma ordem encontrada com os filtros atuais.</p>
              )}
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
          <>
          <section className="products-import-panel" style={{ marginBottom: 16 }}>
            <div className="products-import-header">
              <div>
                <h3>Importar ordem de compra por Excel</h3>
                <p className="theme-helper">
                  Baixe o modelo, preencha o fornecedor (1ª linha) e os itens, e envie a planilha.
                  Cada planilha corresponde a uma única ordem de compra. As <strong>despesas
                  extras</strong> (frete/taxas) preenchidas na 1ª linha já entram no rateio
                  automático por item.
                </p>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void downloadImportTemplate()}
              >
                Baixar modelo Excel
              </button>
            </div>

            <div className="products-import-actions">
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setImportFile(file);
                  setImportPreview(null);
                  setImportMessage(null);
                }}
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void previewImportFile()}
                disabled={!importFile || importLoading}
              >
                {importLoading ? "Lendo planilha…" : "Validar planilha"}
              </button>
              <button
                type="button"
                onClick={() => void commitImport()}
                disabled={
                  !importPreview ||
                  importPreview.validRows === 0 ||
                  importPreview.headerErrors.length > 0 ||
                  importCommitting
                }
              >
                {importCommitting ? "Importando…" : "Confirmar e lançar OC"}
              </button>
            </div>

            {importMessage ? (
              <p className={importMessage.kind === "success" ? "feedback" : "error"}>
                {importMessage.message}
              </p>
            ) : null}

            {importPreview ? (
              <div className="products-import-preview">
                <p className="theme-helper">
                  Fornecedor: <strong>{importPreview.supplierName || "—"}</strong> · Linhas:{" "}
                  {importPreview.totalRows} · Válidas: {importPreview.validRows} · Com erro:{" "}
                  {importPreview.invalidRows} · Despesas extras:{" "}
                  {props.formatBRL(importPreview.extraExpenses)} · Total estimado:{" "}
                  <strong>{props.formatBRL(importPreview.grandTotal)}</strong>
                </p>

                {importPreview.headerErrors.length ? (
                  <ul className="error" style={{ paddingLeft: 18 }}>
                    {importPreview.headerErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="table-scroll">
                  <table className="responsive-table products-import-table">
                    <thead>
                      <tr>
                        <th>Linha</th>
                        <th>SKU</th>
                        <th>Produto</th>
                        <th>Qtd.</th>
                        <th>Custo unit.</th>
                        <th>Subtotal</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.items.map((row) => (
                        <tr
                          key={`${row.line}-${row.productSku}`}
                          className={row.valid ? "" : "products-import-row-error"}
                        >
                          <td data-label="Linha">{row.line}</td>
                          <td data-label="SKU">{row.productSku || "-"}</td>
                          <td data-label="Produto">{row.productName || "—"}</td>
                          <td data-label="Qtd.">{row.quantity}</td>
                          <td data-label="Custo unit.">{props.formatBRL(row.cost)}</td>
                          <td data-label="Subtotal">{props.formatBRL(row.total)}</td>
                          <td data-label="Status">
                            {row.valid ? "OK" : row.errors.join(" | ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>

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
                      extraExpenses: 0,
                      extraExpensesNote: "",
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

            <div className="order-toolbar">
              <div className="form-field">
                <label>Despesas extras (R$)</label>
                <small className="field-help">
                  Frete, taxas, impostos adicionais — somam ao total da ordem e entram na despesa financeira após aprovação.
                </small>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={props.purchaseForm.extraExpenses || ""}
                  onChange={(event) => {
                    const v = Number(event.target.value);
                    props.setPurchaseForm((prev) => ({
                      ...prev,
                      extraExpenses: Number.isFinite(v) && v >= 0 ? v : 0,
                    }));
                  }}
                />
              </div>
              <div className="form-field">
                <label>Observação das despesas extras</label>
                <input
                  type="text"
                  placeholder="ex.: frete, taxa administrativa"
                  value={props.purchaseForm.extraExpensesNote}
                  onChange={(event) =>
                    props.setPurchaseForm((prev) => ({ ...prev, extraExpensesNote: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="compras-create-panes">
              <section className="compras-pane">
                <h4>Produtos do fornecedor</h4>
                <div className="table-scroll compras-order-table-wrap">
                  <table className="order-items-table responsive-table">
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
                              <td data-label="Produto">{item.name}</td>
                              <td data-label="Quantidade">
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
                              <td data-label="Custo (R$)">
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
                              <td data-label="Ação">
                                <button type="button" className="compras-add-line-btn" onClick={() => addPurchaseFromLine(item._id)}>
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
              </section>

              <section className="compras-pane">
                <h4>Itens da ordem</h4>
                <p className="theme-helper">
                  As colunas <strong>% OC</strong> e <strong>Rateio</strong> distribuem o valor das
                  despesas extras proporcionalmente, e o <strong>Custo c/ rateio</strong> indica o
                  custo unitário real (custo + rateio / quantidade).
                </p>
                <div className="table-scroll compras-order-table-wrap">
                  <table className="order-items-table responsive-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qtd.</th>
                        <th>Custo (R$)</th>
                        <th>Subtotal</th>
                        <th>% OC</th>
                        <th>Rateio (R$)</th>
                        <th>Custo c/ rateio</th>
                        <th>Total c/ rateio</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsWithSharing.length ? (
                        itemsWithSharing.map((item) => (
                          <tr key={item.productId}>
                            <td data-label="Item">{item.description}</td>
                            <td data-label="Qtd.">{item.quantity}</td>
                            <td data-label="Custo">{props.formatBRL(item.cost)}</td>
                            <td data-label="Subtotal">
                              {props.formatBRL(item.quantity * item.cost)}
                            </td>
                            <td data-label="% OC">{item.sharePercent.toFixed(1)}%</td>
                            <td data-label="Rateio">{props.formatBRL(item.allocatedExtra)}</td>
                            <td data-label="Custo c/ rateio">
                              <strong>{props.formatBRL(item.realUnitCost)}</strong>
                            </td>
                            <td data-label="Total c/ rateio">
                              <strong>{props.formatBRL(item.realTotal)}</strong>
                            </td>
                            <td data-label="Ação">
                              <button
                                type="button"
                                className="ghost-btn danger compras-remove-line-btn"
                                onClick={() => removeOrderItem(item.productId)}
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="empty">
                            Nenhum item adicionado na ordem.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <p style={{ marginTop: 12, fontWeight: 600 }}>
              Subtotal itens: {props.formatBRL(orderItemsSubtotal)} · Despesas extras:{" "}
              {props.formatBRL(props.purchaseForm.extraExpenses || 0)} · Total estimado:{" "}
              {props.formatBRL(orderGrandTotal)}
            </p>

            <div className="table-actions compras-order-actions">
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
          </>
        )}
      </section>
    </section>
  );
}

