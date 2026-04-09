type FinanceSummaryProps = {
  saldoAtual: number;
  totalEntradas: number;
  totalSaidas: number;
  formatCurrency: (value: number) => string;
};

export default function FinanceSummary(props: FinanceSummaryProps) {
  return (
    <section className="finance-summary-grid">
      <article className="kpi-card finance-kpi">
        <h3>Saldo atual</h3>
        <strong>{props.formatCurrency(props.saldoAtual)}</strong>
        <span>{props.saldoAtual >= 0 ? "Resultado positivo no período" : "Atenção ao caixa do período"}</span>
      </article>
      <article className="kpi-card finance-kpi finance-kpi-in">
        <h3>Total de entradas</h3>
        <strong>{props.formatCurrency(props.totalEntradas)}</strong>
        <span>Receitas confirmadas</span>
      </article>
      <article className="kpi-card finance-kpi finance-kpi-out">
        <h3>Total de saídas</h3>
        <strong>{props.formatCurrency(props.totalSaidas)}</strong>
        <span>Pagamentos e despesas</span>
      </article>
    </section>
  );
}
