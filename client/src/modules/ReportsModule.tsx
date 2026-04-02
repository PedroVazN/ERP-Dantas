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

import { api } from "../api";
import type { MonthlyReportResponse } from "../types";

export type ReportsModuleProps = {
  scopedPath: (path: string) => string;
  formatBRL: (value: number) => string;
};

export default function ReportsModule(props: ReportsModuleProps) {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<MonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const q = `?months=${months}`;
      const res = await api.get<MonthlyReportResponse>(props.scopedPath(`/reports/monthly-series${q}`));
      setData(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar relatórios";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [props.scopedPath, months]);

  useEffect(() => {
    void load();
  }, [load]);

  const series = data?.series ?? [];

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

      {!loading && !error && series.length === 0 ? (
        <p className="empty feedback">Nenhum dado no período selecionado.</p>
      ) : null}
    </section>
  );
}
