export type MovimentacaoTipo = "entrada" | "saida";
export type MovimentacaoOrigem = "manual" | "venda" | "compra" | "despesa" | "estorno";
export type FinancePeriodo = "hoje" | "semana" | "mes" | "todos";

export interface Movimentacao {
  id: string;
  data: string;
  tipo: MovimentacaoTipo;
  valor: number;
  descricao: string;
  categoria: string;
  origem: MovimentacaoOrigem;
  referenciaId?: string;
  movimentacaoOriginalId?: string;
}

export type MovimentacaoInput = Omit<Movimentacao, "id" | "origem"> & {
  origem?: "manual";
};

export type FinanceFiltersState = {
  periodo: FinancePeriodo;
  tipo: "todos" | MovimentacaoTipo;
  origem: "todas" | MovimentacaoOrigem;
  categoria: "todas" | string;
};
