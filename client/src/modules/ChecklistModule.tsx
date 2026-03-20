import type { ChecklistItem } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type ChecklistFormState = {
  title: string;
  notes: string;
};

export type ChecklistModuleProps = {
  submitChecklistItem: (event: FormEvent) => Promise<void> | void;
  checklistForm: ChecklistFormState;
  setChecklistForm: Dispatch<SetStateAction<ChecklistFormState>>;
  checklistItems: ChecklistItem[];
  toggleChecklistItem: (item: ChecklistItem) => void;
  editChecklistItem: (item: ChecklistItem) => void;
  deleteChecklistItem: (item: ChecklistItem) => void;
};

export default function ChecklistModule(props: ChecklistModuleProps) {
  return (
    <section className="module-grid animated">
      <form className="form-card" onSubmit={props.submitChecklistItem}>
        <h3>Nova ideia de implementação</h3>
        <div className="form-field">
          <label>Título</label>
          <small className="field-help">Nome curto da melhoria/funcionalidade desejada.</small>
          <input
            placeholder="ex.: Emitir NF-e automática"
            value={props.checklistForm.title}
            onChange={(event) =>
              props.setChecklistForm({ ...props.checklistForm, title: event.target.value })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>Detalhes</label>
          <small className="field-help">Opcional. Contexto, regras e observações.</small>
          <textarea
            rows={4}
            placeholder="Descreva o que precisa, quando usar, regras de negócio..."
            value={props.checklistForm.notes}
            onChange={(event) =>
              props.setChecklistForm({ ...props.checklistForm, notes: event.target.value })
            }
          />
        </div>
        <button type="submit">Adicionar à checklist</button>
      </form>

      <section className="table-card">
        <h3>Checklist de futuros implementos</h3>
        <table>
          <thead>
            <tr>
              <th>Ideia</th>
              <th>Detalhes</th>
              <th>Criada em</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.checklistItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhuma ideia cadastrada ainda.
                </td>
              </tr>
            ) : (
              props.checklistItems.map((item) => (
                <tr key={item._id}>
                  <td>{item.title}</td>
                  <td>{item.notes || "-"}</td>
                  <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td>{item.completed ? "Concluída" : "Pendente"}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => props.toggleChecklistItem(item)}
                      >
                        {item.completed ? "Marcar pendente" : "Marcar concluída"}
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => props.editChecklistItem(item)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ghost-btn danger"
                        onClick={() => props.deleteChecklistItem(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}

