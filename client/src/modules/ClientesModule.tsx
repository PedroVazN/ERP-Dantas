import type { Customer } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type CustomerFormState = {
  name: string;
  email: string;
  phone: string;
};

export type ClientesModuleProps = {
  customerForm: CustomerFormState;
  setCustomerForm: Dispatch<SetStateAction<CustomerFormState>>;
  submitCustomer: (event: FormEvent) => Promise<void> | void;
  customers: Customer[];
  editCustomer: (customer: Customer) => void;
  deleteCustomer: (customer: Customer) => void;
};

export default function ClientesModule(props: ClientesModuleProps) {
  return (
    <section className="module-grid animated">
      <form className="form-card" onSubmit={props.submitCustomer}>
        <h3>Novo cliente</h3>
        <div className="form-field">
          <label>Nome</label>
          <small className="field-help">Como o cliente será identificado no sistema.</small>
          <input
            placeholder="ex.: Maria Silva"
            value={props.customerForm.name}
            onChange={(event) =>
              props.setCustomerForm({ ...props.customerForm, name: event.target.value })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>E-mail</label>
          <small className="field-help">Opcional. Útil para envio de comprovantes e contato.</small>
          <input
            placeholder="ex.: maria@email.com"
            value={props.customerForm.email}
            onChange={(event) =>
              props.setCustomerForm({ ...props.customerForm, email: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Telefone</label>
          <small className="field-help">Opcional. Use DDD + número para contato/WhatsApp.</small>
          <input
            placeholder="ex.: (11) 99999-9999"
            value={props.customerForm.phone}
            onChange={(event) =>
              props.setCustomerForm({ ...props.customerForm, phone: event.target.value })
            }
          />
        </div>
        <button type="submit">Cadastrar</button>
      </form>

      <section className="table-card">
        <h3>Lista de clientes</h3>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.customers.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>{item.email || "-"}</td>
                <td>{item.phone || "-"}</td>
                <td>{item.status}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="ghost-btn" onClick={() => props.editCustomer(item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-btn danger"
                      onClick={() => props.deleteCustomer(item)}
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

