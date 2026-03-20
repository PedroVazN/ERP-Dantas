import type { EconomicIndicators, Expense } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type ExpenseFormState = {
  description: string;
  category: string;
  amount: number;
  dueDate: string;
};

export type FinanceiroModuleProps = {
  economicIndicators: EconomicIndicators | null;
  submitExpense: (event: FormEvent) => Promise<void> | void;
  expenseForm: ExpenseFormState;
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormState>>;
  expenses: Expense[];
  reviewExpense: (expenseId: string, action: "aprovar" | "rejeitar" | "pagar") => void;
  editExpense: (expense: Expense) => void;
  deleteExpense: (expense: Expense) => void;
  formatBRL: (value: number) => string;
};

export default function FinanceiroModule(props: FinanceiroModuleProps) {
  const usdBrl = props.economicIndicators?.exchange.usdBrl ?? null;
  const eurBrl = props.economicIndicators?.exchange.eurBrl ?? null;
  const selic = props.economicIndicators?.indicators.selic ?? null;
  const ipca = props.economicIndicators?.indicators.ipca ?? null;

  return (
    <>
      <section className="table-card animated economic-card">
        <h3>Câmbio e indicadores econômicos</h3>
        <p className="theme-helper">
          Fonte: {props.economicIndicators?.exchange.source || "AwesomeAPI"} e{" "}
          {props.economicIndicators?.indicators.source || "Banco Central (SGS)"}.
        </p>
        <div className="economic-grid">
          <article className="economic-item">
            <strong>USD/BRL</strong>
            <span>
              {typeof usdBrl === "number" ? props.formatBRL(usdBrl) : "Indisponível"}
            </span>
          </article>
          <article className="economic-item">
            <strong>EUR/BRL</strong>
            <span>
              {typeof eurBrl === "number" ? props.formatBRL(eurBrl) : "Indisponível"}
            </span>
          </article>
          <article className="economic-item">
            <strong>SELIC (%)</strong>
            <span>
              {typeof selic === "number" ? `${selic.toFixed(2)}%` : "Indisponível"}
            </span>
          </article>
          <article className="economic-item">
            <strong>IPCA (%)</strong>
            <span>
              {typeof ipca === "number" ? `${ipca.toFixed(2)}%` : "Indisponível"}
            </span>
          </article>
        </div>
      </section>

      <section className="module-grid animated">
        <form className="form-card" onSubmit={props.submitExpense}>
          <h3>Nova despesa</h3>
          <div className="form-field">
            <label>Descrição</label>
            <small className="field-help">
              O que é esta despesa (ex.: “Aluguel”, “Embalagens”).
            </small>
            <input
              placeholder="ex.: Aluguel"
              value={props.expenseForm.description}
              onChange={(event) =>
                props.setExpenseForm({
                  ...props.expenseForm,
                  description: event.target.value,
                })
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Categoria</label>
            <small className="field-help">
              Tipo da despesa para relatórios (ex.: operacional, marketing).
            </small>
            <input
              placeholder="ex.: OPERACIONAL"
              value={props.expenseForm.category}
              onChange={(event) =>
                props.setExpenseForm({
                  ...props.expenseForm,
                  category: event.target.value,
                })
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Valor</label>
            <small className="field-help">Quanto será pago (R$).</small>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="ex.: 350,00"
              value={props.expenseForm.amount}
              onChange={(event) =>
                props.setExpenseForm({
                  ...props.expenseForm,
                  amount: Number(event.target.value),
                })
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Vencimento</label>
            <small className="field-help">Data limite para pagamento.</small>
            <input
              type="date"
              value={props.expenseForm.dueDate}
              onChange={(event) =>
                props.setExpenseForm({
                  ...props.expenseForm,
                  dueDate: event.target.value,
                })
              }
              required
            />
          </div>
          <button type="submit">Lançar despesa</button>
        </form>

        <section className="table-card">
          <h3>Contas a pagar</h3>
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Aprovação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {props.expenses.map((item) => (
                <tr key={item._id}>
                  <td>{item.description}</td>
                  <td>{item.category}</td>
                  <td>{new Date(item.dueDate).toLocaleDateString("pt-BR")}</td>
                  <td>{props.formatBRL(item.amount)}</td>
                  <td>{item.status}</td>
                  <td>{item.approval?.status || "-"}</td>
                  <td>
                    <div className="table-actions">
                      {item.status === "AGUARDANDO_APROVACAO" ? (
                        <>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => props.reviewExpense(item._id, "aprovar")}
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            className="ghost-btn danger"
                            onClick={() => props.reviewExpense(item._id, "rejeitar")}
                          >
                            Rejeitar
                          </button>
                        </>
                      ) : null}
                      {item.status === "PENDENTE" ? (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => props.reviewExpense(item._id, "pagar")}
                        >
                          Marcar pago
                        </button>
                      ) : null}
                      <button type="button" className="ghost-btn" onClick={() => props.editExpense(item)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ghost-btn danger"
                        onClick={() => props.deleteExpense(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}

