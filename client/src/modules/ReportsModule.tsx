import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { API_URL, api } from "../api";
import type {
  MonthlyReportResponse,
  SalesItemsReportResponse,
  StockReportResponse,
} from "../types";

export type ReportsModuleProps = {
  scopedPath: (path: string) => string;
  formatBRL: (value: number) => string;
};

export default function ReportsModule(props: ReportsModuleProps) {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<MonthlyReportResponse | null>(null);
  const [stockData, setStockData] = useState<StockReportResponse | null>(null);
  const [salesItemsData, setSalesItemsData] = useState<SalesItemsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salesItemsSearch, setSalesItemsSearch] = useState("");
  const [exportingSalesItems, setExportingSalesItems] = useState(false);
  const [exportError, setExportError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const q = `?months=${months}`;
      const [res, stockRes, salesItemsRes] = await Promise.all([
        api.get<MonthlyReportResponse>(props.scopedPath(`/reports/monthly-series${q}`)),
        api.get<StockReportResponse>(props.scopedPath(`/reports/stock-table${q}`)),
        api.get<SalesItemsReportResponse>(props.scopedPath(`/reports/sales-items${q}`)),
      ]);
      setData(res);
      setStockData(stockRes);
      setSalesItemsData(salesItemsRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar relatórios";
      setError(message);
      setData(null);
      setStockData(null);
      setSalesItemsData(null);
    } finally {
      setLoading(false);
    }
  }, [props.scopedPath, months]);

  useEffect(() => {
    void load();
  }, [load]);

  const series = data?.series ?? [];
  const stockRows = stockData?.rows ?? [];
  const salesItemsRows = salesItemsData?.rows ?? [];

  const filteredSalesItemsRows = salesItemsRows.filter((row) => {
    const term = salesItemsSearch.trim().toLowerCase();
    if (!term) return true;
    return [
      row.saleNumber,
      row.customerName,
      row.productName,
      row.itemDescription,
      row.paymentMethod,
      row.productSku,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const salesItemsTotals = filteredSalesItemsRows.reduce(
    (acc, row) => {
      acc.revenue += row.totalRevenue;
      acc.cost += row.totalCost;
      acc.profit += row.profit;
      acc.quantity += row.quantity;
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0, quantity: 0 }
  );
  const salesItemsTotalMargin =
    salesItemsTotals.revenue > 0
      ? (salesItemsTotals.profit / salesItemsTotals.revenue) * 100
      : 0;

  async function exportSalesItemsExcel() {
    setExportError("");
    setExportingSalesItems(true);
    try {
      const response = await fetch(
        `${API_URL}${props.scopedPath(`/reports/sales-items/export?months=${months}`)}`
      );
      if (!response.ok) {
        throw new Error("Não foi possível gerar o arquivo Excel.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-vendas-itens-${months}m.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Falha ao baixar Excel.");
    } finally {
      setExportingSalesItems(false);
    }
  }

  return (
    <section className="dashboard-shell reports-module">
      <header className="reports-module-header table-card animated">
        <div>
          <h2>Relatórios</h2>
          <p className="theme-helper">
            Evolução do negócio mês a mês — despesas, faturamento e lucro bruto (receita − custo dos produtos
            vendidos).
          </p>
        </div>
        <div className="reports-module-toolbar">
          <label className="reports-months-label">
            <span>Período</span>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={6}>Últimos 6 meses</option>
              <option value={12}>Últimos 12 meses</option>
              <option value={18}>Últimos 18 meses</option>
              <option value={24}>Últimos 24 meses</option>
              <option value={36}>Últimos 36 meses</option>
            </select>
          </label>
          <button type="button" className="ghost-btn" onClick={() => void load()}>
            Atualizar
          </button>
        </div>
      </header>

      {loading && <p className="feedback">Carregando séries...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && series.length > 0 ? (
        <div className="reports-charts-grid">
          <article className="table-card animated reports-chart-card">
            <h3>Despesas e faturamento por mês</h3>
            <p className="theme-helper">Comparativo direto entre receita de vendas e despesas lançadas.</p>
            <div className="reports-chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => props.formatBRL(Number(v))} width={88} />
                  <Tooltip
                    formatter={(value) => props.formatBRL(Number(value ?? 0))}
                    labelFormatter={(label) => String(label)}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Faturamento" fill="var(--accent, #2563eb)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Despesas" fill="var(--danger, #dc2626)" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="table-card animated reports-chart-card">
            <h3>Lucro bruto por mês</h3>
            <p className="theme-helper">Faturamento menos custo dos produtos vendidos (CPV).</p>
            <div className="reports-chart-wrap">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => props.formatBRL(Number(v))} width={88} />
                  <Tooltip formatter={(value) => props.formatBRL(Number(value ?? 0))} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="profitGross"
                    name="Lucro bruto"
                    stroke="var(--success, #059669)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="table-card animated reports-chart-card reports-chart-wide">
            <h3>Visão combinada</h3>
            <p className="theme-helper">Linhas para faturamento, despesas e lucro bruto no mesmo gráfico.</p>
            <div className="reports-chart-wrap reports-chart-wrap-tall">
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={series} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => props.formatBRL(Number(v))} width={88} />
                  <Tooltip formatter={(value) => props.formatBRL(Number(value ?? 0))} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Faturamento" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Despesas" stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="profitGross"
                    name="Lucro bruto"
                    stroke="#059669"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      ) : null}

      {!loading && !error ? (
        <article className="table-card animated reports-stock-card">
          <div className="reports-stock-header">
            <h3>Relatório de estoque em tabela</h3>
            <p className="theme-helper">
              Uma linha por produto e colunas comparáveis para apoiar reposição, precificação e análise de
              giro.
            </p>
          </div>

          {stockRows.length > 0 ? (
            <div className="reports-stock-table-wrap">
              <table className="reports-stock-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Código do produto</th>
                    <th>Quantidade vendida ({months}m)</th>
                    <th>Quantidade em estoque</th>
                    <th>Tempo de estoque</th>
                    <th>Custo</th>
                    <th>Preço de tabela</th>
                    <th>Preço de venda</th>
                    <th>Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={row.productId}>
                      <td>{row.product}</td>
                      <td>{row.productCode}</td>
                      <td>{row.quantitySold}</td>
                      <td>{row.stock}</td>
                      <td>
                        {row.stockTimeMonths === null || !Number.isFinite(row.stockTimeMonths)
                          ? "Sem giro"
                          : `${row.stockTimeMonths.toFixed(1)} meses`}
                      </td>
                      <td>{props.formatBRL(row.cost)}</td>
                      <td>{props.formatBRL(row.listPrice)}</td>
                      <td>{props.formatBRL(row.salePrice)}</td>
                      <td>{`${row.marginPercent.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty feedback">Nenhum produto encontrado para montar o relatório de estoque.</p>
          )}
        </article>
      ) : null}

      {!loading && !error ? (
        <article className="table-card animated reports-stock-card">
          <div className="reports-stock-header">
            <div>
              <h3>Vendas por item (últimos {months} meses)</h3>
              <p className="theme-helper">
                Uma linha por item de cada ordem de venda — com cliente, condição de pagamento,
                custo, preço vendido, margem (R$) e margem (%). Pode ser exportado para Excel.
              </p>
            </div>
            <div className="reports-module-toolbar">
              <input
                type="search"
                className="reports-search-input"
                placeholder="Buscar por OV, cliente, produto, SKU ou pagamento"
                value={salesItemsSearch}
                onChange={(event) => setSalesItemsSearch(event.target.value)}
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void exportSalesItemsExcel()}
                disabled={exportingSalesItems || filteredSalesItemsRows.length === 0}
                title="Baixar Excel completo do período"
              >
                {exportingSalesItems ? "Gerando…" : "Exportar Excel"}
              </button>
            </div>
          </div>

          {exportError ? <p className="error">{exportError}</p> : null}

          {filteredSalesItemsRows.length > 0 ? (
            <>
              <p className="theme-helper" style={{ marginTop: 0 }}>
                {filteredSalesItemsRows.length} linha(s) · Receita:{" "}
                <strong>{props.formatBRL(salesItemsTotals.revenue)}</strong> · Custo:{" "}
                <strong>{props.formatBRL(salesItemsTotals.cost)}</strong> · Margem:{" "}
                <strong>{props.formatBRL(salesItemsTotals.profit)}</strong> (
                {salesItemsTotalMargin.toFixed(1)}%)
              </p>
              <div className="reports-stock-table-wrap">
                <table className="reports-stock-table">
                  <thead>
                    <tr>
                      <th>OV</th>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th>Pagamento</th>
                      <th>Produto</th>
                      <th>Item</th>
                      <th>Qtd.</th>
                      <th>Custo unit.</th>
                      <th>Preço unit.</th>
                      <th>Receita</th>
                      <th>Margem (R$)</th>
                      <th>Margem (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalesItemsRows.map((row, index) => (
                      <tr key={`${row.saleId}-${row.productId}-${index}`}>
                        <td>{row.saleNumber}</td>
                        <td>
                          {row.saleDate
                            ? new Date(row.saleDate).toLocaleDateString("pt-BR")
                            : "-"}
                        </td>
                        <td>{row.customerName}</td>
                        <td>{row.paymentMethod}</td>
                        <td>{row.productName}</td>
                        <td>{row.itemDescription}</td>
                        <td>{row.quantity}</td>
                        <td>{props.formatBRL(row.unitCost)}</td>
                        <td>{props.formatBRL(row.unitPrice)}</td>
                        <td>{props.formatBRL(row.totalRevenue)}</td>
                        <td
                          className={
                            row.profit >= 0
                              ? "reports-margin-positive"
                              : "reports-margin-negative"
                          }
                        >
                          <strong>{props.formatBRL(row.profit)}</strong>
                        </td>
                        <td
                          className={
                            row.marginPercent >= 0
                              ? "reports-margin-positive"
                              : "reports-margin-negative"
                          }
                        >
                          <strong>{row.marginPercent.toFixed(1)}%</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="empty feedback">
              Nenhum item encontrado{salesItemsSearch ? " com o filtro atual" : " no período"}.
            </p>
          )}
        </article>
      ) : null}

      {!loading && !error && series.length === 0 ? (
        <p className="empty feedback">Nenhum dado no período selecionado.</p>
      ) : null}
    </section>
  );
}
