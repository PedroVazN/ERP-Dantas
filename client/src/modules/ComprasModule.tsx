import type { Product, Purchase, Supplier } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type PurchaseFormState = {
  supplierId: string;
  productId: string;
  quantity: number;
  cost: number;
};

export type ComprasModuleProps = {
  submitPurchase: (event: FormEvent) => Promise<void> | void;
  purchaseForm: PurchaseFormState;
  setPurchaseForm: Dispatch<SetStateAction<PurchaseFormState>>;
  suppliers: Supplier[];
  filteredProductsBySupplier: Product[];
  purchases: Purchase[];
  reviewPurchase: (purchaseId: string, action: "aprovar" | "rejeitar") => void;
  editPurchase: (purchase: Purchase) => void;
  deletePurchase: (purchase: Purchase) => void;
  formatBRL: (value: number) => string;
};

export default function ComprasModule(props: ComprasModuleProps) {
  return (
    <section className="module-grid animated">
      <form className="form-card" onSubmit={props.submitPurchase}>
        <h3>Registrar compra</h3>
        <div className="form-field">
          <label>Fornecedor</label>
          <small className="field-help">De quem você está comprando (filtra os produtos vinculados).</small>
          <select
            value={props.purchaseForm.supplierId}
            onChange={(event) => {
              props.setPurchaseForm({
                ...props.purchaseForm,
                supplierId: event.target.value,
                productId: "",
              });
            }}
            required
          >
            <option value="">Selecione o fornecedor</option>
            {props.suppliers
              .filter((s) => s.status === "ATIVO")
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
          </select>
        </div>
        <div className="form-field">
          <label>Produto</label>
          <small className="field-help">Item que está entrando no estoque.</small>
          <select
            value={props.purchaseForm.productId}
            onChange={(event) =>
              props.setPurchaseForm({ ...props.purchaseForm, productId: event.target.value })
            }
            required
            disabled={!props.purchaseForm.supplierId}
          >
            <option value="">
              {props.purchaseForm.supplierId
                ? "Selecione o produto"
                : "Selecione primeiro o fornecedor"}
            </option>
            {props.filteredProductsBySupplier.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Quantidade</label>
          <small className="field-help">Unidades compradas (serão somadas ao estoque).</small>
          <input
            type="number"
            min={1}
            placeholder="ex.: 50"
            value={props.purchaseForm.quantity}
            onChange={(event) =>
              props.setPurchaseForm({
                ...props.purchaseForm,
                quantity: Number(event.target.value),
              })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>Custo unitário</label>
          <small className="field-help">Valor por unidade (R$).</small>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="ex.: 4,80"
            value={props.purchaseForm.cost}
            onChange={(event) =>
              props.setPurchaseForm({
                ...props.purchaseForm,
                cost: Number(event.target.value),
              })
            }
            required
          />
        </div>
        <button type="submit">Lançar compra</button>
      </form>

      <section className="table-card">
        <h3>Compras recentes</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Fornecedor</th>
              <th>Total</th>
              <th>Status</th>
              <th>Aprovação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.purchases.map((item) => (
              <tr key={item._id}>
                <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>{item.supplier}</td>
                <td>{props.formatBRL(item.totalAmount)}</td>
                <td>{item.status}</td>
                <td>{item.approval?.status || "-"}</td>
                <td>
                  <div className="table-actions">
                    {item.status === "AGUARDANDO_APROVACAO" ? (
                      <>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => props.reviewPurchase(item._id, "aprovar")}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          className="ghost-btn danger"
                          onClick={() => props.reviewPurchase(item._id, "rejeitar")}
                        >
                          Rejeitar
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="ghost-btn" onClick={() => props.editPurchase(item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-btn danger"
                      onClick={() => props.deletePurchase(item)}
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
  );
}

