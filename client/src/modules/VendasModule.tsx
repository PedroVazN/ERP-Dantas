import type { Product, Sale } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type SaleFormState = {
  productId: string;
  quantity: number;
  paymentMethod: string;
};

export type VendasModuleProps = {
  submitSale: (event: FormEvent) => Promise<void> | void;
  saleForm: SaleFormState;
  setSaleForm: Dispatch<SetStateAction<SaleFormState>>;
  products: Product[];
  sales: Sale[];
  editSale: (sale: Sale) => void;
  deleteSale: (sale: Sale) => void;
  pixModalOpen: boolean;
  setPixModalOpen: Dispatch<SetStateAction<boolean>>;
  formatBRL: (value: number) => string;
};

export default function VendasModule(props: VendasModuleProps) {
  return (
    <section className="module-grid animated">
      <form className="form-card" onSubmit={props.submitSale}>
        <h3>Registrar venda</h3>
        <div className="form-field">
          <label>Produto</label>
          <small className="field-help">Selecione o item vendido (mostra estoque atual).</small>
          <select
            value={props.saleForm.productId}
            onChange={(event) =>
              props.setSaleForm({ ...props.saleForm, productId: event.target.value })
            }
            required
          >
            <option value="">Selecione o produto</option>
            {props.products.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} ({item.stock} un.)
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Quantidade</label>
          <small className="field-help">Unidades vendidas (não pode exceder o estoque).</small>
          <input
            type="number"
            min={1}
            placeholder="ex.: 2"
            value={props.saleForm.quantity}
            onChange={(event) =>
              props.setSaleForm({ ...props.saleForm, quantity: Number(event.target.value) })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>Forma de pagamento</label>
          <small className="field-help">Como o cliente pagou (PIX, dinheiro, cartão, boleto).</small>
          <select
            value={props.saleForm.paymentMethod}
            onChange={(event) =>
              props.setSaleForm({ ...props.saleForm, paymentMethod: event.target.value })
            }
          >
            <option value="PIX">PIX</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="CARTAO">Cartão</option>
            <option value="BOLETO">Boleto</option>
          </select>
        </div>
        <button type="submit">Lançar venda</button>
        <button type="button" className="ghost-btn" onClick={() => props.setPixModalOpen(true)}>
          Abrir PIX
        </button>
      </form>

      <section className="table-card">
        <h3>Vendas recentes</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Total</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th>Faturamento</th>
              <th>NF-e</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.sales.map((item) => (
              <tr key={item._id}>
                <td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>{props.formatBRL(item.totalAmount)}</td>
                <td>{item.paymentMethod}</td>
                <td>{item.status}</td>
                <td>{item.billingStatus || "-"}</td>
                <td>{item.invoice?.number || "Gerando..."}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="ghost-btn" onClick={() => props.editSale(item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-btn danger"
                      onClick={() => props.deleteSale(item)}
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

      {props.pixModalOpen ? (
        <div className="pix-modal-overlay" onClick={() => props.setPixModalOpen(false)}>
          <div className="pix-modal" onClick={(event) => event.stopPropagation()}>
            <div className="pix-modal-header">
              <h3>Pagamento via PIX</h3>
              <button type="button" className="ghost-btn" onClick={() => props.setPixModalOpen(false)}>
                Fechar
              </button>
            </div>
            <img src="/pix.jpg" alt="QR Code PIX" className="pix-modal-image" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

