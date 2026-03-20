import type { FormEvent, Dispatch, SetStateAction } from "react";
import type { ChecklistItem, Customer, EconomicIndicators, Expense, Product, Purchase, Sale, Supplier, Theme } from "../../types";
import type { AiPlan } from "../../aiTypes";

import ClientesModule from "../../modules/ClientesModule";
import ProdutosModule from "../../modules/ProdutosModule";
import VendasModule from "../../modules/VendasModule";
import ComprasModule from "../../modules/ComprasModule";
import FornecedoresModule from "../../modules/FornecedoresModule";
import FinanceiroModule from "../../modules/FinanceiroModule";
import ChecklistModule from "../../modules/ChecklistModule";
import IaModule from "../../modules/IaModule";
import UsuarioModule from "../../modules/UsuarioModule";

export type ActiveModuleRendererProps = {
  loading: boolean;
  activeModule: "dashboard" | "clientes" | "produtos" | "vendas" | "compras" | "fornecedores" | "financeiro" | "checklist" | "ia" | "usuario";

  // Clientes
  customerForm: { name: string; email: string; phone: string };
  setCustomerForm: Dispatch<SetStateAction<{ name: string; email: string; phone: string }>>;
  submitCustomer: (event: FormEvent) => Promise<void> | void;
  customers: Customer[];
  editCustomer: (customer: Customer) => void;
  deleteCustomer: (customer: Customer) => void;

  // Produtos
  scopedPath: (path: string) => string;
  formatBRL: (value: number) => string;
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
  setProductForm: Dispatch<SetStateAction<{
    name: string;
    sku: string;
    productCode: string;
    description: string;
    price: number;
    cost: number;
    stock: number;
    minStock: number;
    supplierId: string;
  }>>;
  setProductPhotoFile: Dispatch<SetStateAction<File | null>>;
  submitProduct: (event: FormEvent) => Promise<void> | void;
  products: Product[];
  suppliers: Supplier[];
  openProductPhotoModal: (productId: string) => void;
  editProduct: (product: Product) => void;
  deleteProduct: (product: Product) => void;

  // Vendas
  saleForm: { productId: string; quantity: number; paymentMethod: string };
  setSaleForm: Dispatch<SetStateAction<{ productId: string; quantity: number; paymentMethod: string }>>;
  submitSale: (event: FormEvent) => Promise<void> | void;
  sales: Sale[];
  editSale: (sale: Sale) => void;
  deleteSale: (sale: Sale) => void;
  pixModalOpen: boolean;
  setPixModalOpen: Dispatch<SetStateAction<boolean>>;

  // Compras
  purchaseForm: { supplierId: string; productId: string; quantity: number; cost: number };
  setPurchaseForm: Dispatch<SetStateAction<{ supplierId: string; productId: string; quantity: number; cost: number }>>;
  submitPurchase: (event: FormEvent) => Promise<void> | void;
  filteredProductsBySupplier: Product[];
  purchases: Purchase[];
  reviewPurchase: (purchaseId: string, action: "aprovar" | "rejeitar") => void;
  editPurchase: (purchase: Purchase) => void;
  deletePurchase: (purchase: Purchase) => void;

  // Fornecedores
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
  submitSupplier: (event: FormEvent) => Promise<void> | void;
  editSupplier: (supplier: Supplier) => void;
  deleteSupplier: (supplier: Supplier) => void;

  // Financeiro
  economicIndicators: EconomicIndicators | null;
  expenseForm: { description: string; category: string; amount: number; dueDate: string };
  setExpenseForm: Dispatch<SetStateAction<{ description: string; category: string; amount: number; dueDate: string }>>;
  submitExpense: (event: FormEvent) => Promise<void> | void;
  expenses: Expense[];
  reviewExpense: (expenseId: string, action: "aprovar" | "rejeitar" | "pagar") => void;
  editExpense: (expense: Expense) => void;
  deleteExpense: (expense: Expense) => void;

  // Checklist
  checklistForm: { title: string; notes: string };
  setChecklistForm: Dispatch<SetStateAction<{ title: string; notes: string }>>;
  checklistItems: ChecklistItem[];
  submitChecklistItem: (event: FormEvent) => Promise<void> | void;
  toggleChecklistItem: (item: ChecklistItem) => void;
  editChecklistItem: (item: ChecklistItem) => void;
  deleteChecklistItem: (item: ChecklistItem) => void;

  // IA
  aiMessages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
  aiInput: string;
  setAiInput: Dispatch<SetStateAction<string>>;
  aiBusy: boolean;
  aiPlan: AiPlan | null;
  handleAiSend: () => Promise<void> | void;
  handleAiExecute: (overrides?: unknown) => Promise<void> | void;

  // Usuário
  userForm: { userName: string; userEmail: string; userRole: string; companyName: string };
  setUserForm: Dispatch<SetStateAction<{ userName: string; userEmail: string; userRole: string; companyName: string }>>;
  submitUserProfile: (event: FormEvent) => Promise<void> | void;
  themeOptions: Array<{ value: Theme; label: string; description: string }>;
  theme: Theme;
  handleThemeChange: (next: Theme) => void;
  whatsAppStatus: { configured: boolean; apiUrl: string; phoneNumberIdConfigured: boolean; accessTokenConfigured: boolean; notifyTo: string } | null;
  whatsAppForm: { phone: string; message: string };
  setWhatsAppForm: Dispatch<SetStateAction<{ phone: string; message: string }>>;
  sendManualWhatsAppMessage: (event: FormEvent) => Promise<void> | void;
  loadWhatsAppStatus: () => Promise<void> | void;
};

export default function ActiveModuleRenderer(props: ActiveModuleRendererProps) {
  if (props.loading) return null;

  if (props.activeModule === "clientes") {
    return (
      <ClientesModule
        customerForm={props.customerForm}
        setCustomerForm={props.setCustomerForm}
        submitCustomer={props.submitCustomer}
        customers={props.customers}
        editCustomer={props.editCustomer}
        deleteCustomer={props.deleteCustomer}
      />
    );
  }

  if (props.activeModule === "produtos") {
    return (
      <ProdutosModule
        scopedPath={props.scopedPath}
        formatBRL={props.formatBRL}
        productForm={props.productForm}
        setProductForm={props.setProductForm}
        setProductPhotoFile={props.setProductPhotoFile}
        submitProduct={props.submitProduct}
        products={props.products}
        suppliers={props.suppliers}
        openProductPhotoModal={props.openProductPhotoModal}
        editProduct={props.editProduct}
        deleteProduct={props.deleteProduct}
      />
    );
  }

  if (props.activeModule === "vendas") {
    return (
      <VendasModule
        submitSale={props.submitSale}
        saleForm={props.saleForm}
        setSaleForm={props.setSaleForm}
        products={props.products}
        sales={props.sales}
        editSale={props.editSale}
        deleteSale={props.deleteSale}
        pixModalOpen={props.pixModalOpen}
        setPixModalOpen={props.setPixModalOpen}
        formatBRL={props.formatBRL}
      />
    );
  }

  if (props.activeModule === "compras") {
    return (
      <ComprasModule
        submitPurchase={props.submitPurchase}
        purchaseForm={props.purchaseForm}
        setPurchaseForm={props.setPurchaseForm}
        suppliers={props.suppliers}
        filteredProductsBySupplier={props.filteredProductsBySupplier}
        purchases={props.purchases}
        reviewPurchase={props.reviewPurchase}
        editPurchase={props.editPurchase}
        deletePurchase={props.deletePurchase}
        formatBRL={props.formatBRL}
      />
    );
  }

  if (props.activeModule === "fornecedores") {
    return (
      <FornecedoresModule
        submitSupplier={props.submitSupplier}
        supplierForm={props.supplierForm}
        setSupplierForm={props.setSupplierForm}
        suppliers={props.suppliers}
        editSupplier={props.editSupplier}
        deleteSupplier={props.deleteSupplier}
      />
    );
  }

  if (props.activeModule === "financeiro") {
    return (
      <FinanceiroModule
        economicIndicators={props.economicIndicators}
        submitExpense={props.submitExpense}
        expenseForm={props.expenseForm}
        setExpenseForm={props.setExpenseForm}
        expenses={props.expenses}
        reviewExpense={props.reviewExpense}
        editExpense={props.editExpense}
        deleteExpense={props.deleteExpense}
        formatBRL={props.formatBRL}
      />
    );
  }

  if (props.activeModule === "checklist") {
    return (
      <ChecklistModule
        submitChecklistItem={props.submitChecklistItem}
        checklistForm={props.checklistForm}
        setChecklistForm={props.setChecklistForm}
        checklistItems={props.checklistItems}
        toggleChecklistItem={props.toggleChecklistItem}
        editChecklistItem={props.editChecklistItem}
        deleteChecklistItem={props.deleteChecklistItem}
      />
    );
  }

  if (props.activeModule === "ia") {
    return (
      <IaModule
        aiMessages={props.aiMessages}
        aiInput={props.aiInput}
        setAiInput={props.setAiInput}
        aiBusy={props.aiBusy}
        aiPlan={props.aiPlan}
        handleAiSend={props.handleAiSend}
        handleAiExecute={props.handleAiExecute}
      />
    );
  }

  if (props.activeModule === "usuario") {
    return (
      <UsuarioModule
        submitUserProfile={props.submitUserProfile}
        userForm={props.userForm}
        setUserForm={props.setUserForm}
        themeOptions={props.themeOptions}
        theme={props.theme}
        handleThemeChange={props.handleThemeChange}
        whatsAppStatus={props.whatsAppStatus}
        whatsAppForm={props.whatsAppForm}
        setWhatsAppForm={props.setWhatsAppForm}
        sendManualWhatsAppMessage={props.sendManualWhatsAppMessage}
        loadWhatsAppStatus={props.loadWhatsAppStatus}
      />
    );
  }

  return null;
}

