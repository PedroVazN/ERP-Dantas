import type { Customer, Expense, ChecklistItem, Product, Purchase, Sale, Supplier } from "../../types";
import { api, API_URL } from "../../api";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import AppModal from "../AppModal";

export type EditModalKind =
  | "customer"
  | "product"
  | "supplier"
  | "sale"
  | "purchase"
  | "expense"
  | "checklist";

export type EditCustomerFormState = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  status: "ATIVO" | "INATIVO";
};

export type EditProductFormState = {
  name: string;
  sku: string;
  productCode: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  supplierId: string;
  active: boolean;
};

export type EditSupplierFormState = {
  name: string;
  document: string;
  contact: string;
  pixKey: string;
  city: string;
  businessArea: string;
  paymentCondition: "BOLETO" | "PIX" | "DINHEIRO" | "CREDITO";
  status: "ATIVO" | "INATIVO";
};

export type EditSaleItemLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type EditSaleFormState = {
  paymentMethod: string;
  status: string;
  customerId: string;
  /** Exibição auxiliar (nome + contato) */
  customerDisplay: string;
  items: EditSaleItemLine[];
};

export type EditPurchaseFormState = {
  status: Purchase["status"];
  supplier: string;
  items: Array<{
    productId: string;
    description: string;
    quantity: number;
    cost: number;
  }>;
};

export type EditExpenseFormState = {
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: Expense["status"];
};

export type EditChecklistFormState = {
  title: string;
  notes: string;
};

export type EditEntityModalProps = {
  editModalKind: EditModalKind;
  editingId: string;
  editModalSubtitle: string;
  closeEditModal: () => void;

  isGeneralWorkspace: boolean;
  scopedPath: (path: string) => string;
  setError: (message: string) => void;
  loadAllData: () => Promise<void>;

  suppliers: Supplier[];
  products: Product[];
  customers: Customer[];
  formatBRL: (value: number) => string;

  editCustomerForm: EditCustomerFormState;
  setEditCustomerForm: Dispatch<SetStateAction<EditCustomerFormState>>;

  editProductForm: EditProductFormState;
  setEditProductForm: Dispatch<SetStateAction<EditProductFormState>>;
  editProductHasPhoto: boolean;
  setEditProductPhotoFile: Dispatch<SetStateAction<File | null>>;
  editProductPhotoFile: File | null;

  editSupplierForm: EditSupplierFormState;
  setEditSupplierForm: Dispatch<SetStateAction<EditSupplierFormState>>;

  editSaleForm: EditSaleFormState;
  setEditSaleForm: Dispatch<SetStateAction<EditSaleFormState>>;

  editPurchaseForm: EditPurchaseFormState;
  setEditPurchaseForm: Dispatch<SetStateAction<EditPurchaseFormState>>;

  editExpenseForm: EditExpenseFormState;
  setEditExpenseForm: Dispatch<SetStateAction<EditExpenseFormState>>;

  editChecklistForm: EditChecklistFormState;
  setEditChecklistForm: Dispatch<SetStateAction<EditChecklistFormState>>;
};

export default function EditEntityModal(props: EditEntityModalProps) {
  const activeCustomersForSale = useMemo(
    () => props.customers.filter((c) => c.status === "ATIVO"),
    [props.customers]
  );

  const title =
    props.editModalKind === "customer"
      ? "Editar cliente"
      : props.editModalKind === "product"
        ? "Editar produto"
        : props.editModalKind === "supplier"
          ? "Editar fornecedor"
          : props.editModalKind === "sale"
            ? "Editar venda"
            : props.editModalKind === "purchase"
              ? "Editar compra"
              : props.editModalKind === "expense"
                ? "Editar despesa"
                : "Editar item";

  return (
    <AppModal title={title} subtitle={props.editModalSubtitle} onClose={props.closeEditModal}>
      {props.editModalKind === "customer" ? (
        <>
          <div className="form-field">
            <label>Nome</label>
            <input
              value={props.editCustomerForm.name}
              onChange={(event) =>
                props.setEditCustomerForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>E-mail</label>
            <input
              value={props.editCustomerForm.email}
              onChange={(event) =>
                props.setEditCustomerForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label>Telefone</label>
            <input
              value={props.editCustomerForm.phone}
              onChange={(event) =>
                props.setEditCustomerForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label>Observação</label>
            <input
              value={props.editCustomerForm.notes}
              onChange={(event) =>
                props.setEditCustomerForm((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select
              value={props.editCustomerForm.status}
              onChange={(event) =>
                props.setEditCustomerForm((prev) => ({
                  ...prev,
                  status: event.target.value === "INATIVO" ? "INATIVO" : "ATIVO",
                }))
              }
            >
              <option value="ATIVO">ATIVO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (!props.editCustomerForm.name.trim()) {
                  props.setError("O nome do cliente não pode ficar vazio.");
                  return;
                }
                await api.patch<Customer>(props.scopedPath(`/customers/${props.editingId}`), {
                  name: props.editCustomerForm.name.trim(),
                  email: props.editCustomerForm.email.trim(),
                  phone: props.editCustomerForm.phone.trim(),
                  notes: props.editCustomerForm.notes.trim(),
                  status: props.editCustomerForm.status,
                });
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}

      {props.editModalKind === "product" ? (
        <>
          <div className="form-field">
            <label>Nome</label>
            <input
              value={props.editProductForm.name}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>SKU</label>
            <input
              value={props.editProductForm.sku}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({ ...prev, sku: event.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Código</label>
            <input
              value={props.editProductForm.productCode}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  productCode: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field">
            <label>Descrição</label>
            <textarea
              rows={3}
              value={props.editProductForm.description}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field">
            <label>Fornecedor</label>
            <select
              value={props.editProductForm.supplierId}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  supplierId: event.target.value,
                }))
              }
              required
            >
              <option value="">Selecione</option>
              {props.suppliers
                .filter((s) => s.status === "ATIVO")
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="form-field">
            <label>Preço</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={props.editProductForm.price}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  price: Number(event.target.value),
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Custo</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={props.editProductForm.cost}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  cost: Number(event.target.value),
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Estoque</label>
            <input
              type="number"
              min={0}
              value={props.editProductForm.stock}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  stock: Number(event.target.value),
                }))
              }
            />
          </div>
          <div className="form-field">
            <label>Estoque mínimo</label>
            <input
              type="number"
              min={0}
              value={props.editProductForm.minStock}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  minStock: Number(event.target.value),
                }))
              }
            />
          </div>
          <div className="form-field">
            <label>Ativo</label>
            <select
              value={props.editProductForm.active ? "true" : "false"}
              onChange={(event) =>
                props.setEditProductForm((prev) => ({
                  ...prev,
                  active: event.target.value === "true",
                }))
              }
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
          <div className="form-field">
            <label>Foto do produto</label>
            <small className="field-help">Opcional. Para trocar a foto, selecione uma nova imagem.</small>
            {props.editProductHasPhoto ? (
              <img
                className="product-photo-preview"
                src={`${API_URL}${props.scopedPath(`/products/${props.editingId}/photo`)}`}
                alt={`Foto de ${props.editProductForm.name || "produto"}`}
              />
            ) : (
              <span className="field-help">Sem foto cadastrada.</span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                props.setEditProductPhotoFile(file);
              }}
            />
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (
                  !props.editProductForm.name.trim() ||
                  !props.editProductForm.sku.trim() ||
                  !props.editProductForm.supplierId
                ) {
                  props.setError("Preencha nome, SKU e fornecedor.");
                  return;
                }
                await api.patch<Product>(props.scopedPath(`/products/${props.editingId}`), {
                  name: props.editProductForm.name.trim(),
                  sku: props.editProductForm.sku.trim(),
                  productCode: props.editProductForm.productCode.trim(),
                  description: props.editProductForm.description.trim(),
                  price: props.editProductForm.price,
                  cost: props.editProductForm.cost,
                  stock: props.editProductForm.stock,
                  minStock: props.editProductForm.minStock,
                  supplier: props.editProductForm.supplierId,
                  active: props.editProductForm.active,
                });
                if (props.editProductPhotoFile) {
                  const formData = new FormData();
                  formData.append("photo", props.editProductPhotoFile);
                  await api.postFormData<{ ok: boolean; hasPhoto: boolean }>(
                    props.scopedPath(`/products/${props.editingId}/photo`),
                    formData
                  );
                }
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}

      {props.editModalKind === "supplier" ? (
        <>
          <div className="form-field">
            <label>Nome</label>
            <input
              value={props.editSupplierForm.name}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>CNPJ/CPF</label>
            <input
              value={props.editSupplierForm.document}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({ ...prev, document: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label>Contato</label>
            <input
              value={props.editSupplierForm.contact}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({ ...prev, contact: event.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Chave PIX</label>
            <input
              value={props.editSupplierForm.pixKey}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({ ...prev, pixKey: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label>Cidade</label>
            <input
              value={props.editSupplierForm.city}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({ ...prev, city: event.target.value }))
              }
            />
          </div>
          <div className="form-field">
            <label>Ramo</label>
            <input
              value={props.editSupplierForm.businessArea}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({
                  ...prev,
                  businessArea: event.target.value,
                }))
              }
            />
          </div>
          <div className="form-field">
            <label>Pagamento</label>
            <select
              value={props.editSupplierForm.paymentCondition}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({
                  ...prev,
                  paymentCondition: event.target.value as Supplier["paymentCondition"],
                }))
              }
            >
              <option value="BOLETO">BOLETO</option>
              <option value="PIX">PIX</option>
              <option value="DINHEIRO">DINHEIRO</option>
              <option value="CREDITO">CREDITO</option>
            </select>
          </div>
          <div className="form-field">
            <label>Status</label>
            <select
              value={props.editSupplierForm.status}
              onChange={(event) =>
                props.setEditSupplierForm((prev) => ({
                  ...prev,
                  status: event.target.value === "INATIVO" ? "INATIVO" : "ATIVO",
                }))
              }
            >
              <option value="ATIVO">ATIVO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (
                  !props.editSupplierForm.name.trim() ||
                  !props.editSupplierForm.contact.trim()
                ) {
                  props.setError("Preencha nome e contato.");
                  return;
                }
                await api.patch<Supplier>(props.scopedPath(`/suppliers/${props.editingId}`), {
                  name: props.editSupplierForm.name.trim(),
                  document: props.editSupplierForm.document.trim(),
                  contact: props.editSupplierForm.contact.trim(),
                  pixKey: props.editSupplierForm.pixKey.trim(),
                  city: props.editSupplierForm.city.trim(),
                  businessArea: props.editSupplierForm.businessArea.trim(),
                  paymentCondition: props.editSupplierForm.paymentCondition,
                  status: props.editSupplierForm.status,
                });
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}

      {props.editModalKind === "sale" ? (
        <>
          <div className="form-field">
            <label>Cliente (cotação / ordem)</label>
            <select
              value={props.editSaleForm.customerId}
              onChange={(event) =>
                props.setEditSaleForm((prev) => ({ ...prev, customerId: event.target.value }))
              }
            >
              <option value="">Sem cliente vinculado</option>
              {activeCustomersForSale.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
            <small className="field-help">
              Referência anterior: {props.editSaleForm.customerDisplay || "—"}
            </small>
          </div>

          <div className="table-scroll" style={{ marginBottom: 12 }}>
            <table className="order-items-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Estoque</th>
                  <th>Preço (R$)</th>
                  <th>Qtd.</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {props.editSaleForm.items.map((line, index) => {
                  const product = props.products.find((p) => p._id === line.productId);
                  const lineTotal = line.quantity * line.unitPrice;
                  return (
                    <tr key={`${line.productId}-${index}`}>
                      <td>
                        <select
                          value={line.productId}
                          onChange={(event) => {
                            const productId = event.target.value;
                            const p = props.products.find((x) => x._id === productId);
                            props.setEditSaleForm((prev) => {
                              const next = [...prev.items];
                              next[index] = {
                                ...next[index],
                                productId,
                                unitPrice: p ? p.price : next[index].unitPrice,
                              };
                              return { ...prev, items: next };
                            });
                          }}
                        >
                          <option value="">Selecione…</option>
                          {props.products.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{product ? product.stock : "—"}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice || ""}
                          onChange={(event) => {
                            const v = Number(event.target.value);
                            props.setEditSaleForm((prev) => {
                              const next = [...prev.items];
                              next[index] = { ...next[index], unitPrice: Number.isFinite(v) ? v : 0 };
                              return { ...prev, items: next };
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity || ""}
                          onChange={(event) => {
                            const v = parseInt(event.target.value, 10);
                            props.setEditSaleForm((prev) => {
                              const next = [...prev.items];
                              next[index] = {
                                ...next[index],
                                quantity: Number.isFinite(v) && v >= 1 ? v : 1,
                              };
                              return { ...prev, items: next };
                            });
                          }}
                        />
                      </td>
                      <td>{props.formatBRL(lineTotal)}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-btn danger"
                          disabled={props.editSaleForm.items.length <= 1}
                          onClick={() =>
                            props.setEditSaleForm((prev) => ({
                              ...prev,
                              items: prev.items.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              className="ghost-btn"
              style={{ marginTop: 8 }}
              onClick={() =>
                props.setEditSaleForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { productId: "", quantity: 1, unitPrice: 0 }],
                }))
              }
            >
              Adicionar linha
            </button>
            <p style={{ marginTop: 8, fontWeight: 600 }}>
              Total da proposta:{" "}
              {props.formatBRL(
                props.editSaleForm.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
              )}
            </p>
          </div>

          <div className="form-field">
            <label>Forma de pagamento</label>
            <select
              value={props.editSaleForm.paymentMethod}
              onChange={(event) =>
                props.setEditSaleForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
              }
            >
              <option value="PIX">PIX</option>
              <option value="DINHEIRO">DINHEIRO</option>
              <option value="CARTAO">CARTAO</option>
              <option value="BOLETO">BOLETO</option>
              <option value="TRANSFERENCIA">TRANSFERENCIA</option>
            </select>
          </div>
          <div className="form-field">
            <label>Status</label>
            <select
              value={props.editSaleForm.status}
              onChange={(event) =>
                props.setEditSaleForm((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <option value="PAGO">PAGO</option>
              <option value="PENDENTE">PENDENTE</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (props.editSaleForm.status === "CANCELADO") {
                  await api.patch<Sale>(props.scopedPath(`/sales/${props.editingId}`), {
                    paymentMethod: props.editSaleForm.paymentMethod,
                    status: "CANCELADO",
                  });
                } else {
                  const lines = props.editSaleForm.items.filter(
                    (it) => it.productId && it.quantity >= 1 && it.unitPrice >= 0
                  );
                  if (!lines.length) {
                    props.setError("Informe ao menos um produto com quantidade e preço válidos.");
                    return;
                  }
                  await api.patch<Sale>(props.scopedPath(`/sales/${props.editingId}`), {
                    paymentMethod: props.editSaleForm.paymentMethod,
                    status: props.editSaleForm.status,
                    customer: props.editSaleForm.customerId || null,
                    items: lines.map((it) => ({
                      product: it.productId,
                      quantity: it.quantity,
                      unitPrice: it.unitPrice,
                    })),
                  });
                }
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}

      {props.editModalKind === "purchase" ? (
        <>
          <div className="form-field">
            <label>Fornecedor</label>
            <select
              value={props.editPurchaseForm.supplier}
              onChange={(event) =>
                props.setEditPurchaseForm((prev) => ({
                  ...prev,
                  supplier: event.target.value,
                }))
              }
            >
              <option value="">Selecione o fornecedor</option>
              {props.suppliers.map((s) => (
                <option key={s._id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="table-scroll" style={{ marginBottom: 12 }}>
            <table className="order-items-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Descrição</th>
                  <th>Quantidade</th>
                  <th>Custo (R$)</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {props.editPurchaseForm.items.map((line, index) => {
                  const lineTotal = line.quantity * line.cost;
                  return (
                    <tr key={`${line.productId}-${index}`}>
                      <td>
                        <select
                          value={line.productId}
                          onChange={(event) => {
                            const productId = event.target.value;
                            const p = props.products.find((x) => x._id === productId);
                            props.setEditPurchaseForm((prev) => {
                              const next = [...prev.items];
                              next[index] = {
                                ...next[index],
                                productId,
                                description: p ? p.name : next[index].description,
                              };
                              return { ...prev, items: next };
                            });
                          }}
                        >
                          <option value="">Sem vínculo</option>
                          {props.products.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(event) => {
                            const v = event.target.value;
                            props.setEditPurchaseForm((prev) => {
                              const next = [...prev.items];
                              next[index] = { ...next[index], description: v };
                              return { ...prev, items: next };
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity || ""}
                          onChange={(event) => {
                            const v = parseInt(event.target.value, 10);
                            props.setEditPurchaseForm((prev) => {
                              const next = [...prev.items];
                              next[index] = {
                                ...next[index],
                                quantity: Number.isFinite(v) && v >= 1 ? v : 1,
                              };
                              return { ...prev, items: next };
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.cost || ""}
                          onChange={(event) => {
                            const v = Number(event.target.value);
                            props.setEditPurchaseForm((prev) => {
                              const next = [...prev.items];
                              next[index] = { ...next[index], cost: Number.isFinite(v) ? v : 0 };
                              return { ...prev, items: next };
                            });
                          }}
                        />
                      </td>
                      <td>{props.formatBRL(lineTotal)}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-btn danger"
                          disabled={props.editPurchaseForm.items.length <= 1}
                          onClick={() =>
                            props.setEditPurchaseForm((prev) => ({
                              ...prev,
                              items: prev.items.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              className="ghost-btn"
              style={{ marginTop: 8 }}
              onClick={() =>
                props.setEditPurchaseForm((prev) => ({
                  ...prev,
                  items: [
                    ...prev.items,
                    { productId: "", description: "", quantity: 1, cost: 0 },
                  ],
                }))
              }
            >
              Adicionar linha
            </button>
            <p style={{ marginTop: 8, fontWeight: 600 }}>
              Total do pedido:{" "}
              {props.formatBRL(
                props.editPurchaseForm.items.reduce(
                  (sum, it) => sum + it.quantity * it.cost,
                  0
                )
              )}
            </p>
          </div>

          <div className="form-field">
            <label>Status</label>
            <select
              value={props.editPurchaseForm.status}
              onChange={(event) =>
                props.setEditPurchaseForm((prev) => ({
                  ...prev,
                  status: event.target.value as Purchase["status"],
                }))
              }
            >
              <option value="ABERTA">ABERTA</option>
              <option value="AGUARDANDO_APROVACAO">AGUARDANDO_APROVACAO</option>
              <option value="APROVADA">APROVADA</option>
              <option value="RECEBIDA">RECEBIDA</option>
              <option value="REJEITADA">REJEITADA</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (props.editPurchaseForm.status === "CANCELADA") {
                  await api.patch<Purchase>(props.scopedPath(`/purchases/${props.editingId}`), {
                    status: "CANCELADA",
                  });
                } else {
                  const lines = props.editPurchaseForm.items.filter(
                    (it) => it.description.trim() && it.quantity > 0 && it.cost >= 0
                  );
                  if (!props.editPurchaseForm.supplier || !lines.length) {
                    props.setError(
                      "Informe fornecedor e pelo menos um item com quantidade e custo válidos."
                    );
                    return;
                  }
                  await api.patch<Purchase>(props.scopedPath(`/purchases/${props.editingId}`), {
                    status: props.editPurchaseForm.status,
                    supplier: props.editPurchaseForm.supplier,
                    items: lines.map((it) => ({
                      product: it.productId || undefined,
                      description: it.description,
                      quantity: it.quantity,
                      cost: it.cost,
                    })),
                  });
                }
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}

      {props.editModalKind === "expense" ? (
        <>
          <div className="form-field">
            <label>Descrição</label>
            <input
              value={props.editExpenseForm.description}
              onChange={(event) =>
                props.setEditExpenseForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Categoria</label>
            <input
              value={props.editExpenseForm.category}
              onChange={(event) =>
                props.setEditExpenseForm((prev) => ({
                  ...prev,
                  category: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Valor</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={props.editExpenseForm.amount}
              onChange={(event) =>
                props.setEditExpenseForm((prev) => ({
                  ...prev,
                  amount: Number(event.target.value),
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Vencimento</label>
            <input
              type="date"
              value={props.editExpenseForm.dueDate}
              onChange={(event) =>
                props.setEditExpenseForm((prev) => ({
                  ...prev,
                  dueDate: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select
              value={props.editExpenseForm.status}
              onChange={(event) =>
                props.setEditExpenseForm((prev) => ({
                  ...prev,
                  status: event.target.value as Expense["status"],
                }))
              }
            >
              <option value="PENDENTE">PENDENTE</option>
              <option value="PAGO">PAGO</option>
              <option value="AGUARDANDO_APROVACAO">AGUARDANDO_APROVACAO</option>
              <option value="REJEITADO">REJEITADO</option>
            </select>
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (!props.editExpenseForm.description.trim()) {
                  props.setError("A descrição não pode ficar vazia.");
                  return;
                }
                await api.patch<Expense>(props.scopedPath(`/expenses/${props.editingId}`), {
                  description: props.editExpenseForm.description.trim(),
                  category: props.editExpenseForm.category.trim(),
                  amount: props.editExpenseForm.amount,
                  dueDate: props.editExpenseForm.dueDate,
                  status: props.editExpenseForm.status,
                });
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}

      {props.editModalKind === "checklist" ? (
        <>
          <div className="form-field">
            <label>Título</label>
            <input
              value={props.editChecklistForm.title}
              onChange={(event) =>
                props.setEditChecklistForm((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Detalhes</label>
            <textarea
              rows={4}
              value={props.editChecklistForm.notes}
              onChange={(event) =>
                props.setEditChecklistForm((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
            />
          </div>
          <div className="app-modal-footer">
            <button type="button" className="ghost-btn" onClick={props.closeEditModal}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (props.isGeneralWorkspace) {
                  props.setError(
                    "No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar."
                  );
                  return;
                }
                if (!props.editChecklistForm.title.trim()) {
                  props.setError("O título da ideia não pode ficar vazio.");
                  return;
                }
                await api.patch<ChecklistItem>(
                  props.scopedPath(`/checklist-items/${props.editingId}`),
                  {
                    title: props.editChecklistForm.title.trim(),
                    notes: props.editChecklistForm.notes.trim(),
                  }
                );
                props.closeEditModal();
                await props.loadAllData();
              }}
            >
              Salvar alterações
            </button>
          </div>
        </>
      ) : null}
    </AppModal>
  );
}

