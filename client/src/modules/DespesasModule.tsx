import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { Expense } from "../types";

type ExpenseFormState = {
  supplier: string;
  purchaseChannel: string;
  paymentMethod: string;
  description: string;
  category: string;
  amount: number;
  paymentDate: string;
  dueDate: string;
};

export type DespesasModuleProps = {
  submitExpense: (event: FormEvent) => Promise<void> | void;
  expenseForm: ExpenseFormState;
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormState>>;
  expenses: Expense[];
  updateExpensePaymentStatus: (expenseId: string, status: "PAGO" | "PENDENTE") => void;
  editExpense: (expense: Expense) => void;
  deleteExpense: (expense: Expense) => void;
  formatBRL: (value: number) => string;
};

export default function DespesasModule(props: DespesasModuleProps) {
  return (
    <section className="module-grid animated despesas-module">
      <form className="form-card" onSubmit={props.submitExpense}>
        <h3>Lançar despesa operacional</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Fornecedor</label>
            <input
              value={props.expenseForm.supplier}
              onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, supplier: event.target.value }))}
              placeholder="Ex.: Embalagens XYZ"
              required
            />
          </div>
          <div className="form-field">
            <label>Meio de compra</label>
            <input
              value={props.expenseForm.purchaseChannel}
              onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, purchaseChannel: event.target.value }))}
              placeholder="Ex.: loja física, e-commerce"
              required
            />
          </div>
          <div className="form-field">
            <label>Meio de pagamento</label>
            <select
              value={props.expenseForm.paymentMethod}
              onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
            >
              <option value="PIX">PIX</option>
              <option value="BOLETO">BOLETO</option>
              <option value="CARTAO">CARTÃO</option>
              <option value="TRANSFERENCIA">TRANSFERÊNCIA</option>
              <option value="DINHEIRO">DINHEIRO</option>
            </select>
          </div>
          <div className="form-field">
            <label>Valor total</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={props.expenseForm.amount}
              onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, amount: Number(event.target.value) }))}
              required
            />
          </div>
          <div className="form-field">
            <label>Data de pagamento</label>
            <input
              type="date"
              value={props.expenseForm.paymentDate}
              onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, paymentDate: event.target.value }))}
              required
            />
          </div>
          <div className="form-field">
            <label>Categoria</label>
            <input
              value={props.expenseForm.category}
              onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
              required
            />
          </div>
        </div>
        <div className="form-field">
          <label>Descritivo</label>
          <textarea
            rows={3}
            value={props.expenseForm.description}
            onChange={(event) => props.setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
            required
          />
        </div>
        <button type="submit">Lançar despesa</button>
      </form>

      <section className="table-card" style={{ gridColumn: "1 / -1" }}>
        <h3>Despesas lançadas</h3>
        <div className="table-scroll">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Descritivo</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {props.expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">Nenhuma despesa lançada.</td>
                </tr>
              ) : (
                props.expenses.map((expense) => (
                  <tr key={expense._id}>
                    <td data-label="Fornecedor">{expense.supplier || "-"}</td>
                    <td data-label="Descritivo">{expense.description}</td>
                    <td data-label="Pagamento">
                      {new Date(expense.paymentDate || expense.dueDate).toLocaleDateString("pt-BR")}
                    </td>
                    <td data-label="Valor">{props.formatBRL(expense.amount)}</td>
                    <td data-label="Status">{expense.status}</td>
                    <td data-label="Ações">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() =>
                            props.updateExpensePaymentStatus(
                              expense._id,
                              expense.status === "PAGO" ? "PENDENTE" : "PAGO"
                            )
                          }
                        >
                          {expense.status === "PAGO" ? "Marcar pendente" : "Marcar pago"}
                        </button>
                        <button type="button" className="ghost-btn" onClick={() => props.editExpense(expense)}>
                          Editar
                        </button>
                        <button type="button" className="ghost-btn danger" onClick={() => props.deleteExpense(expense)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

