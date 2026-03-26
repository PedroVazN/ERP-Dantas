import type { Customer, Product, Sale, SaleItem } from "../types";
import { saleCustomerLabel } from "../utils/saleCustomerLabel";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useMemo, useRef, useState } from "react";

type SaleFormState = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNote: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  paymentMethod: string;
};

export type VendasModuleProps = {
  submitSale: (event: FormEvent) => Promise<void> | void;
  saleForm: SaleFormState;
  setSaleForm: Dispatch<SetStateAction<SaleFormState>>;
  customers: Customer[];
  products: Product[];
  sales: Sale[];
  editSale: (sale: Sale) => void;
  deleteSale: (sale: Sale) => void;
  pixModalOpen: boolean;
  setPixModalOpen: Dispatch<SetStateAction<boolean>>;
  formatBRL: (value: number) => string;
};

export default function VendasModule(props: VendasModuleProps) {
  const [screen, setScreen] = useState<"lista" | "criar">("lista");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [paymentFilter, setPaymentFilter] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lineDrafts, setLineDrafts] = useState<Record<string, { quantity: string; unitPrice: string }>>({});
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const activeCustomers = useMemo(() => props.customers.filter((c) => c.status === "ATIVO"), [props.customers]);

  function printReceipt() {
    const content = receiptRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Cupom Fiscal</title>
<style>
  body{font-family:monospace;font-size:13px;margin:0;padding:20px;background:#fff;color:#111;}
  h2{text-align:center;margin:0 0 4px;font-size:15px;}
  .subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:10px;}
  hr{border:none;border-top:1px dashed #aaa;margin:8px 0;}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:2px 0;font-size:12px;}
  th{border-bottom:1px dashed #aaa;}
  td.right,th.right{text-align:right;}
  .total-row td{font-weight:bold;border-top:1px dashed #aaa;padding-top:4px;}
  .footer{text-align:center;font-size:11px;color:#555;margin-top:12px;}
  @media print{@page{margin:0.5cm}body{padding:0}}
</style></head><body>${content.innerHTML}
<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
    win.document.close();
  }

  const pageSize = 7;

  const statusOptions = useMemo(() => {
    return ["TODOS", ...Array.from(new Set(props.sales.map((item) => item.status)))];
  }, [props.sales]);

  const paymentOptions = useMemo(() => {
    return ["TODOS", ...Array.from(new Set(props.sales.map((item) => item.paymentMethod)))];
  }, [props.sales]);

  const filteredSales = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return [...props.sales]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((item) => {
        if (statusFilter !== "TODOS" && item.status !== statusFilter) return false;
        if (paymentFilter !== "TODOS" && item.paymentMethod !== paymentFilter) return false;
        if (!normalizedSearch) return true;
        const orderCode = `ov-${String(item._id).slice(-4).toLowerCase()}`;
        const clientLabel = saleCustomerLabel(item).toLowerCase();
        return (
          orderCode.includes(normalizedSearch) ||
          item.status.toLowerCase().includes(normalizedSearch) ||
          item.paymentMethod.toLowerCase().includes(normalizedSearch) ||
          String(item.invoice?.number || "").toLowerCase().includes(normalizedSearch) ||
          clientLabel.includes(normalizedSearch)
        );
      });
  }, [paymentFilter, props.sales, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [currentPage, filteredSales]);

  const pendingReceivables = useMemo(
    () => props.sales.filter((item) => item.status === "PENDENTE"),
    [props.sales]
  );
  const pendingReceivablesCount = pendingReceivables.length;
  const pendingReceivablesTotal = useMemo(
    () => pendingReceivables.reduce((acc, item) => acc + item.totalAmount, 0),
    [pendingReceivables]
  );
  const criticalStockCount = useMemo(
    () => props.products.filter((item) => item.stock <= item.minStock).length,
    [props.products]
  );

  function getSaleStatusClass(status: string) {
    if (status === "CONCLUIDA" || status === "FATURADA") return "status-chip success";
    if (status === "AGUARDANDO_APROVACAO" || status === "PENDENTE") return "status-chip warning";
    if (status === "CANCELADA") return "status-chip danger";
    return "status-chip neutral";
  }

  function getBillingStatusClass(status?: Sale["billingStatus"]) {
    if (status === "FATURADO") return "status-chip success";
    if (status === "PENDENTE") return "status-chip warning";
    if (status === "CANCELADO") return "status-chip danger";
    return "status-chip neutral";
  }

  function resetToList() {
    setScreen("lista");
    setPage(1);
  }

  function updateLineDraft(productId: string, field: "quantity" | "unitPrice", value: string) {
    setLineDrafts((prev) => ({
      ...prev,
      [productId]: {
        quantity: prev[productId]?.quantity || "",
        unitPrice: prev[productId]?.unitPrice || "",
        [field]: value,
      },
    }));
  }

  function addSaleFromLine(product: Product) {
    const quantity = Number(lineDrafts[product._id]?.quantity || 0);
    const draftUnitPrice = Number(lineDrafts[product._id]?.unitPrice || product.price);
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    const unitPrice = Number.isFinite(draftUnitPrice) && draftUnitPrice > 0 ? draftUnitPrice : product.price;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;

    props.setSaleForm((prev) => {
      const existingIndex = prev.items.findIndex((it) => it.productId === product._id);
      const nextItems = [...prev.items];
      if (existingIndex >= 0) {
        const current = nextItems[existingIndex];
        nextItems[existingIndex] = {
          ...current,
          quantity: Number(current.quantity) + quantity,
          unitPrice,
        };
      } else {
        nextItems.push({
          productId: product._id,
          quantity,
          unitPrice,
        });
      }
      return { ...prev, items: nextItems };
    });

    setLineDrafts((prev) => ({
      ...prev,
      [product._id]: { quantity: "", unitPrice: "" },
    }));
  }

  function normalizePhone(phone: string) {
    return phone.replace(/\D/g, "");
  }

  function handlePhoneChange(value: string) {
    const normalizedInput = normalizePhone(value);
    const matched = activeCustomers.find((c) => normalizePhone(c.phone || "") === normalizedInput);
    props.setSaleForm((prev) => ({
      ...prev,
      customerPhone: value,
      customerId: matched?._id || "",
      customerName: matched?.name || prev.customerName,
      customerNote: matched?.notes || prev.customerNote,
    }));
  }

  function removeSaleItem(productId: string) {
    props.setSaleForm((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.productId !== productId),
    }));
  }

  function clearOrderItems() {
    props.setSaleForm((prev) => ({ ...prev, items: [] }));
  }

  function findProductName(productId: string) {
    return props.products.find((p) => p._id === productId)?.name || "Produto";
  }

  return (
    <section className="module-grid animated vendas-module">
      <section className="table-card" style={{ gridColumn: "1 / -1" }}>
        <div className="order-header">
          <h3>Ordens de venda</h3>
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
          Workflow de venda: reduz estoque e gera receita, com faturamento/NF-e.
        </p>
        <div className="prediction-grid" style={{ marginBottom: 12 }}>
          <div className="prediction-card">
            <span>Recebíveis pendentes</span>
            <strong>
              {pendingReceivablesCount} ({props.formatBRL(pendingReceivablesTotal)})
            </strong>
          </div>
          <div className="prediction-card">
            <span>Produtos em estoque crítico</span>
            <strong>{criticalStockCount}</strong>
          </div>
          <div className="prediction-card">
            <span>Vendas registradas</span>
            <strong>{props.sales.length}</strong>
          </div>
        </div>

        {screen === "lista" ? (
          <>
            <div className="order-toolbar">
              <div className="form-field">
                <label>Forma de pagamento</label>
                <select
                  value={paymentFilter}
                  onChange={(event) => {
                    setPaymentFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  {paymentOptions.map((method) => (
                    <option key={method} value={method}>
                      {method === "TODOS" ? "Todos" : method}
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
                  placeholder="Buscar por cliente, número, status, pagamento ou NF-e"
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
                    <th>Cliente</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                    <th>Status</th>
                    <th>Faturamento</th>
                    <th>NF-e</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSales.length ? (
                    paginatedSales.map((item) => (
                      <tr key={item._id}>
                        <td>OV-{String(item._id).slice(-4).toUpperCase()}</td>
                        <td>{saleCustomerLabel(item)}</td>
                        <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                        <td>{props.formatBRL(item.totalAmount)}</td>
                        <td>{item.paymentMethod}</td>
                        <td>
                          <span className={getSaleStatusClass(item.status)}>{item.status.replaceAll("_", " ")}</span>
                        </td>
                        <td>
                          <span className={getBillingStatusClass(item.billingStatus)}>
                            {(item.billingStatus || "N/A").replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>{item.invoice?.number || "Gerando..."}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              title="Ver cupom"
                              onClick={() => setReceiptSale(item)}
                            >
                              Cupom
                            </button>
                            <button type="button" className="ghost-btn" onClick={() => props.editSale(item)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => props.deleteSale(item)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="empty">
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
          <form className="form-card order-form" onSubmit={props.submitSale}>
            <h3>Emitir nova ordem de venda</h3>
            <div className="order-toolbar">
              <div className="form-field">
                <label>Telefone do cliente</label>
                <small className="field-help">
                  Ao digitar, se já existir cadastro com esse telefone, o nome é preenchido automaticamente.
                </small>
                <input
                  placeholder="ex.: (11) 99999-9999"
                  value={props.saleForm.customerPhone}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Nome do cliente</label>
                <input
                  placeholder="ex.: Maria Silva"
                  value={props.saleForm.customerName}
                  onChange={(event) =>
                    props.setSaleForm({ ...props.saleForm, customerName: event.target.value, customerId: "" })
                  }
                />
              </div>
              <div className="form-field">
                <label>Observação do cliente</label>
                <input
                  placeholder="ex.: irmã da Ana, prefere entrega à tarde"
                  value={props.saleForm.customerNote}
                  onChange={(event) => props.setSaleForm({ ...props.saleForm, customerNote: event.target.value })}
                />
              </div>
            </div>
            <div className="form-field">
              <label>Forma de pagamento</label>
              <small className="field-help">Como o cliente pagou (PIX, dinheiro, cartão, boleto).</small>
              <select
                value={props.saleForm.paymentMethod}
                onChange={(event) =>
                  props.setSaleForm({ ...props.saleForm, paymentMethod: event.target.value })
                }
              >
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="CARTAO">Cartão</option>
                <option value="BOLETO">Boleto</option>
              </select>
            </div>

            <div className="table-scroll">
              <table className="order-items-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Estoque</th>
                    <th>Preço (R$)</th>
                    <th>Preço customizado (R$)</th>
                    <th>Quantidade</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {props.products.length ? (
                    props.products.map((item) => (
                      <tr key={item._id}>
                        <td>{item.name}</td>
                        <td>{item.stock}</td>
                        <td>{props.formatBRL(item.price)}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder={item.price.toFixed(2)}
                            value={lineDrafts[item._id]?.unitPrice ?? item.price.toFixed(2)}
                            onChange={(event) => updateLineDraft(item._id, "unitPrice", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            placeholder="Qtd."
                            value={lineDrafts[item._id]?.quantity || ""}
                            onChange={(event) => updateLineDraft(item._id, "quantity", event.target.value)}
                          />
                        </td>
                        <td>
                          <button type="button" onClick={() => addSaleFromLine(item)}>
                            Adicionar à ordem
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="empty">
                        Nenhum produto disponível para venda.
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
                    <th>Produto</th>
                    <th>Quantidade</th>
                    <th>Preço (R$)</th>
                    <th>Total</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {props.saleForm.items.length ? (
                    props.saleForm.items.map((it) => (
                      <tr key={it.productId}>
                        <td>{findProductName(it.productId)}</td>
                        <td>{it.quantity}</td>
                        <td>{props.formatBRL(it.unitPrice)}</td>
                        <td>{props.formatBRL(it.quantity * it.unitPrice)}</td>
                        <td>
                          <button
                            type="button"
                            className="ghost-btn danger"
                            onClick={() => removeSaleItem(it.productId)}
                          >
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
              <button type="submit" disabled={!props.saleForm.items.length}>
                Finalizar venda
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={!props.saleForm.items.length}
                onClick={clearOrderItems}
              >
                Limpar itens
              </button>
              <button type="button" className="ghost-btn" onClick={() => props.setPixModalOpen(true)}>
                Abrir PIX
              </button>
              <button type="button" className="ghost-btn" onClick={resetToList}>
                Voltar para lista
              </button>
            </div>
          </form>
        )}
      </section>

      {receiptSale ? (
        <div className="receipt-overlay" onClick={() => setReceiptSale(null)}>
          <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div ref={receiptRef}>
              <h2>Cupom Fiscal</h2>
              <p className="receipt-subtitle">
                OV-{String(receiptSale._id).slice(-4).toUpperCase()}
                {" · "}
                {new Date(receiptSale.createdAt).toLocaleString("pt-BR")}
              </p>
              <hr className="receipt-dashed" />
              {(() => {
                const c = receiptSale.customer;
                const clientName =
                  c == null || c === ""
                    ? null
                    : typeof c === "object"
                    ? (c as { name?: string }).name || "Cliente"
                    : null;
                return clientName ? (
                  <p className="receipt-client">
                    <strong>Cliente:</strong> {clientName}
                  </p>
                ) : null;
              })()}
              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="receipt-right">Qtd</th>
                    <th className="receipt-right">Unit.</th>
                    <th className="receipt-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiptSale.items ?? []).map((it: SaleItem, idx: number) => (
                    <tr key={idx}>
                      <td>{it.name}</td>
                      <td className="receipt-right">{it.quantity}</td>
                      <td className="receipt-right">{props.formatBRL(it.unitPrice)}</td>
                      <td className="receipt-right">{props.formatBRL(it.total)}</td>
                    </tr>
                  ))}
                  {(!receiptSale.items || receiptSale.items.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", opacity: 0.6 }}>
                        Detalhes de itens não disponíveis
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="receipt-total-row">
                    <td colSpan={3}>
                      <strong>TOTAL</strong>
                    </td>
                    <td className="receipt-right">
                      <strong>{props.formatBRL(receiptSale.totalAmount)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
              <hr className="receipt-dashed" />
              <p className="receipt-footer">Pagamento: {receiptSale.paymentMethod}</p>
              <p className="receipt-footer">Status: {receiptSale.status}</p>
            </div>
            <div className="receipt-actions">
              <button type="button" onClick={printReceipt}>Imprimir / Salvar PDF</button>
              <button type="button" className="ghost-btn" onClick={() => setReceiptSale(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {props.pixModalOpen ? (
        <div className="pix-modal-overlay" onClick={() => props.setPixModalOpen(false)}>
          <div className="pix-modal" onClick={(event) => event.stopPropagation()}>
            <div className="pix-modal-header">
              <h3>Pagamento via PIX</h3>
              <button type="button" className="ghost-btn" onClick={() => props.setPixModalOpen(false)}>
                Fechar
              </button>
            </div>
            <img src="/pix.jpg" alt="QR Code PIX" className="pix-modal-image" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

