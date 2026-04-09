import type { EconomicIndicators, Expense, Purchase, Sale } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import FinanceiroPage from "../financeiro/pages/FinanceiroPage";

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
  updateExpensePaymentStatus: (expenseId: string, status: "PAGO" | "PENDENTE") => void;
  editExpense: (expense: Expense) => void;
  deleteExpense: (expense: Expense) => void;
  formatBRL: (value: number) => string;
  sales: Sale[];
  purchases: Purchase[];
};

export default function FinanceiroModule(props: FinanceiroModuleProps) {
  return <FinanceiroPage sales={props.sales} purchases={props.purchases} />;
}

