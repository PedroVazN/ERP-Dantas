import type { Supplier } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type SupplierFormState = {
  name: string;
  document: string;
  contact: string;
  pixKey: string;
  city: string;
  businessArea: string;
  paymentCondition: "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO";
};

export type FornecedoresModuleProps = {
  submitSupplier: (event: FormEvent) => Promise<void> | void;
  supplierForm: SupplierFormState;
  setSupplierForm: Dispatch<SetStateAction<SupplierFormState>>;
  suppliers: Supplier[];
  editSupplier: (supplier: Supplier) => void;
  deleteSupplier: (supplier: Supplier) => void;
};

export default function FornecedoresModule(props: FornecedoresModuleProps) {
  return (
    <section className="module-grid animated">
      <form className="form-card" onSubmit={props.submitSupplier}>
        <h3>Novo fornecedor</h3>
        <div className="form-field">
          <label>Nome</label>
          <small className="field-help">Razão social ou nome do fornecedor.</small>
          <input
            placeholder="ex.: Fornecedor ABC"
            value={props.supplierForm.name}
            onChange={(event) =>
              props.setSupplierForm({ ...props.supplierForm, name: event.target.value })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>CNPJ/CPF</label>
          <small className="field-help">Opcional. Ajuda em emissão e controle fiscal.</small>
          <input
            placeholder="ex.: 12.345.678/0001-99"
            value={props.supplierForm.document}
            onChange={(event) =>
              props.setSupplierForm({ ...props.supplierForm, document: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Contato (telefone)</label>
          <small className="field-help">Telefone principal (usado para comunicação).</small>
          <input
            placeholder="ex.: (11) 98888-7777"
            value={props.supplierForm.contact}
            onChange={(event) =>
              props.setSupplierForm({ ...props.supplierForm, contact: event.target.value })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>Chave PIX</label>
          <small className="field-help">Opcional. Facilita pagamento via PIX.</small>
          <input
            placeholder="ex.: chave@pix.com"
            value={props.supplierForm.pixKey}
            onChange={(event) =>
              props.setSupplierForm({ ...props.supplierForm, pixKey: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Cidade</label>
          <small className="field-help">Opcional. Para logística e relatórios.</small>
          <input
            placeholder="ex.: São Paulo"
            value={props.supplierForm.city}
            onChange={(event) =>
              props.setSupplierForm({ ...props.supplierForm, city: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Ramo de atuação</label>
          <small className="field-help">Opcional. Ex.: embalagens, fragrâncias, insumos.</small>
          <input
            placeholder="ex.: Insumos"
            value={props.supplierForm.businessArea}
            onChange={(event) =>
              props.setSupplierForm({ ...props.supplierForm, businessArea: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Condição de pagamento</label>
          <small className="field-help">Forma mais comum de pagamento para este fornecedor.</small>
          <select
            value={props.supplierForm.paymentCondition}
            onChange={(event) =>
              props.setSupplierForm({
                ...props.supplierForm,
                paymentCondition: event.target.value as SupplierFormState["paymentCondition"],
              })
            }
          >
            <option value="BOLETO">Boleto</option>
            <option value="PIX">PIX</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="CREDITO">Crédito</option>
          </select>
        </div>
        <button type="submit">Cadastrar fornecedor</button>
      </form>

      <section className="table-card">
        <h3>Lista de fornecedores</h3>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ/CPF</th>
              <th>Contato</th>
              <th>Cidade</th>
              <th>Ramo</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.suppliers.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  Nenhum fornecedor cadastrado ainda.
                </td>
              </tr>
            ) : (
              props.suppliers.map((item) => (
                <tr key={item._id}>
                  <td>{item.name}</td>
                  <td>{item.document || "-"}</td>
                  <td>{item.contact}</td>
                  <td>{item.city || "-"}</td>
                  <td>{item.businessArea || "-"}</td>
                  <td>{item.paymentCondition}</td>
                  <td>{item.status}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="ghost-btn" onClick={() => props.editSupplier(item)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ghost-btn danger"
                        onClick={() => props.deleteSupplier(item)}
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

