import type { Sale } from "../types";

/** Rótulo para exibição do comprador na venda (API pode retornar cliente populado ou só o id). */
export function saleCustomerLabel(sale: Sale): string {
  const c = sale.customer;
  if (c == null || c === "") return "—";
  if (typeof c === "object") {
    const { name, email, phone } = c as { name?: string; email?: string; phone?: string };
    const main = (name || "").trim() || "Cliente";
    const bits = [email, phone].map((x) => (x || "").trim()).filter(Boolean);
    return bits.length ? `${main} · ${bits.join(" · ")}` : main;
  }
  return "Cliente (cadastro)";
}
