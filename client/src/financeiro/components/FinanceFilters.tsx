import type { FinanceFiltersState, MovimentacaoOrigem } from "../types/movimentacao";

type FinanceFiltersProps = {
  filters: FinanceFiltersState;
  categorias: string[];
  onChange: (payload: Partial<FinanceFiltersState>) => void;
};

const origemOptions: Array<{ value: "todas" | MovimentacaoOrigem; label: string }> = [
  { value: "todas", label: "Todas origens" },
  { value: "manual", label: "Manual" },
  { value: "venda", label: "Venda" },
  { value: "compra", label: "Compra" },
  { value: "estorno", label: "Estorno" },
];

export default function FinanceFilters(props: FinanceFiltersProps) {
  return (
    <section className="table-card finance-filters">
      <div className="form-field">
        <label>Período</label>
        <select value={props.filters.periodo} onChange={(e) => props.onChange({ periodo: e.target.value as any })}>
          <option value="hoje">Hoje</option>
          <option value="semana">Semana</option>
          <option value="mes">Mês</option>
          <option value="todos">Todos</option>
        </select>
      </div>
      <div className="form-field">
        <label>Tipo</label>
        <select value={props.filters.tipo} onChange={(e) => props.onChange({ tipo: e.target.value as any })}>
          <option value="todos">Todos</option>
          <option value="entrada">Entrada</option>
          <option value="saida">Saída</option>
        </select>
      </div>
      <div className="form-field">
        <label>Origem</label>
        <select value={props.filters.origem} onChange={(e) => props.onChange({ origem: e.target.value as any })}>
          {origemOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Categoria</label>
        <select value={props.filters.categoria} onChange={(e) => props.onChange({ categoria: e.target.value })}>
          <option value="todas">Todas</option>
          {props.categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
