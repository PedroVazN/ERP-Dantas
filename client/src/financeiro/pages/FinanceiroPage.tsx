import { useMemo } from "react";
import type { Expense, Purchase, Sale } from "../../types";
import FinanceFilters from "../components/FinanceFilters";
import FinanceForm from "../components/FinanceForm";
import FinanceSummary from "../components/FinanceSummary";
import FinanceTable from "../components/FinanceTable";
import { useFinanceiro } from "../hooks/useFinanceiro";
import type { Movimentacao } from "../types/movimentacao";

type FinanceiroPageProps = {
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
};

export default function FinanceiroPage(props: FinanceiroPageProps) {
  const financeiro = useFinanceiro({ sales: props.sales, purchases: props.purchases, expenses: props.expenses });

  const editingMov = useMemo(
    () => financeiro.movimentacoes.find((m) => m.id === financeiro.editingId) || null,
    [financeiro.editingId, financeiro.movimentacoes]
  );

  return (
    <section className="dashboard-shell financeiro-page">
      <header className="table-card finance-header">
        <div>
          <h2>Fluxo de Caixa</h2>
          <p className="theme-helper">
            Extrato financeiro integrado com vendas e compras, com lançamentos manuais e estornos rastreáveis.
          </p>
        </div>
      </header>

      <FinanceSummary
        saldoAtual={financeiro.summary.saldoAtual}
        totalEntradas={financeiro.summary.totalEntradas}
        totalSaidas={financeiro.summary.totalSaidas}
        formatCurrency={financeiro.formatCurrency}
      />

      <FinanceFilters filters={financeiro.filters} categorias={financeiro.categorias} onChange={financeiro.setFilters} />

      <FinanceForm
        saving={financeiro.saving}
        editing={editingMov}
        onCreate={financeiro.createManual}
        onUpdate={financeiro.updateManual}
        onCancelEdit={() => financeiro.setEditingId(null)}
      />

      {financeiro.loading ? <p className="feedback">Carregando movimentações...</p> : null}

      <FinanceTable
        movimentacoes={financeiro.movimentacoes}
        formatCurrency={financeiro.formatCurrency}
        onEditManual={(mov) => financeiro.setEditingId(mov.id)}
        onDeleteManual={(mov) => {
          void financeiro.removeManual(mov.id);
          if (financeiro.editingId === mov.id) financeiro.setEditingId(null);
        }}
        onCreateEstorno={(mov: Movimentacao) => {
          void financeiro.createEstorno(mov.id, `Estorno manual de ${mov.descricao}`);
        }}
      />
    </section>
  );
}
