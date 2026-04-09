import type { Movimentacao } from "../types/movimentacao";

type CreateMovimentacaoPayload = Omit<Movimentacao, "id">;

let memoryStore: Movimentacao[] = [
  {
    id: "mov-boot-1",
    data: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    tipo: "entrada",
    valor: 2800,
    descricao: "Saldo inicial de operação",
    categoria: "AJUSTE_INICIAL",
    origem: "manual",
  },
];

function generateId(prefix = "mov") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

const wait = (ms = 80) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const financeiroService = {
  async listarMovimentacoes(): Promise<Movimentacao[]> {
    await wait();
    return [...memoryStore];
  },

  async criarMovimentacao(payload: CreateMovimentacaoPayload): Promise<Movimentacao> {
    await wait();
    const created: Movimentacao = { id: generateId("mov"), ...payload };
    memoryStore = [created, ...memoryStore];
    return created;
  },

  async atualizarMovimentacao(id: string, payload: Partial<Movimentacao>): Promise<Movimentacao | null> {
    await wait();
    let updated: Movimentacao | null = null;
    memoryStore = memoryStore.map((mov) => {
      if (mov.id !== id) return mov;
      updated = { ...mov, ...payload, id: mov.id };
      return updated;
    });
    return updated;
  },

  async excluirMovimentacao(id: string): Promise<boolean> {
    await wait();
    const before = memoryStore.length;
    memoryStore = memoryStore.filter((mov) => mov.id !== id);
    return memoryStore.length < before;
  },

  async criarEstorno(
    original: Movimentacao,
    dataISO = new Date().toISOString(),
    descricao?: string
  ): Promise<Movimentacao> {
    await wait();
    const estorno: Movimentacao = {
      id: generateId("est"),
      data: dataISO,
      tipo: original.tipo === "entrada" ? "saida" : "entrada",
      valor: original.valor,
      descricao: descricao || `Estorno: ${original.descricao}`,
      categoria: "ESTORNO",
      origem: "estorno",
      referenciaId: original.referenciaId,
      movimentacaoOriginalId: original.id,
    };
    memoryStore = [estorno, ...memoryStore];
    return estorno;
  },
};
