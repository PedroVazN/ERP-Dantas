import { useMemo } from "react";
import type { Expense, Purchase, Sale } from "../../types";
import FinanceFilters from "../components/FinanceFilters";
import FinanceSummary from "../components/FinanceSummary";
import { useFinanceiro } from "../hooks/useFinanceiro";

type ContaCorrentePageProps = {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
};

export default function ContaCorrentePage(props: ContaCorrentePageProps) {
  const financeiro = useFinanceiro({ sales: props.sales, purchases: props.purchases, expenses: props.expenses });

  const statementRows = useMemo(() => {
    const oldestFirst = [...financeiro.movimentacoes].sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
    );
    let running = 0;
    const withBalance = oldestFirst.map((mov) => {
      running += mov.tipo === "entrada" ? mov.valor : -mov.valor;
      return { mov, runningBalance: running };
    });
    return withBalance.reverse();
  }, [financeiro.movimentacoes]);

  return (
    <section className="dashboard-shell financeiro-page conta-corrente-page">
      <header className="table-card finance-header">
        <div>
          <h2>Conta Corrente</h2>
          <p className="theme-helper">
            Visão executiva do caixa: acompanhe entradas, saídas e saldo acumulado por lançamento.
          </p>
        </div>
      </header>

      <FinanceSummary
        saldoAtual={financeiro.summary.saldoAtual}
        totalEntradas={financeiro.summary.totalEntradas}
        totalSaidas={financeiro.summary.totalSaidas}
        formatCurrency={financeiro.formatCurrency}
      />

      <FinanceFilters
        filters={financeiro.filters}
        categorias={financeiro.categorias}
        onChange={financeiro.setFilters}
      />

      {financeiro.loading ? <p className="feedback">Carregando extrato...</p> : null}

      <section className="table-card">
        <h3>Extrato da conta</h3>
        <div className="table-scroll">
          <table className="finance-table responsive-table conta-corrente-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Origem</th>
                <th>Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhuma movimentação para os filtros escolhidos.
                  </td>
                </tr>
              ) : (
                statementRows.map(({ mov, runningBalance }) => {
                  const isEntrada = mov.tipo === "entrada";
                  return (
                    <tr key={mov.id}>
                      <td data-label="Data">{new Date(mov.data).toLocaleDateString("pt-BR")}</td>
                      <td data-label="Tipo">
                        <span className={`status-chip ${isEntrada ? "success" : "danger"}`}>
                          {isEntrada ? "+ Entrada" : "- Saída"}
                        </span>
                      </td>
                      <td data-label="Valor" className={`finance-value ${isEntrada ? "in" : "out"}`}>
                        {financeiro.formatCurrency(mov.valor)}
                      </td>
                      <td data-label="Descrição">{mov.descricao}</td>
                      <td data-label="Categoria">{mov.categoria}</td>
                      <td data-label="Origem">
                        {mov.origem === "venda"
                          ? "Venda"
                          : mov.origem === "compra"
                            ? "Compra"
                            : mov.origem === "despesa"
                              ? "Despesa"
                            : mov.origem === "manual"
                              ? "Manual"
                              : "Estorno"}
                      </td>
                      <td
                        data-label="Saldo acumulado"
                        className={`finance-value ${runningBalance >= 0 ? "in" : "out"}`}
                      >
                        {financeiro.formatCurrency(runningBalance)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

