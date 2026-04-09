import { useEffect, useState } from "react";
import type { Movimentacao, MovimentacaoInput } from "../types/movimentacao";

type FinanceFormProps = {
  saving: boolean;
  editing?: Movimentacao | null;
  onCreate: (payload: MovimentacaoInput) => Promise<unknown> | unknown;
  onUpdate: (id: string, payload: Partial<MovimentacaoInput>) => Promise<unknown> | unknown;
  onCancelEdit: () => void;
};

type FormState = {
  tipo: "entrada" | "saida";
  valor: string;
  data: string;
  descricao: string;
  categoria: string;
};

const initialForm = (): FormState => ({
  tipo: "entrada",
  valor: "",
  data: new Date().toISOString().slice(0, 10),
  descricao: "",
  categoria: "AJUSTE_MANUAL",
});

export default function FinanceForm(props: FinanceFormProps) {
  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    if (!props.editing) return;
    setForm({
      tipo: props.editing.tipo,
      valor: String(props.editing.valor),
      data: props.editing.data.slice(0, 10),
      descricao: props.editing.descricao,
      categoria: props.editing.categoria,
    });
  }, [props.editing]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const valor = Number(form.valor);
    if (!Number.isFinite(valor) || valor <= 0) return;
    const payload: MovimentacaoInput = {
      tipo: form.tipo,
      valor,
      data: new Date(form.data).toISOString(),
      descricao: form.descricao.trim(),
      categoria: form.categoria.trim().toUpperCase(),
      referenciaId: undefined,
      movimentacaoOriginalId: undefined,
    };
    if (props.editing) {
      await props.onUpdate(props.editing.id, payload);
      props.onCancelEdit();
    } else {
      await props.onCreate(payload);
    }
    setForm(initialForm());
  }

  return (
    <form className="form-card finance-form" onSubmit={onSubmit}>
      <h3>{props.editing ? "Editar movimentação manual" : "Nova movimentação manual"}</h3>
      <div className="finance-form-grid">
        <div className="form-field">
          <label>Tipo</label>
          <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as any }))}>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </div>
        <div className="form-field">
          <label>Valor</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.valor}
            onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
            required
          />
        </div>
        <div className="form-field">
          <label>Data</label>
          <input type="date" value={form.data} onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} required />
        </div>
        <div className="form-field">
          <label>Categoria</label>
          <input
            value={form.categoria}
            onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="form-field">
        <label>Descrição</label>
        <input
          value={form.descricao}
          onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
          required
          placeholder="Ex.: Ajuste de caixa"
        />
      </div>
      <div className="table-actions">
        <button type="submit" disabled={props.saving}>
          {props.editing ? "Salvar alteração" : "Cadastrar movimentação"}
        </button>
        {props.editing ? (
          <button type="button" className="ghost-btn" onClick={props.onCancelEdit}>
            Cancelar edição
          </button>
        ) : null}
      </div>
    </form>
  );
}
