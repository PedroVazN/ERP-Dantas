import type { Customer, Product, Sale, SaleItem } from "../types";
import { saleCustomerLabel } from "../utils/saleCustomerLabel";
import type { Dispatch, FormEvent, SetStateAction, SyntheticEvent } from "react";
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
  submitSale: (event: FormEvent, status?: "PAGO" | "PENDENTE") => Promise<void> | void;
  saleForm: SaleFormState;
  setSaleForm: Dispatch<SetStateAction<SaleFormState>>;
  customers: Customer[];
  products: Product[];
  sales: Sale[];
  editSale: (sale: Sale) => void;
  deleteSale: (sale: Sale) => void;
  updateSalePaymentStatus: (
    saleId: string,
    status: "PAGO" | "PENDENTE" | "CANCELADO"
  ) => Promise<void> | void;
  updateSaleDeliveryStatus: (
    saleId: string,
    deliveryStatus: "ENTREGUE" | "NAO_ENTREGUE"
  ) => Promise<void> | void;
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
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const activeCustomers = useMemo(() => props.customers.filter((c) => c.status === "ATIVO"), [props.customers]);

  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerQuantity, setPickerQuantity] = useState<string>("1");
  const [pickerUnitPrice, setPickerUnitPrice] = useState<string>("");
  const [marginDraftOpen, setMarginDraftOpen] = useState(false);
  const [marginSale, setMarginSale] = useState<Sale | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState<"PAGO" | "PENDENTE" | null>(null);

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

  function generateSaleProposalPdf(sale: Sale) {
    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const customerData =
      sale.customer && typeof sale.customer === "object"
        ? sale.customer
        : ({ name: saleCustomerLabel(sale), phone: "", email: "" } as {
            name?: string;
            phone?: string;
            email?: string;
          });
    const customerName = escapeHtml(customerData.name || saleCustomerLabel(sale));
    const customerPhone = customerData.phone ? escapeHtml(customerData.phone) : "Não informado";
    const customerEmail = customerData.email ? escapeHtml(customerData.email) : "Não informado";

    const rows = (sale.items || [])
      .map(
        (it) => `
          <tr>
            <td>${escapeHtml(it.name)}</td>
            <td class="num">${it.quantity}x</td>
            <td class="num">${props.formatBRL(it.unitPrice)}</td>
            <td class="num">${props.formatBRL(it.total)}</td>
          </tr>
        `
      )
      .join("");

    const purchaseDate = new Date(sale.createdAt).toLocaleDateString("pt-BR");
    const paymentLabel = escapeHtml(sale.paymentMethod || "—");

    const html = `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Comprovante de compra</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 16px;
            font-family: "Georgia", "Times New Roman", serif;
            color: #3f4339;
            background: #efeee9;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .doc {
            max-width: 820px;
            margin: 0 auto;
            border-radius: 14px;
            border: 1px solid #d6d5cd;
            overflow: hidden;
            background: linear-gradient(180deg, #faf9f5 0%, #f0eee6 55%, #ebe8df 100%);
          }
          .header {
            padding: 22px 20px 18px;
            text-align: center;
            background: linear-gradient(165deg, #4a5542 0%, #3d4638 55%, #353d32 100%);
            border-bottom: 1px solid #2f362c;
          }
          .logo {
            width: min(280px, 88vw);
            max-width: 100%;
            margin: 0 auto;
            display: block;
            object-fit: contain;
          }
          .title {
            text-align: center;
            margin: 2px 0 10px;
            font-size: 46px;
            letter-spacing: 0.018em;
            color: #3f4339;
          }
          .content {
            padding: 0 20px 14px;
            display: grid;
            grid-template-columns: 33% minmax(0, 1fr);
            gap: 10px;
          }
          .client-box,
          .products-box {
            background: rgba(244, 244, 239, 0.92);
            border: 1px solid #d0d0c8;
            border-radius: 12px;
            padding: 10px;
          }
          .section-head {
            margin: -10px -10px 10px;
            padding: 8px 10px;
            border-bottom: 1px solid #d0d0c8;
            background: rgba(233, 233, 227, 0.82);
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
            font-size: 13px;
            letter-spacing: 0.08em;
            color: #6b705e;
            text-transform: uppercase;
          }
          .client-box h4 {
            margin: 0 0 6px;
            font-size: 20px;
            color: #3d4238;
          }
          .client-line {
            margin: 0 0 4px;
            font-size: 13px;
            color: #4f5548;
            line-height: 1.35;
          }
          .receipt-note {
            margin: 10px 0 0;
            font-size: 12px;
            color: #6b705e;
            line-height: 1.4;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            padding: 8px 6px;
            border-bottom: 1px solid #d8d8d1;
            font-size: 14px;
            color: #464b3d;
          }
          th {
            font-size: 13px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #6b705e;
            text-align: left;
          }
          .num { text-align: right; white-space: nowrap; }
          .totals {
            margin-top: 10px;
            margin-left: auto;
            max-width: 360px;
          }
          .total-line {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            padding: 5px 0;
            color: #4f5548;
          }
          .total-final {
            border-top: 1px solid #bcc0b3;
            margin-top: 4px;
            padding-top: 8px;
            font-size: 38px;
            color: #3b4035;
            font-weight: 700;
          }
          .thank-you {
            margin: 14px 20px 0;
            text-align: center;
            padding: 14px 16px;
            border: 1px solid #c9cfc0;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.65);
          }
          .thank-you strong {
            display: block;
            font-size: 22px;
            color: #3b4035;
            margin-bottom: 6px;
            letter-spacing: 0.02em;
          }
          .thank-you span {
            font-size: 14px;
            color: #5a6252;
            line-height: 1.45;
          }
          .footer {
            text-align: center;
            padding: 10px 18px 16px;
            color: #5f6654;
          }
          .footer p {
            margin: 0 0 10px;
            font-size: 14px;
          }
          .footer-note {
            font-size: 12px;
            color: #6b705e;
            line-height: 1.5;
            max-width: 520px;
            margin: 0 auto 12px;
          }
          .benefits {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 11px;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            color: #6b705e;
          }
          .benefits span {
            border: 1px solid #c9cfc0;
            border-radius: 8px;
            padding: 5px 10px;
            background: rgba(255,255,255,0.5);
          }
          @media (max-width: 860px) {
            .content {
              grid-template-columns: 1fr;
            }
            .title {
              font-size: 34px;
            }
            .thank-you strong {
              font-size: 20px;
            }
            th, td {
              font-size: 15px;
            }
            .total-line {
              font-size: 15px;
            }
            .total-final {
              font-size: 32px;
            }
          }
          @media print {
            @page { margin: 0.35cm; }
            body { padding: 0; background: #fff; }
          }
        </style>
      </head>
      <body>
        <div class="doc">
          <div class="header">
            <img class="logo" src="${window.location.origin}/usenature.png" alt="Use Nature — Sabonetes naturais" />
          </div>
          <h1 class="title">COMPROVANTE DE COMPRA</h1>
          <div class="content">
            <div class="client-box">
              <p class="section-head">Dados do comprador</p>
              <h4>${customerName}</h4>
              <p class="client-line">Telefone: ${customerPhone}</p>
              <p class="client-line">E-mail: ${customerEmail}</p>
              <p class="client-line">Pedido: OV-${String(sale._id).slice(-4).toUpperCase()}</p>
              <p class="client-line">Data da compra: ${purchaseDate}</p>
              <p class="client-line">Forma de pagamento: ${paymentLabel}</p>
              <p class="receipt-note">Comprovante emitido com base no pedido registrado no sistema.</p>
            </div>

            <div class="products-box">
              <p class="section-head">Itens adquiridos</p>
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th class="num">Qtd.</th>
                    <th class="num">Preço</th>
                    <th class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="4">Sem itens registrados neste pedido.</td></tr>'}
                </tbody>
              </table>
              <div class="totals">
                <div class="total-line"><span>Subtotal</span><span>${props.formatBRL(sale.totalAmount)}</span></div>
                <div class="total-line"><span>Desconto</span><span>${props.formatBRL(0)}</span></div>
                <div class="total-line total-final"><span>Total pago</span><span>${props.formatBRL(sale.totalAmount)}</span></div>
              </div>
            </div>
          </div>
          <div class="thank-you">
            <strong>Obrigado pela compra!</strong>
            <span>Sua preferência é muito importante para nós. Em caso de dúvida sobre o pedido, entre em contato informando o número OV-${String(sale._id).slice(-4).toUpperCase()}.</span>
          </div>
          <div class="footer">
            <p class="footer-note">Este documento resume os itens e o valor do seu pedido, para sua guarda e conferência.</p>
            <div class="benefits">
              <span>Produtos artesanais</span>
              <span>Ingredientes naturais</span>
              <span>Embalagens conscientes</span>
            </div>
          </div>
        </div>
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>`;

    const win = window.open("", "_blank", "width=960,height=720");
    if (!win) return;
    win.document.write(html);
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

  function getDeliveryStatusClass(status?: Sale["deliveryStatus"]) {
    if (status === "ENTREGUE") return "status-chip success";
    return "status-chip warning";
  }

  function getProductById(productId: string) {
    return props.products.find((p) => p._id === productId);
  }

  type MarginRow = {
    name: string;
    quantity: number;
    unitPrice: number;
    cost: number;
    revenue: number;
    totalCost: number;
    profit: number;
    marginPercent: number;
  };

  function computeMarginRowsFromDraft(): MarginRow[] {
    return props.saleForm.items.map((it) => {
      const product = getProductById(it.productId);
      const cost = Number(product?.cost ?? 0);
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      const revenue = unitPrice * quantity;
      const totalCost = cost * quantity;
      const profit = revenue - totalCost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        name: product?.name || "Produto",
        quantity,
        unitPrice,
        cost,
        revenue,
        totalCost,
        profit,
        marginPercent,
      };
    });
  }

  function computeMarginRowsFromSale(sale: Sale): MarginRow[] {
    return (sale.items ?? []).map((it) => {
      const productRef = it.product;
      const productId =
        typeof productRef === "string"
          ? productRef
          : productRef && typeof productRef === "object"
            ? productRef._id
            : "";
      const product = productId ? getProductById(productId) : undefined;
      const cost = Number(product?.cost ?? 0);
      const quantity = Number(it.quantity) || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      const revenue = unitPrice * quantity;
      const totalCost = cost * quantity;
      const profit = revenue - totalCost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        name: it.name || product?.name || "Produto",
        quantity,
        unitPrice,
        cost,
        revenue,
        totalCost,
        profit,
        marginPercent,
      };
    });
  }

  function resetToList() {
    setScreen("lista");
    setPage(1);
  }

  function addItemFromPicker() {
    if (!pickerProductId) return;
    const product = getProductById(pickerProductId);
    if (!product) return;
    const quantity = Number(pickerQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    const draftPrice = Number(pickerUnitPrice);
    const fallbackPrice = Number(product.price) > 0 ? Number(product.price) : 0;
    const unitPrice =
      Number.isFinite(draftPrice) && draftPrice > 0 ? draftPrice : fallbackPrice;
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
        nextItems.push({ productId: product._id, quantity, unitPrice });
      }
      return { ...prev, items: nextItems };
    });

    setPickerProductId("");
    setPickerQuantity("1");
    setPickerUnitPrice("");
  }

  async function finalizeSale(
    event: SyntheticEvent,
    status: "PAGO" | "PENDENTE"
  ) {
    event.preventDefault();
    if (!props.saleForm.items.length) return;
    setSubmittingStatus(status);
    try {
      await props.submitSale(event as FormEvent, status);
    } finally {
      setSubmittingStatus(null);
    }
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

  function handleCustomerSelect(customerId: string) {
    if (!customerId) {
      props.setSaleForm((prev) => ({
        ...prev,
        customerId: "",
        customerName: "",
        customerPhone: "",
        customerNote: "",
      }));
      return;
    }
    const matched = activeCustomers.find((c) => c._id === customerId);
    if (!matched) return;
    props.setSaleForm((prev) => ({
      ...prev,
      customerId: matched._id,
      customerName: matched.name || "",
      customerPhone: matched.phone || "",
      customerNote: matched.notes || prev.customerNote,
    }));
  }

  const sortedActiveCustomers = useMemo(
    () => [...activeCustomers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [activeCustomers]
  );

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
          Esteira comercial: converte pedidos em receita, baixa estoque e acompanha faturamento.
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

            <div className="table-scroll vendas-list-table">
              <table>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                    <th>Status</th>
                    <th>Entrega</th>
                    <th>Faturamento</th>
                    <th>NF-e</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSales.length ? (
                    paginatedSales.map((item) => {
                      const isCancelled = item.status === "CANCELADO";
                      return (
                        <tr key={item._id}>
                          <td>OV-{String(item._id).slice(-4).toUpperCase()}</td>
                          <td>{saleCustomerLabel(item)}</td>
                          <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                          <td>{props.formatBRL(item.totalAmount)}</td>
                          <td>{item.paymentMethod}</td>
                          <td>
                            <select
                              className={`status-chip-select ${getSaleStatusClass(item.status)}`}
                              value={item.status}
                              disabled={isCancelled}
                              title="Clique para alterar o status de pagamento"
                              onChange={(event) =>
                                void props.updateSalePaymentStatus(
                                  item._id,
                                  event.target.value as "PAGO" | "PENDENTE" | "CANCELADO"
                                )
                              }
                            >
                              <option value="PAGO">PAGO</option>
                              <option value="PENDENTE">PENDENTE</option>
                              {isCancelled ? <option value="CANCELADO">CANCELADO</option> : null}
                            </select>
                          </td>
                          <td>
                            <select
                              className={`status-chip-select ${getDeliveryStatusClass(item.deliveryStatus)}`}
                              value={item.deliveryStatus || "NAO_ENTREGUE"}
                              disabled={isCancelled}
                              title="Clique para alterar o status de entrega"
                              onChange={(event) =>
                                void props.updateSaleDeliveryStatus(
                                  item._id,
                                  event.target.value as "ENTREGUE" | "NAO_ENTREGUE"
                                )
                              }
                            >
                              <option value="NAO_ENTREGUE">NÃO ENTREGUE</option>
                              <option value="ENTREGUE">ENTREGUE</option>
                            </select>
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
                              <button
                                type="button"
                                className="ghost-btn"
                                title="Ver margem do pedido"
                                onClick={() => setMarginSale(item)}
                              >
                                Margem
                              </button>
                              <button type="button" className="ghost-btn" onClick={() => generateSaleProposalPdf(item)}>
                                PDF comprovante
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
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="empty">
                        Nenhuma ordem encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="vendas-list-cards">
              {paginatedSales.length ? (
                paginatedSales.map((item) => {
                  const isCancelled = item.status === "CANCELADO";
                  return (
                    <article className="vendas-card" key={item._id}>
                      <div className="vendas-card-head">
                        <strong>OV-{String(item._id).slice(-4).toUpperCase()}</strong>
                        <span>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="vendas-card-customer">{saleCustomerLabel(item)}</p>
                      <div className="vendas-card-metrics">
                        <span>{props.formatBRL(item.totalAmount)}</span>
                        <span>{item.paymentMethod}</span>
                      </div>
                      <div className="vendas-card-statuses">
                        <label className="vendas-card-status-label">
                          Pagto.
                          <select
                            className={`status-chip-select ${getSaleStatusClass(item.status)}`}
                            value={item.status}
                            disabled={isCancelled}
                            onChange={(event) =>
                              void props.updateSalePaymentStatus(
                                item._id,
                                event.target.value as "PAGO" | "PENDENTE" | "CANCELADO"
                              )
                            }
                          >
                            <option value="PAGO">PAGO</option>
                            <option value="PENDENTE">PENDENTE</option>
                            {isCancelled ? <option value="CANCELADO">CANCELADO</option> : null}
                          </select>
                        </label>
                        <label className="vendas-card-status-label">
                          Entrega
                          <select
                            className={`status-chip-select ${getDeliveryStatusClass(item.deliveryStatus)}`}
                            value={item.deliveryStatus || "NAO_ENTREGUE"}
                            disabled={isCancelled}
                            onChange={(event) =>
                              void props.updateSaleDeliveryStatus(
                                item._id,
                                event.target.value as "ENTREGUE" | "NAO_ENTREGUE"
                              )
                            }
                          >
                            <option value="NAO_ENTREGUE">NÃO ENTREGUE</option>
                            <option value="ENTREGUE">ENTREGUE</option>
                          </select>
                        </label>
                        <span className={getBillingStatusClass(item.billingStatus)}>
                          {(item.billingStatus || "N/A").replaceAll("_", " ")}
                        </span>
                      </div>
                      <small>NF-e: {item.invoice?.number || "Gerando..."}</small>
                      <div className="table-actions">
                        <button type="button" className="ghost-btn" onClick={() => setReceiptSale(item)}>
                          Cupom
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => setMarginSale(item)}>
                          Margem
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => generateSaleProposalPdf(item)}>
                          PDF comprovante
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => props.editSale(item)}>
                          Editar
                        </button>
                        <button type="button" className="ghost-btn danger" onClick={() => props.deleteSale(item)}>
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
          <form className="form-card order-form" onSubmit={(event) => event.preventDefault()}>
            <h3>Emitir nova ordem de venda</h3>
            <div className="order-toolbar">
              <div className="form-field">
                <label>Cliente cadastrado</label>
                <small className="field-help">
                  Selecione um cliente já cadastrado para preencher automaticamente os dados.
                </small>
                <select
                  value={props.saleForm.customerId}
                  onChange={(event) => handleCustomerSelect(event.target.value)}
                >
                  <option value="">Novo cliente / digitar manualmente</option>
                  {sortedActiveCustomers.map((customer) => (
                    <option key={customer._id} value={customer._id}>
                      {customer.name}
                      {customer.phone ? ` — ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
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

            <div className="sales-create-panes">
              <section className="sales-pane">
                <h4>Adicionar produto</h4>
                <p className="theme-helper">
                  Selecione o produto, ajuste quantidade e preço unitário e adicione na ordem.
                  Repita para montar o pedido completo.
                </p>
                <div className="order-toolbar">
                  <div className="form-field" style={{ minWidth: 220 }}>
                    <label>Produto</label>
                    <select
                      value={pickerProductId}
                      onChange={(event) => {
                        const id = event.target.value;
                        setPickerProductId(id);
                        const product = getProductById(id);
                        if (product && Number(product.price) > 0) {
                          setPickerUnitPrice(Number(product.price).toFixed(2));
                        } else {
                          setPickerUnitPrice("");
                        }
                      }}
                    >
                      <option value="">Selecione um produto…</option>
                      {props.products.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                          {item.sku ? ` — ${item.sku}` : ""}
                          {` · estoque ${item.stock}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field" style={{ maxWidth: 130 }}>
                    <label>Quantidade</label>
                    <input
                      type="number"
                      min={1}
                      step="1"
                      value={pickerQuantity}
                      onChange={(event) => setPickerQuantity(event.target.value)}
                      placeholder="ex.: 1"
                    />
                  </div>
                  <div className="form-field" style={{ maxWidth: 170 }}>
                    <label>Preço unitário (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={pickerUnitPrice}
                      onChange={(event) => setPickerUnitPrice(event.target.value)}
                      placeholder="ex.: 12,90"
                    />
                  </div>
                  <div className="form-field" style={{ alignSelf: "flex-end", maxWidth: 180 }}>
                    <button
                      type="button"
                      className="vendas-add-line-btn"
                      onClick={addItemFromPicker}
                      disabled={!pickerProductId}
                    >
                      Adicionar item
                    </button>
                  </div>
                </div>
              </section>

              <section className="sales-pane">
                <h4>Itens da ordem</h4>
                <div className="table-scroll vendas-order-table-wrap">
                  <table className="order-items-table responsive-table">
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
                            <td data-label="Produto">{findProductName(it.productId)}</td>
                            <td data-label="Qtd.">{it.quantity}</td>
                            <td data-label="Preço">{props.formatBRL(it.unitPrice)}</td>
                            <td data-label="Total">{props.formatBRL(it.quantity * it.unitPrice)}</td>
                            <td data-label="Ação">
                              <button
                                type="button"
                                className="ghost-btn danger vendas-remove-line-btn"
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
              </section>
            </div>

            <div className="table-actions vendas-order-actions">
              <button
                type="button"
                disabled={!props.saleForm.items.length || submittingStatus !== null}
                onClick={(event) => void finalizeSale(event, "PAGO")}
              >
                {submittingStatus === "PAGO" ? "Finalizando…" : "Finalizar como pago"}
              </button>
              <button
                type="button"
                disabled={!props.saleForm.items.length || submittingStatus !== null}
                onClick={(event) => void finalizeSale(event, "PENDENTE")}
              >
                {submittingStatus === "PENDENTE" ? "Finalizando…" : "Finalizar como pendente"}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={!props.saleForm.items.length}
                onClick={() => setMarginDraftOpen(true)}
                title="Ver margem dos itens e total do pedido"
              >
                Ver margem
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

      {marginDraftOpen ? (
        <MarginModal
          title="Margem do pedido em rascunho"
          rows={computeMarginRowsFromDraft()}
          formatBRL={props.formatBRL}
          onClose={() => setMarginDraftOpen(false)}
        />
      ) : null}

      {marginSale ? (
        <MarginModal
          title={`Margem da venda OV-${String(marginSale._id).slice(-4).toUpperCase()}`}
          rows={computeMarginRowsFromSale(marginSale)}
          formatBRL={props.formatBRL}
          onClose={() => setMarginSale(null)}
        />
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

type MarginModalRow = {
  name: string;
  quantity: number;
  unitPrice: number;
  cost: number;
  revenue: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
};

function MarginModal(props: {
  title: string;
  rows: MarginModalRow[];
  formatBRL: (value: number) => string;
  onClose: () => void;
}) {
  const totalRevenue = props.rows.reduce((acc, row) => acc + row.revenue, 0);
  const totalCost = props.rows.reduce((acc, row) => acc + row.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="receipt-overlay" onClick={props.onClose}>
      <div className="receipt-modal vendas-margin-modal" onClick={(event) => event.stopPropagation()}>
        <div>
          <h2>{props.title}</h2>
          <p className="theme-helper">
            Margem calculada com base no custo padrão atual de cada produto. Para vendas antigas,
            ajustes em custo posteriores ao registro são refletidos aqui.
          </p>

          {props.rows.length === 0 ? (
            <p className="empty">Nenhum item para calcular margem.</p>
          ) : (
            <div className="table-scroll">
              <table className="responsive-table vendas-margin-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Custo unit.</th>
                    <th>Preço unit.</th>
                    <th>Receita</th>
                    <th>Custo total</th>
                    <th>Margem (R$)</th>
                    <th>Margem (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {props.rows.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td data-label="Produto">{row.name}</td>
                      <td data-label="Qtd">{row.quantity}</td>
                      <td data-label="Custo unit.">{props.formatBRL(row.cost)}</td>
                      <td data-label="Preço unit.">{props.formatBRL(row.unitPrice)}</td>
                      <td data-label="Receita">{props.formatBRL(row.revenue)}</td>
                      <td data-label="Custo total">{props.formatBRL(row.totalCost)}</td>
                      <td data-label="Margem (R$)">
                        <strong className={row.profit >= 0 ? "vendas-margin-positive" : "vendas-margin-negative"}>
                          {props.formatBRL(row.profit)}
                        </strong>
                      </td>
                      <td data-label="Margem (%)">
                        <strong className={row.marginPercent >= 0 ? "vendas-margin-positive" : "vendas-margin-negative"}>
                          {row.marginPercent.toFixed(1)}%
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="vendas-margin-total-row">
                    <td colSpan={4}>
                      <strong>Total do pedido</strong>
                    </td>
                    <td>
                      <strong>{props.formatBRL(totalRevenue)}</strong>
                    </td>
                    <td>
                      <strong>{props.formatBRL(totalCost)}</strong>
                    </td>
                    <td>
                      <strong className={totalProfit >= 0 ? "vendas-margin-positive" : "vendas-margin-negative"}>
                        {props.formatBRL(totalProfit)}
                      </strong>
                    </td>
                    <td>
                      <strong className={totalMarginPercent >= 0 ? "vendas-margin-positive" : "vendas-margin-negative"}>
                        {totalMarginPercent.toFixed(1)}%
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <div className="receipt-actions">
          <button type="button" className="ghost-btn" onClick={props.onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

