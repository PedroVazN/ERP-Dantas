import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Purchase, Sale } from "../../types";
import { financeiroService } from "../services/financeiroService";
import type { FinanceFiltersState, Movimentacao, MovimentacaoInput } from "../types/movimentacao";

type State = {
  loading: boolean;
  saving: boolean;
  movimentacoes: Movimentacao[];
  filters: FinanceFiltersState;
  editingId: string | null;
};

type Action =
  | { type: "setLoading"; payload: boolean }
  | { type: "setSaving"; payload: boolean }
  | { type: "setMovimentacoes"; payload: Movimentacao[] }
  | { type: "prependMovimentacao"; payload: Movimentacao }
  | { type: "updateMovimentacao"; payload: Movimentacao }
  | { type: "removeMovimentacao"; payload: string }
  | { type: "setFilters"; payload: Partial<FinanceFiltersState> }
  | { type: "setEditingId"; payload: string | null };

const initialFilters: FinanceFiltersState = {
  periodo: "mes",
  tipo: "todos",
  origem: "todas",
  categoria: "todas",
};

const initialState: State = {
  loading: true,
  saving: false,
  movimentacoes: [],
  filters: initialFilters,
  editingId: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setLoading":
      return { ...state, loading: action.payload };
    case "setSaving":
      return { ...state, saving: action.payload };
    case "setMovimentacoes":
      return { ...state, movimentacoes: action.payload };
    case "prependMovimentacao":
      return { ...state, movimentacoes: [action.payload, ...state.movimentacoes] };
    case "updateMovimentacao":
      return {
        ...state,
        movimentacoes: state.movimentacoes.map((m) => (m.id === action.payload.id ? action.payload : m)),
      };
    case "removeMovimentacao":
      return { ...state, movimentacoes: state.movimentacoes.filter((m) => m.id !== action.payload) };
    case "setFilters":
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case "setEditingId":
      return { ...state, editingId: action.payload };
    default:
      return state;
  }
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isToday = (date: Date) => startOfDay(date).getTime() === startOfDay(new Date()).getTime();
const isCurrentWeek = (date: Date) => {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1)));
  return startOfDay(date) >= monday;
};
const isCurrentMonth = (date: Date) => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

function isVendaPaga(sale: Sale) {
  return sale.status === "CONCLUIDA" || sale.status === "FATURADA" || sale.billingStatus === "FATURADO";
}

function isVendaCancelada(sale: Sale) {
  return sale.status === "CANCELADA" || sale.billingStatus === "CANCELADO";
}

function isCompraPaga(purchase: Purchase) {
  return purchase.status === "RECEBIDA";
}

function isCompraCancelada(purchase: Purchase) {
  return purchase.status === "CANCELADA";
}

export function useFinanceiro(params: { sales: Sale[]; purchases: Purchase[] }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const saleStateById = useRef<Map<string, { paid: boolean; cancelled: boolean }>>(new Map());
  const purchaseStateById = useRef<Map<string, { paid: boolean; cancelled: boolean }>>(new Map());

  const load = useCallback(async () => {
    dispatch({ type: "setLoading", payload: true });
    try {
      const items = await financeiroService.listarMovimentacoes();
      dispatch({ type: "setMovimentacoes", payload: items });
    } finally {
      dispatch({ type: "setLoading", payload: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createManual = useCallback(async (payload: MovimentacaoInput) => {
    dispatch({ type: "setSaving", payload: true });
    try {
      const created = await financeiroService.criarMovimentacao({ ...payload, origem: "manual" });
      dispatch({ type: "prependMovimentacao", payload: created });
      return created;
    } finally {
      dispatch({ type: "setSaving", payload: false });
    }
  }, []);

  const updateManual = useCallback(async (id: string, payload: Partial<MovimentacaoInput>) => {
    const found = state.movimentacoes.find((m) => m.id === id);
    if (!found || found.origem !== "manual") return null;
    dispatch({ type: "setSaving", payload: true });
    try {
      const updated = await financeiroService.atualizarMovimentacao(id, { ...payload, origem: "manual" });
      if (updated) dispatch({ type: "updateMovimentacao", payload: updated });
      return updated;
    } finally {
      dispatch({ type: "setSaving", payload: false });
    }
  }, [state.movimentacoes]);

  const removeManual = useCallback(async (id: string) => {
    const found = state.movimentacoes.find((m) => m.id === id);
    if (!found || found.origem !== "manual") return false;
    dispatch({ type: "setSaving", payload: true });
    try {
      const ok = await financeiroService.excluirMovimentacao(id);
      if (ok) dispatch({ type: "removeMovimentacao", payload: id });
      return ok;
    } finally {
      dispatch({ type: "setSaving", payload: false });
    }
  }, [state.movimentacoes]);

  const createEstorno = useCallback(
    async (movimentacaoOriginalId: string, descricao?: string) => {
      const original = state.movimentacoes.find((m) => m.id === movimentacaoOriginalId);
      if (!original) return null;
      const exists = state.movimentacoes.some((m) => m.movimentacaoOriginalId === movimentacaoOriginalId);
      if (exists) return null;
      const est = await financeiroService.criarEstorno(original, new Date().toISOString(), descricao);
      dispatch({ type: "prependMovimentacao", payload: est });
      return est;
    },
    [state.movimentacoes]
  );

  // Integração automática: vendas pagas e estorno em cancelamento.
  useEffect(() => {
    async function syncSales() {
      for (const sale of params.sales) {
        const paid = isVendaPaga(sale);
        const cancelled = isVendaCancelada(sale);
        const prev = saleStateById.current.get(sale._id) || { paid: false, cancelled: false };

        if (paid && !prev.paid) {
          const existing = state.movimentacoes.find(
            (m) => m.origem === "venda" && m.referenciaId === sale._id && m.tipo === "entrada"
          );
          if (!existing) {
            const desc = `Venda #${String(sale._id).slice(-6).toUpperCase()} - ${typeof sale.customer === "object" ? sale.customer?.name || "Cliente" : "Cliente"}`;
            const created = await financeiroService.criarMovimentacao({
              data: sale.createdAt || new Date().toISOString(),
              tipo: "entrada",
              valor: Number(sale.totalAmount) || 0,
              descricao: desc,
              categoria: "VENDAS",
              origem: "venda",
              referenciaId: sale._id,
            });
            dispatch({ type: "prependMovimentacao", payload: created });
          }
        }

        if (cancelled && !prev.cancelled) {
          const original = state.movimentacoes.find(
            (m) => m.origem === "venda" && m.referenciaId === sale._id && m.tipo === "entrada"
          );
          if (original) {
            const alreadyReversed = state.movimentacoes.some((m) => m.movimentacaoOriginalId === original.id);
            if (!alreadyReversed) {
              const est = await financeiroService.criarEstorno(
                original,
                new Date().toISOString(),
                `Estorno venda #${String(sale._id).slice(-6).toUpperCase()}`
              );
              dispatch({ type: "prependMovimentacao", payload: est });
            }
          }
        }

        saleStateById.current.set(sale._id, { paid, cancelled });
      }
    }
    void syncSales();
  }, [params.sales, state.movimentacoes]);

  // Integração automática: compras pagas e estorno em cancelamento.
  useEffect(() => {
    async function syncPurchases() {
      for (const purchase of params.purchases) {
        const paid = isCompraPaga(purchase);
        const cancelled = isCompraCancelada(purchase);
        const prev = purchaseStateById.current.get(purchase._id) || { paid: false, cancelled: false };

        if (paid && !prev.paid) {
          const existing = state.movimentacoes.find(
            (m) => m.origem === "compra" && m.referenciaId === purchase._id && m.tipo === "saida"
          );
          if (!existing) {
            const created = await financeiroService.criarMovimentacao({
              data: purchase.createdAt || new Date().toISOString(),
              tipo: "saida",
              valor: Number(purchase.totalAmount) || 0,
              descricao: `Compra - ${purchase.supplier || "Fornecedor"}`,
              categoria: "COMPRAS",
              origem: "compra",
              referenciaId: purchase._id,
            });
            dispatch({ type: "prependMovimentacao", payload: created });
          }
        }

        if (cancelled && !prev.cancelled) {
          const original = state.movimentacoes.find(
            (m) => m.origem === "compra" && m.referenciaId === purchase._id && m.tipo === "saida"
          );
          if (original) {
            const alreadyReversed = state.movimentacoes.some((m) => m.movimentacaoOriginalId === original.id);
            if (!alreadyReversed) {
              const est = await financeiroService.criarEstorno(
                original,
                new Date().toISOString(),
                `Estorno compra #${String(purchase._id).slice(-6).toUpperCase()}`
              );
              dispatch({ type: "prependMovimentacao", payload: est });
            }
          }
        }

        purchaseStateById.current.set(purchase._id, { paid, cancelled });
      }
    }
    void syncPurchases();
  }, [params.purchases, state.movimentacoes]);

  const sortedMovimentacoes = useMemo(
    () =>
      [...state.movimentacoes].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      ),
    [state.movimentacoes]
  );

  const filteredMovimentacoes = useMemo(() => {
    return sortedMovimentacoes.filter((mov) => {
      const date = new Date(mov.data);
      if (state.filters.periodo === "hoje" && !isToday(date)) return false;
      if (state.filters.periodo === "semana" && !isCurrentWeek(date)) return false;
      if (state.filters.periodo === "mes" && !isCurrentMonth(date)) return false;
      if (state.filters.tipo !== "todos" && mov.tipo !== state.filters.tipo) return false;
      if (state.filters.origem !== "todas" && mov.origem !== state.filters.origem) return false;
      if (state.filters.categoria !== "todas" && mov.categoria !== state.filters.categoria) return false;
      return true;
    });
  }, [sortedMovimentacoes, state.filters]);

  const summary = useMemo(() => {
    const totalEntradas = filteredMovimentacoes
      .filter((m) => m.tipo === "entrada")
      .reduce((acc, m) => acc + m.valor, 0);
    const totalSaidas = filteredMovimentacoes
      .filter((m) => m.tipo === "saida")
      .reduce((acc, m) => acc + m.valor, 0);
    return {
      totalEntradas,
      totalSaidas,
      saldoAtual: totalEntradas - totalSaidas,
    };
  }, [filteredMovimentacoes]);

  const categorias = useMemo(
    () => Array.from(new Set(state.movimentacoes.map((m) => m.categoria).filter(Boolean))).sort(),
    [state.movimentacoes]
  );

  return {
    loading: state.loading,
    saving: state.saving,
    filters: state.filters,
    editingId: state.editingId,
    movimentacoes: filteredMovimentacoes,
    categorias,
    summary,
    formatCurrency: (value: number) => money.format(value || 0),
    setFilters: (payload: Partial<FinanceFiltersState>) => dispatch({ type: "setFilters", payload }),
    setEditingId: (id: string | null) => dispatch({ type: "setEditingId", payload: id }),
    createManual,
    updateManual,
    removeManual,
    createEstorno,
    reload: load,
  };
}
