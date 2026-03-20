import type { Customer, Expense, ChecklistItem, Product, Purchase, Sale, Supplier } from "../../types";
import { api, API_URL } from "../../api";
import type { Dispatch, SetStateAction } from "react";
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

export type EditSaleFormState = {
  paymentMethod: string;
  status: string;
};

export type EditPurchaseFormState = {
  status: Purchase["status"];
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
                await api.patch<Sale>(props.scopedPath(`/sales/${props.editingId}`), {
                  paymentMethod: props.editSaleForm.paymentMethod,
                  status: props.editSaleForm.status,
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

      {props.editModalKind === "purchase" ? (
        <>
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
                await api.patch<Purchase>(props.scopedPath(`/purchases/${props.editingId}`), {
                  status: props.editPurchaseForm.status,
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

