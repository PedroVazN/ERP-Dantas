import { API_URL } from "../api";

export type ProductPhotoModalProps = {
  productId: string;
  scopedPath: (path: string) => string;
  onClose: () => void;
};

export default function ProductPhotoModal(props: ProductPhotoModalProps) {
  return (
    <div className="app-modal-overlay" onClick={props.onClose}>
      <div className="app-modal" onClick={(event) => event.stopPropagation()}>
        <div className="app-modal-header">
          <div>
            <h3>Foto do produto</h3>
            <p>Visualização ampliada</p>
          </div>
          <button type="button" className="ghost-btn" onClick={props.onClose}>
            Fechar
          </button>
        </div>
        <div className="app-modal-body" style={{ justifyItems: "center" }}>
          <img
            className="product-photo-full"
            src={`${API_URL}${props.scopedPath(`/products/${props.productId}/photo`)}`}
            alt="Foto ampliada do produto"
          />
        </div>
      </div>
    </div>
  );
}
