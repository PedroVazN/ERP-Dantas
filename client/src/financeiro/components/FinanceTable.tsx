import type { Movimentacao } from "../types/movimentacao";

type FinanceTableProps = {
  movimentacoes: Movimentacao[];
  formatCurrency: (value: number) => string;
  onEditManual: (mov: Movimentacao) => void;
  onDeleteManual: (mov: Movimentacao) => void;
  onCreateEstorno: (mov: Movimentacao) => void;
};

function originLabel(origem: Movimentacao["origem"]) {
  if (origem === "manual") return "Manual";
  if (origem === "venda") return "Venda";
  if (origem === "compra") return "Compra";
  return "Estorno";
}

export default function FinanceTable(props: FinanceTableProps) {
  return (
    <section className="table-card">
      <h3>Movimentações financeiras</h3>
      <div className="table-scroll">
        <table className="finance-table responsive-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Origem</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.movimentacoes.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  Nenhuma movimentação para os filtros escolhidos.
                </td>
              </tr>
            ) : (
              props.movimentacoes.map((mov) => {
                const isEntrada = mov.tipo === "entrada";
                const valueClass = isEntrada ? "finance-value in" : "finance-value out";
                const canEdit = mov.origem === "manual";
                const alreadyReversed = props.movimentacoes.some((x) => x.movimentacaoOriginalId === mov.id);
                return (
                  <tr key={mov.id}>
                    <td data-label="Data">{new Date(mov.data).toLocaleDateString("pt-BR")}</td>
                    <td data-label="Tipo">
                      <span className={`status-chip ${isEntrada ? "success" : "danger"}`}>
                        {isEntrada ? "+ Entrada" : "- Saída"}
                      </span>
                    </td>
                    <td data-label="Valor" className={valueClass}>{props.formatCurrency(mov.valor)}</td>
                    <td data-label="Descrição">{mov.descricao}</td>
                    <td data-label="Categoria">{mov.categoria}</td>
                    <td data-label="Origem">{originLabel(mov.origem)}</td>
                    <td data-label="Ações">
                      <div className="table-actions">
                        {canEdit ? (
                          <>
                            <button type="button" className="ghost-btn" onClick={() => props.onEditManual(mov)}>
                              Editar
                            </button>
                            <button type="button" className="ghost-btn danger" onClick={() => props.onDeleteManual(mov)}>
                              Excluir
                            </button>
                          </>
                        ) : null}
                        {!canEdit && mov.origem !== "estorno" && !alreadyReversed ? (
                          <button type="button" className="ghost-btn" onClick={() => props.onCreateEstorno(mov)}>
                            Criar estorno
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
