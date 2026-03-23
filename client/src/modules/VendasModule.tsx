import type { Product, Sale } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useMemo, useRef, useState } from "react";

type SaleFormState = {
  productId: string;
  quantity: number;
  paymentMethod: string;
};

export type VendasModuleProps = {
  submitSale: (event: FormEvent) => Promise<void> | void;
  saleForm: SaleFormState;
  setSaleForm: Dispatch<SetStateAction<SaleFormState>>;
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
  const [lineDrafts, setLineDrafts] = useState<Record<string, { quantity: string }>>({});
  const quickFormRef = useRef<HTMLFormElement | null>(null);

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
        return (
          orderCode.includes(normalizedSearch) ||
          item.status.toLowerCase().includes(normalizedSearch) ||
          item.paymentMethod.toLowerCase().includes(normalizedSearch) ||
          String(item.invoice?.number || "").toLowerCase().includes(normalizedSearch)
        );
      });
  }, [paymentFilter, props.sales, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [currentPage, filteredSales]);

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

  function updateLineDraft(productId: string, quantity: string) {
    setLineDrafts((prev) => ({ ...prev, [productId]: { quantity } }));
  }

  function addSaleFromLine(product: Product) {
    const quantity = Number(lineDrafts[product._id]?.quantity || 0);
    if (quantity <= 0) return;
    props.setSaleForm({
      ...props.saleForm,
      productId: product._id,
      quantity,
    });
    window.setTimeout(() => {
      quickFormRef.current?.requestSubmit();
    }, 0);
  }

  return (
    <section className="module-grid animated">
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
                  placeholder="Buscar por número, status, pagamento ou NF-e"
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
                      <td colSpan={8} className="empty">
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
          <form className="form-card order-form" ref={quickFormRef} onSubmit={props.submitSale}>
            <h3>Emitir nova ordem de venda</h3>
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
                            min={1}
                            placeholder="Qtd."
                            value={lineDrafts[item._id]?.quantity || ""}
                            onChange={(event) => updateLineDraft(item._id, event.target.value)}
                          />
                        </td>
                        <td>
                          <button type="button" onClick={() => addSaleFromLine(item)}>
                            Adicionar
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty">
                        Nenhum produto disponível para venda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-actions">
              <button type="submit">Lançar venda manual</button>
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

