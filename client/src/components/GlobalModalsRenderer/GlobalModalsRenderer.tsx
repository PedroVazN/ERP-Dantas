import type { Dispatch, SetStateAction } from "react";

import type {
  EditChecklistFormState,
  EditCustomerFormState,
  EditExpenseFormState,
  EditModalKind,
  EditPurchaseFormState,
  EditSaleFormState,
  EditSupplierFormState,
} from "../EditEntityModal/EditEntityModal";

import EditEntityModal, { type EditProductFormState } from "../EditEntityModal/EditEntityModal";
import ProductPhotoModal from "../ProductPhotoModal";
import type { Supplier } from "../../types";

export type GlobalModalsRendererProps = {
  // Edit modal
  editModalOpen: boolean;
  editModalKind: EditModalKind | null;
  editingId: string | null;
  editModalSubtitle: string;
  closeEditModal: () => void;

  isGeneralWorkspace: boolean;
  scopedPath: (path: string) => string;
  setError: Dispatch<SetStateAction<string>>;
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

  // Product photo modal
  productPhotoModalOpen: boolean;
  productPhotoModalProductId: string | null;
  closeProductPhotoModal: () => void;
};

export default function GlobalModalsRenderer(props: GlobalModalsRendererProps) {
  return (
    <>
      {props.editModalOpen && props.editModalKind && props.editingId ? (
        <>
          <EditEntityModal
            editModalKind={props.editModalKind}
            editingId={props.editingId}
            editModalSubtitle={props.editModalSubtitle}
            closeEditModal={props.closeEditModal}
            isGeneralWorkspace={props.isGeneralWorkspace}
            scopedPath={props.scopedPath}
            setError={props.setError}
            loadAllData={props.loadAllData}
            suppliers={props.suppliers}

            editCustomerForm={props.editCustomerForm}
            setEditCustomerForm={props.setEditCustomerForm}
            editProductForm={props.editProductForm}
            setEditProductForm={props.setEditProductForm}
            editProductHasPhoto={props.editProductHasPhoto}
            setEditProductPhotoFile={props.setEditProductPhotoFile}
            editProductPhotoFile={props.editProductPhotoFile}
            editSupplierForm={props.editSupplierForm}
            setEditSupplierForm={props.setEditSupplierForm}
            editSaleForm={props.editSaleForm}
            setEditSaleForm={props.setEditSaleForm}
            editPurchaseForm={props.editPurchaseForm}
            setEditPurchaseForm={props.setEditPurchaseForm}
            editExpenseForm={props.editExpenseForm}
            setEditExpenseForm={props.setEditExpenseForm}
            editChecklistForm={props.editChecklistForm}
            setEditChecklistForm={props.setEditChecklistForm}
          />
        </>
      ) : null}

      {props.productPhotoModalOpen && props.productPhotoModalProductId ? (
        <ProductPhotoModal
          productId={props.productPhotoModalProductId}
          scopedPath={props.scopedPath}
          onClose={props.closeProductPhotoModal}
        />
      ) : null}
    </>
  );
}

