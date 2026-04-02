import { useMemo } from "react";

import type { BiInsights, Dashboard } from "../../types";
import type { Product } from "../../types";

export type DashboardPanelProps = {
  dashboard: Dashboard;
  products: Product[];
  biInsights: BiInsights;
  biRefreshing: boolean;
  realSalesCount: number;
  realPurchasesCount: number;
  viewerOnly: boolean;
  totalOpenReceivables: number;
  formatBRL: (value: number) => string;
  formatPct: (value: number) => string;
  maxTimeseriesValue: number;
  maxTopProductValue: number;
  maxCostCategoryValue: number;
  selectModule: (key: "vendas" | "produtos" | "financeiro" | "clientes" | "compras" | "relatorios") => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
};

function buildMonthSelectOptions(count: number) {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const raw = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    out.push({ value, label });
  }
  return out;
}

export default function DashboardPanel(props: DashboardPanelProps) {
  const { dashboard, biInsights } = props;
  const monthOptions = useMemo(() => buildMonthSelectOptions(36), []);
  const purchasesTotal = dashboard.purchasesTotal ?? 0;
  const estoqueContabil = props.products.reduce((acc, item) => acc + item.cost * item.stock, 0);
  const potencialFaturamento = props.products.reduce((acc, item) => acc + item.price * item.stock, 0);
  const balancoMensal = biInsights.kpis.revenue - biInsights.kpis.expenses;
  const lowStockSuggestions = dashboard.lowStock.map((item) => {
    const gapToMin = Math.max(item.minStock - item.stock, 0);
    const targetStock = Math.max(item.minStock * 2, item.minStock + 5);
    const suggestedQty = Math.max(targetStock - item.stock, gapToMin, 1);
    return { ...item, suggestedQty };
  });

  return (
    <section className="dashboard-shell">
      <section className="dashboard-hero table-card animated">
        <div>
          <h3>Painel executivo</h3>
          <p className="theme-helper">
            Visão consolidada de performance, risco e crescimento em uma única tela.
          </p>
        </div>
        <div className="dashboard-hero-metrics">
          <span className="metric-pill">Vendas: {props.realSalesCount}</span>
          <span className="metric-pill">Compras: {props.realPurchasesCount}</span>
          <span className="metric-pill">
            Atualização: {new Date(biInsights.updatedAt).toLocaleTimeString("pt-BR")}
          </span>
        </div>
      </section>

      <section className="dashboard-balance-strip table-card animated">
        <div className="dashboard-balance-head">
          <div>
            <h3>Balanço geral</h3>
            <p className="theme-helper">Indicadores principais do mês selecionado (comparáveis ao filtro do BI).</p>
          </div>
          <label className="dashboard-month-select">
            <span>Mês</span>
            <select
              value={props.selectedMonth}
              onChange={(event) => props.setSelectedMonth(event.target.value)}
              aria-label="Filtrar dashboard por mês"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dashboard-balance-grid">
          <article className="dashboard-balance-card">
            <h4>Total comprado</h4>
            <strong>{props.formatBRL(purchasesTotal)}</strong>
            <span className="theme-helper">Soma das ordens de compra não canceladas no período</span>
          </article>
          <article className="dashboard-balance-card">
            <h4>Total faturado</h4>
            <strong>{props.formatBRL(dashboard.revenue)}</strong>
            <span className="theme-helper">Receita de vendas no mês</span>
          </article>
          <article className="dashboard-balance-card">
            <h4>Lucro geral</h4>
            <strong>{props.formatBRL(dashboard.profit)}</strong>
            <span className="theme-helper">Lucro bruto: faturamento − custo dos itens vendidos (CPV)</span>
          </article>
        </div>
        {!props.viewerOnly ? (
          <div className="dashboard-balance-footer">
            <button type="button" className="ghost-btn" onClick={() => props.selectModule("relatorios")}>
              Abrir relatórios com gráficos
            </button>
          </div>
        ) : null}
      </section>

      <section className="kpi-grid dashboard-kpi-grid">
        <article className="kpi-card animated delay-1">
          <h3>Faturamento</h3>
          <strong>{props.formatBRL(dashboard.revenue)}</strong>
          <span>Receita total em vendas</span>
        </article>
        <article className="kpi-card animated delay-2">
          <h3>Despesas</h3>
          <strong>{props.formatBRL(dashboard.expenses)}</strong>
          <span>Custos operacionais lançados</span>
        </article>
        <article className="kpi-card animated delay-3">
          <h3>Lucro bruto</h3>
          <strong>{props.formatBRL(dashboard.profit)}</strong>
          <span>Receita − custo dos itens vendidos</span>
        </article>
        <article className="kpi-card animated delay-4">
          <h3>Estoque contabil</h3>
          <strong>{props.formatBRL(estoqueContabil)}</strong>
          <span>Valor de custo do estoque</span>
        </article>
      </section>

      <section className="kpi-grid kpi-grid-bi dashboard-kpi-grid">
        <article className="kpi-card animated delay-1">
          <h3>Margem bruta</h3>
          <strong>{biInsights.kpis.margin.toFixed(1)}%</strong>
          <span>Lucro bruto ÷ receita do mês</span>
        </article>
        <article className="kpi-card animated delay-2">
          <h3>Balanço</h3>
          <strong>{props.formatBRL(balancoMensal)}</strong>
          <span>Vendas - despesas (mês)</span>
        </article>
        <article className="kpi-card animated delay-3">
          <h3>Potencial de faturamento</h3>
          <strong>{props.formatBRL(potencialFaturamento)}</strong>
          <span>Estoque x preco de venda da lista</span>
        </article>
        <article className="kpi-card animated delay-4">
          <h3>Ticket médio</h3>
          <strong>{props.formatBRL(biInsights.kpis.averageTicket)}</strong>
          <span>{biInsights.kpis.salesCount} vendas no mês corrente</span>
        </article>
      </section>

      {!props.viewerOnly ? (
        <section className="quick-grid animated">
          <button className="quick-card" onClick={() => props.selectModule("vendas")}>
            <h4>Novo pedido</h4>
            <p>Registrar venda rapidamente no caixa</p>
          </button>
          <button className="quick-card" onClick={() => props.selectModule("produtos")}>
            <h4>Gerir estoque</h4>
            <p>Atualizar catálogo e acompanhar mínimos</p>
          </button>
          <button className="quick-card" onClick={() => props.selectModule("financeiro")}>
            <h4>Fluxo financeiro</h4>
            <p>Controlar despesas e contas futuras</p>
          </button>
        </section>
      ) : null}

      <section className="module-grid animated bi-grid">
        <article className="table-card">
          <h3>Relatório visual: receita x custo x lucro (6 meses)</h3>
          <p className="theme-helper">
            Atualização em tempo real a cada 15s{" "}
            {props.biRefreshing ? "(sincronizando...)" : `(última: ${new Date(biInsights.updatedAt).toLocaleTimeString("pt-BR")})`}
          </p>
          <div className="bi-series-list">
            {biInsights.timeseries.map((point) => (
              <div className="bi-series-row" key={point.period}>
                <div className="bi-series-head">
                  <strong>{point.label}</strong>
                  <span>{props.formatBRL(point.profit)}</span>
                </div>
                <div className="bi-series-bars">
                  <div
                    className="bi-bar revenue"
                    style={{ width: `${(point.revenue / props.maxTimeseriesValue) * 100}%` }}
                    title={`Receita: ${props.formatBRL(point.revenue)}`}
                  />
                  <div
                    className="bi-bar expenses"
                    style={{ width: `${(point.expenses / props.maxTimeseriesValue) * 100}%` }}
                    title={`Custos: ${props.formatBRL(point.expenses)}`}
                  />
                  <div
                    className="bi-bar profit"
                    style={{ width: `${(Math.max(point.profit, 0) / props.maxTimeseriesValue) * 100}%` }}
                    title={`Lucro: ${props.formatBRL(point.profit)}`}
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
                    <span>{props.formatBRL(item.revenue)}</span>
                    <div
                      className="bi-rank-meter"
                      style={{ width: `${(item.revenue / props.maxTopProductValue) * 100}%` }}
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
                    <span>{props.formatBRL(item.total)}</span>
                    <div
                      className="bi-rank-meter expenses"
                      style={{ width: `${(item.total / props.maxCostCategoryValue) * 100}%` }}
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
              <strong>{props.formatBRL(biInsights.forecast.nextRevenue)}</strong>
            </div>
            <div className="prediction-card">
              <span>Custos projetados</span>
              <strong>{props.formatBRL(biInsights.forecast.nextExpenses)}</strong>
            </div>
            <div className="prediction-card">
              <span>Lucro projetado</span>
              <strong>{props.formatBRL(biInsights.forecast.nextProfit)}</strong>
            </div>
          </div>
          <p className="theme-helper">Projeção baseada na tendência dos últimos meses.</p>
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
                    {risk.projectedDaysToStockout === null ? "Sem previsão" : `${risk.projectedDaysToStockout} dias`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="table-card animated">
        <h3>Produtos com estoque crítico</h3>
        <div className="table-scroll dashboard-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Estoque</th>
                <th>Mínimo</th>
                <th>Sugestão de compra</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {lowStockSuggestions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhum item em nível crítico no momento.
                  </td>
                </tr>
              ) : (
                lowStockSuggestions.map((item) => (
                  <tr key={item._id}>
                    <td>{item.name}</td>
                    <td>{item.sku}</td>
                    <td>{item.stock}</td>
                    <td>{item.minStock}</td>
                    <td>{item.suggestedQty} un.</td>
                    <td>
                      {props.viewerOnly ? (
                        "—"
                      ) : (
                        <button type="button" className="ghost-btn" onClick={() => props.selectModule("compras")}>
                          Repor estoque
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="promo-card animated">
        <h3>ERP pronto para crescer com seu negócio</h3>
        <p>
          Expanda com fiscal, múltiplas lojas, permissões por perfil e painéis analíticos avançados sem trocar de plataforma.
        </p>
        <button className="ghost-btn" onClick={() => props.selectModule("clientes")}>
          Explorar módulos
        </button>
      </section>
    </section>
  );
}

