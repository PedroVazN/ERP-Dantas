import type { FormEvent, Dispatch, SetStateAction } from "react";

import { api } from "../api";
import type {
  AuthUser,
  ChecklistItem,
  Customer,
  Expense,
  Product,
  Purchase,
  Sale,
  Supplier,
  Settings,
} from "../types";

import type { EditSaleFormState } from "../components/EditEntityModal/EditEntityModal";
import { saleCustomerLabel, saleCustomerId, saleItemProductId } from "../utils/saleCustomerLabel";

export type CrudEditModalKind = "customer" | "product" | "supplier" | "sale" | "purchase" | "expense" | "checklist";

type UserFormState = { userName: string; userEmail: string; userRole: string; companyName: string };

export type CrudModuleHandlers = ReturnType<typeof useCrudModuleHandlers>;

export function useCrudModuleHandlers(deps: {
  isGeneralWorkspace: boolean;
  scopedPath: (path: string) => string;
  loadAllData: () => Promise<void>;
  setError: (msg: string) => void;
  currentUser: AuthUser | null;
  formatBRL: (value: number) => string;
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];

  customerForm: { name: string; email: string; phone: string; notes: string };
  setCustomerForm: Dispatch<SetStateAction<{ name: string; email: string; phone: string; notes: string }>>;

  productForm: {
    name: string;
    sku: string;
    productCode: string;
    description: string;
    price: number;
    cost: number;
    stock: number;
    minStock: number;
    supplierId: string;
  };
  setProductForm: Dispatch<
    SetStateAction<{
      name: string;
      sku: string;
      productCode: string;
      description: string;
      price: number;
      cost: number;
      stock: number;
      minStock: number;
      supplierId: string;
    }>
  >;
  productPhotoFile: File | null;
  setProductPhotoFile: Dispatch<SetStateAction<File | null>>;

  saleForm: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerNote: string;
    items: Array<{ productId: string; quantity: number; unitPrice: number }>;
    paymentMethod: string;
  };
  setSaleForm: Dispatch<
    SetStateAction<{
      customerId: string;
      customerName: string;
      customerPhone: string;
      customerNote: string;
      items: Array<{ productId: string; quantity: number; unitPrice: number }>;
      paymentMethod: string;
    }>
  >;

  purchaseForm: {
    supplierId: string;
    productId: string;
    quantity: number;
    cost: number;
    extraExpenses: number;
    extraExpensesNote: string;
    items: Array<{ productId: string; description: string; quantity: number; cost: number }>;
  };
  setPurchaseForm: Dispatch<
    SetStateAction<{
      supplierId: string;
      productId: string;
      quantity: number;
      cost: number;
      extraExpenses: number;
      extraExpensesNote: string;
      items: Array<{ productId: string; description: string; quantity: number; cost: number }>;
    }>
  >;

  supplierForm: {
    name: string;
    document: string;
    contact: string;
    pixKey: string;
    city: string;
    businessArea: string;
    paymentCondition: Supplier["paymentCondition"];
  };
  setSupplierForm: Dispatch<
    SetStateAction<{
      name: string;
      document: string;
      contact: string;
      pixKey: string;
      city: string;
      businessArea: string;
      paymentCondition: Supplier["paymentCondition"];
    }>
  >;

  expenseForm: { description: string; category: string; amount: number; dueDate: string };
  setExpenseForm: Dispatch<SetStateAction<{ description: string; category: string; amount: number; dueDate: string }>>;

  checklistForm: { title: string; notes: string };
  setChecklistForm: Dispatch<SetStateAction<{ title: string; notes: string }>>;

  userForm: UserFormState;
  setSettings: Dispatch<SetStateAction<Settings | null>>;

  openEditModal: (kind: CrudEditModalKind, id: string, subtitle: string) => void;
  setEditCustomerForm: Dispatch<
    SetStateAction<{ name: string; email: string; phone: string; notes: string; status: "ATIVO" | "INATIVO" }>
  >;
  setEditProductForm: Dispatch<
    SetStateAction<{
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
    }>
  >;
  setEditProductHasPhoto: Dispatch<SetStateAction<boolean>>;
  setEditProductPhotoFile: Dispatch<SetStateAction<File | null>>;
  setEditSupplierForm: Dispatch<
    SetStateAction<{
      name: string;
      document: string;
      contact: string;
      pixKey: string;
      city: string;
      businessArea: string;
      paymentCondition: Supplier["paymentCondition"];
      status: "ATIVO" | "INATIVO";
    }>
  >;
  setEditSaleForm: Dispatch<SetStateAction<EditSaleFormState>>;
  setEditPurchaseForm: Dispatch<
    SetStateAction<{
      status: Purchase["status"];
      supplier: string;
      extraExpenses: number;
      extraExpensesNote: string;
      items: Array<{ productId: string; description: string; quantity: number; cost: number }>;
    }>
  >;
  setEditExpenseForm: Dispatch<
    SetStateAction<{
      description: string;
      category: string;
      amount: number;
      dueDate: string;
      status: Expense["status"];
    }>
  >;
  setEditChecklistForm: Dispatch<SetStateAction<{ title: string; notes: string }>>;
}) {
  const {
    isGeneralWorkspace,
    scopedPath,
    loadAllData,
    setError,
    currentUser,
    formatBRL,
    products,
    customers,
    suppliers,

    customerForm,
    setCustomerForm,
    productForm,
    setProductForm,
    productPhotoFile,
    setProductPhotoFile,
    saleForm,
    setSaleForm,
    purchaseForm,
    setPurchaseForm,
    supplierForm,
    setSupplierForm,
    expenseForm,
    setExpenseForm,
    checklistForm,
    setChecklistForm,

    openEditModal,
    setEditCustomerForm,
    setEditProductForm,
    setEditProductHasPhoto,
    setEditProductPhotoFile,
    setEditSupplierForm,
    setEditSaleForm,
    setEditPurchaseForm,
    setEditExpenseForm,
    setEditChecklistForm,
  } = deps;

  async function submitCustomer(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    await api.post<Customer>(scopedPath("/customers"), { ...customerForm, status: "ATIVO" });
    setCustomerForm({ name: "", email: "", phone: "", notes: "" });
    await loadAllData();
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }
    if (!productForm.supplierId) {
      setError("Selecione um fornecedor para o produto.");
      return;
    }
    const created = await api.post<Product>(scopedPath("/products"), {
      ...productForm,
      supplier: productForm.supplierId,
      category: "SABONETE",
      active: true,
    });
    if (productPhotoFile) {
      const formData = new FormData();
      formData.append("photo", productPhotoFile);
      await api.postFormData<{ ok: boolean; hasPhoto: boolean }>(
        scopedPath(`/products/${created._id}/photo`),
        formData
      );
    }
    setProductPhotoFile(null);
    setProductForm({
      name: "",
      sku: "",
      productCode: "",
      description: "",
      price: 0,
      cost: 0,
      stock: 0,
      minStock: 10,
      supplierId: "",
    });
    await loadAllData();
  }

  async function submitSale(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }

    try {
      setError("");
      if (!saleForm.items?.length) {
        setError("Adicione pelo menos um item na ordem de venda.");
        return;
      }

      // Valida estoque e normaliza preço unitário por item
      for (const item of saleForm.items) {
        const product = products.find((p) => p._id === item.productId);
        if (!product) {
          setError("Produto da venda não encontrado.");
          return;
        }
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          setError("Quantidade inválida em um item da venda.");
          return;
        }
        if (quantity > product.stock) {
          setError(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock} unidades.`);
          return;
        }
      }

      const normalizedPhone = saleForm.customerPhone.trim();
      const normalizedName = saleForm.customerName.trim();
      const normalizedNote = saleForm.customerNote.trim();
      let customerIdToUse = saleForm.customerId.trim();

      if (!customerIdToUse && (normalizedPhone || normalizedName)) {
        const phoneDigits = normalizedPhone.replace(/\D/g, "");
        const matchedByPhone = phoneDigits
          ? customers.find((c) => (c.phone || "").replace(/\D/g, "") === phoneDigits && c.status === "ATIVO")
          : undefined;
        if (matchedByPhone?._id) {
          customerIdToUse = matchedByPhone._id;
        } else {
          // Backend exige nome. Se o usuário só informou telefone, cria um nome derivado.
          const derivedName = normalizedName || (normalizedPhone ? `Cliente ${normalizedPhone}` : "");
          if (!derivedName) {
            setError("Informe telefone e/ou nome do cliente.");
            return;
          }
          const createdCustomer = await api.post<Customer>(scopedPath("/customers"), {
            name: derivedName,
            phone: normalizedPhone || undefined,
            notes: normalizedNote || undefined,
            status: "ATIVO",
          });
          customerIdToUse = createdCustomer._id;
        }
      }

      const normalizedItems = saleForm.items.map((item) => {
        const product = products.find((p) => p._id === item.productId)!;
        const quantity = Number(item.quantity);
        const unitPrice =
          Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) > 0 ? Number(item.unitPrice) : product.price;
        return {
          product: product._id,
          quantity,
          unitPrice,
        };
      });

      await api.post<Sale>(scopedPath("/sales"), {
        ...(customerIdToUse ? { customer: customerIdToUse } : {}),
        items: normalizedItems,
        paymentMethod: saleForm.paymentMethod,
        status: "PAGO",
        createdBy: "Admin",
      });
      setSaleForm({
        customerId: "",
        customerName: "",
        customerPhone: "",
        customerNote: "",
        items: [],
        paymentMethod: "PIX",
      });
      await loadAllData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao lançar venda.";
      setError(message);
    }
  }

  async function submitSupplier(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }

    await api.post<Supplier>(scopedPath("/suppliers"), {
      ...supplierForm,
      status: "ATIVO",
    });

    setSupplierForm({
      name: "",
      document: "",
      contact: "",
      pixKey: "",
      city: "",
      businessArea: "",
      paymentCondition: "PIX",
    });
    await loadAllData();
  }

  async function submitPurchase(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }

    const supplier = suppliers.find((item) => item._id === purchaseForm.supplierId);
    if (!supplier) {
      setError("Selecione um fornecedor cadastrado.");
      return;
    }

    if (!purchaseForm.items.length) {
      setError("Adicione pelo menos um produto na ordem de compra.");
      return;
    }

    await api.post<Purchase>(scopedPath("/purchases"), {
      supplier: supplier.name,
      extraExpenses: Number(purchaseForm.extraExpenses) || 0,
      extraExpensesNote: purchaseForm.extraExpensesNote.trim(),
      items: purchaseForm.items.map((item) => ({
        product: item.productId,
        description: item.description,
        quantity: Number(item.quantity),
        cost: Number(item.cost),
      })),
    });

    setPurchaseForm({
      supplierId: "",
      productId: "",
      quantity: 1,
      cost: 0,
      extraExpenses: 0,
      extraExpensesNote: "",
      items: [],
    });
    await loadAllData();
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Para lancar, selecione um ERP especifico.");
      return;
    }

    await api.post<Expense>(scopedPath("/expenses"), { ...expenseForm });
    setExpenseForm({
      description: "",
      category: "OPERACIONAL",
      amount: 0,
      dueDate: new Date().toISOString().slice(0, 10),
    });
    await loadAllData();
  }

  async function submitChecklistItem(event: FormEvent) {
    event.preventDefault();
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para cadastrar ideias.");
      return;
    }

    await api.post<ChecklistItem>(scopedPath("/checklist-items"), checklistForm);
    setChecklistForm({ title: "", notes: "" });
    await loadAllData();
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar checklist.");
      return;
    }
    await api.patch<ChecklistItem>(scopedPath(`/checklist-items/${item._id}`), {
      completed: !item.completed,
    });
    await loadAllData();
  }

  function editChecklistItem(item: ChecklistItem) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar checklist.");
      return;
    }
    setEditChecklistForm({ title: item.title, notes: item.notes || "" });
    openEditModal("checklist", item._id, `Editar: ${item.title}`);
  }

  async function deleteChecklistItem(item: ChecklistItem) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar checklist.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir a ideia "${item.title}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/checklist-items/${item._id}`));
    await loadAllData();
  }

  function editCustomer(item: Customer) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar clientes.");
      return;
    }
    setEditCustomerForm({
      name: item.name,
      email: item.email || "",
      phone: item.phone || "",
      notes: item.notes || "",
      status: item.status,
    });
    openEditModal("customer", item._id, `Editar: ${item.name}`);
  }

  async function deleteCustomer(item: Customer) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar clientes.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/inativar o cliente "${item.name}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/customers/${item._id}`));
    await loadAllData();
  }

  function editProduct(item: Product) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar produtos.");
      return;
    }
    setEditProductHasPhoto(Boolean(item.hasPhoto));
    setEditProductPhotoFile(null);

    const supplierId = typeof item.supplier === "string" ? item.supplier : item.supplier?._id || "";

    setEditProductForm({
      name: item.name,
      sku: item.sku,
      productCode: item.productCode || "",
      description: item.description || "",
      price: item.price,
      cost: item.cost,
      stock: item.stock,
      minStock: item.minStock,
      supplierId,
      active: item.active,
    });

    openEditModal("product", item._id, `Editar: ${item.name}`);
  }

  async function deleteProduct(item: Product) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar produtos.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/inativar o produto "${item.name}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/products/${item._id}`));
    await loadAllData();
  }

  function editSupplier(item: Supplier) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar fornecedores.");
      return;
    }

    setEditSupplierForm({
      name: item.name,
      document: item.document || "",
      contact: item.contact,
      pixKey: item.pixKey || "",
      city: item.city || "",
      businessArea: item.businessArea || "",
      paymentCondition: item.paymentCondition,
      status: item.status,
    });
    openEditModal("supplier", item._id, `Editar: ${item.name}`);
  }

  async function deleteSupplier(item: Supplier) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar fornecedores.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/inativar o fornecedor "${item.name}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/suppliers/${item._id}`));
    await loadAllData();
  }

  function editSale(item: Sale) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar vendas.");
      return;
    }
    const itemLines =
      item.items && item.items.length
        ? item.items.map((it) => ({
            productId: saleItemProductId(it),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          }))
        : [{ productId: "", quantity: 1, unitPrice: 0 }];
    setEditSaleForm({
      paymentMethod: item.paymentMethod || "PIX",
      status: item.status || "PAGO",
      customerId: saleCustomerId(item),
      customerDisplay: saleCustomerLabel(item),
      items: itemLines,
    });
    openEditModal("sale", item._id, `Editar venda: ${formatBRL(item.totalAmount)}`);
  }

  async function deleteSale(item: Sale) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar vendas.");
      return;
    }
    const confirmDelete = window.confirm(
      `Deseja cancelar/excluir a venda de ${formatBRL(item.totalAmount)}? (O estoque será estornado)`
    );
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/sales/${item._id}`));
    await loadAllData();
  }

  function editPurchase(item: Purchase) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar compras.");
      return;
    }
    const rawItems = (item as any).items as
      | Array<{ product?: string | { _id: string }; description: string; quantity: number; cost: number }>
      | undefined;
    const lines =
      rawItems && rawItems.length
        ? rawItems.map((it) => ({
            productId:
              typeof it.product === "string"
                ? it.product
                : it.product && typeof it.product === "object" && "_id" in it.product
                  ? String((it.product as { _id: string })._id)
                  : "",
            description: it.description,
            quantity: it.quantity,
            cost: it.cost,
          }))
        : [{ productId: "", description: "", quantity: 1, cost: 0 }];

    setEditPurchaseForm({
      status: item.status,
      supplier: item.supplier,
      extraExpenses: typeof item.extraExpenses === "number" ? item.extraExpenses : 0,
      extraExpensesNote: item.extraExpensesNote || "",
      items: lines,
    });
    openEditModal("purchase", item._id, `Editar compra: ${formatBRL(item.totalAmount)}`);
  }

  async function deletePurchase(item: Purchase) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar compras.");
      return;
    }
    const confirmDelete = window.confirm(
      `Deseja cancelar/excluir a compra de ${formatBRL(item.totalAmount)}? (Se já entrou no estoque, será estornado)`
    );
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/purchases/${item._id}`));
    await loadAllData();
  }

  function editExpense(item: Expense) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar despesas.");
      return;
    }
    setEditExpenseForm({
      description: item.description,
      category: item.category,
      amount: item.amount,
      dueDate: item.dueDate.slice(0, 10),
      status: item.status,
    });
    openEditModal("expense", item._id, `Editar despesa: ${item.description}`);
  }

  async function deleteExpense(item: Expense) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar despesas.");
      return;
    }
    const confirmDelete = window.confirm(`Deseja excluir/rejeitar a despesa "${item.description}"?`);
    if (!confirmDelete) return;
    await api.delete<{ deleted: boolean }>(scopedPath(`/expenses/${item._id}`));
    await loadAllData();
  }

  async function submitUserProfile(event: FormEvent) {
    event.preventDefault();
    const updated = await api.put<Settings>("/settings/profile", deps.userForm);
    deps.setSettings(updated);
  }

  async function reviewPurchase(purchaseId: string, action: "aprovar" | "rejeitar") {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para aprovar.");
      return;
    }
    await api.patch<Purchase>(scopedPath(`/approvals/purchases/${purchaseId}`), {
      action,
      reviewedBy: currentUser?.name || "Gestor",
    });
    await loadAllData();
  }

  async function markPurchaseReceived(purchaseId: string) {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico.");
      return;
    }
    await api.patch<Purchase>(scopedPath(`/purchases/${purchaseId}`), { status: "RECEBIDA" });
    await loadAllData();
  }

  async function reviewExpense(expenseId: string, action: "aprovar" | "rejeitar" | "pagar") {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para aprovar.");
      return;
    }
    await api.patch<Expense>(scopedPath(`/approvals/expenses/${expenseId}`), {
      action,
      reviewedBy: currentUser?.name || "Gestor",
    });
    await loadAllData();
  }

  async function updateExpensePaymentStatus(expenseId: string, status: "PAGO" | "PENDENTE") {
    if (isGeneralWorkspace) {
      setError("No ERP Geral voce visualiza consolidado. Selecione um ERP especifico para editar despesas.");
      return;
    }
    await api.patch<Expense>(scopedPath(`/expenses/${expenseId}`), { status });
    await loadAllData();
  }

  return {
    submitCustomer,
    submitProduct,
    submitSale,
    submitSupplier,
    submitPurchase,
    submitExpense,
    submitChecklistItem,
    toggleChecklistItem,
    editChecklistItem,
    deleteChecklistItem,
    editCustomer,
    deleteCustomer,
    editProduct,
    deleteProduct,
    editSupplier,
    deleteSupplier,
    editSale,
    deleteSale,
    editPurchase,
    deletePurchase,
    editExpense,
    deleteExpense,
    submitUserProfile,
    reviewPurchase,
    markPurchaseReceived,
    reviewExpense,
    updateExpensePaymentStatus,
  };
}

