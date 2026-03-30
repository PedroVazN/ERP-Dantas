import type { Sale, SaleItem } from "../types";

/** ID do cliente na venda (API pode retornar só o id ou documento populado). */
export function saleCustomerId(sale: Sale): string {
  const c = sale.customer;
  if (c == null || c === "") return "";
  if (typeof c === "object" && c !== null && "_id" in c) {
    return String((c as { _id: string })._id);
  }
  if (typeof c === "string") return c;
  return "";
}

/** ID do produto na linha da venda (API pode retornar só o id ou documento populado). */
export function saleItemProductId(item: SaleItem): string {
  const p = item.product;
  if (p == null || p === "") return "";
  if (typeof p === "string") return p;
  if (typeof p === "object" && p !== null && "_id" in p) {
    return String((p as { _id: string })._id);
  }
  return "";
}

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
