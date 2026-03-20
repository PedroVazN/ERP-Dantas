import type { Product, Supplier } from "../types";
import { API_URL } from "../api";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type ProductFormState = {
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

export type ProdutosModuleProps = {
  scopedPath: (path: string) => string;
  formatBRL: (value: number) => string;
  productForm: ProductFormState;
  setProductForm: Dispatch<SetStateAction<ProductFormState>>;
  setProductPhotoFile: Dispatch<SetStateAction<File | null>>;
  submitProduct: (event: FormEvent) => Promise<void> | void;
  products: Product[];
  suppliers: Supplier[];
  openProductPhotoModal: (productId: string) => void;
  editProduct: (product: Product) => void;
  deleteProduct: (product: Product) => void;
};

export default function ProdutosModule(props: ProdutosModuleProps) {
  return (
    <section className="module-grid animated">
      <form className="form-card" onSubmit={props.submitProduct}>
        <h3>Novo produto</h3>
        <div className="form-field">
          <label>Nome</label>
          <small className="field-help">Nome do item no catálogo (ex.: “Sabonete Lavanda 90g”).</small>
          <input
            placeholder="ex.: Sabonete Lavanda 90g"
            value={props.productForm.name}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, name: event.target.value })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>SKU</label>
          <small className="field-help">Identificador único do produto (não repita).</small>
          <input
            placeholder="ex.: SAB-LAV-90"
            value={props.productForm.sku}
            onChange={(event) => props.setProductForm({ ...props.productForm, sku: event.target.value })}
            required
          />
        </div>
        <div className="form-field">
          <label>Código do produto</label>
          <small className="field-help">Opcional. Código interno/etiqueta.</small>
          <input
            placeholder="ex.: 00123"
            value={props.productForm.productCode}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, productCode: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Descrição</label>
          <small className="field-help">Opcional. Detalhes para consulta rápida e notas.</small>
          <textarea
            rows={3}
            placeholder="ex.: Base vegetal, aroma lavanda, embalagem kraft..."
            value={props.productForm.description}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, description: event.target.value })
            }
          />
        </div>
        <div className="form-field">
          <label>Fornecedor</label>
          <small className="field-help">Quem fornece/produz este item (obrigatório).</small>
          <select
            value={props.productForm.supplierId}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, supplierId: event.target.value })
            }
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
          <label>Preço de venda</label>
          <small className="field-help">Quanto você cobra do cliente (R$).</small>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="ex.: 12,90"
            value={props.productForm.price}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, price: Number(event.target.value) })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>Custo</label>
          <small className="field-help">Quanto custa para produzir/comprar (R$).</small>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="ex.: 6,20"
            value={props.productForm.cost}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, cost: Number(event.target.value) })
            }
            required
          />
        </div>
        <div className="form-field">
          <label>Estoque inicial</label>
          <small className="field-help">Quantidade disponível agora (unidades).</small>
          <input
            type="number"
            min={0}
            placeholder="ex.: 100"
            value={props.productForm.stock}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, stock: Number(event.target.value) })
            }
          />
        </div>
        <div className="form-field">
          <label>Estoque mínimo</label>
          <small className="field-help">Alerta de reposição quando o estoque ficar abaixo deste número.</small>
          <input
            type="number"
            min={0}
            placeholder="ex.: 10"
            value={props.productForm.minStock}
            onChange={(event) =>
              props.setProductForm({ ...props.productForm, minStock: Number(event.target.value) })
            }
          />
        </div>
        <div className="form-field">
          <label>Foto do produto</label>
          <small className="field-help">Opcional. Envie uma imagem para o catálogo (salva no MongoDB).</small>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              props.setProductPhotoFile(file);
            }}
          />
        </div>
        <button type="submit">Cadastrar produto</button>
      </form>

      <section className="table-card">
        <h3>Produtos</h3>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>SKU</th>
              <th>Código</th>
              <th>Descrição</th>
              <th>Preço</th>
              <th>Custo</th>
              <th>Estoque</th>
              <th>Foto</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.products.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>{item.sku}</td>
                <td>{item.productCode || "-"}</td>
                <td>{item.description || "-"}</td>
                <td>{props.formatBRL(item.price)}</td>
                <td>{props.formatBRL(item.cost)}</td>
                <td>{item.stock}</td>
                <td>
                  {item.hasPhoto ? (
                    <img
                      className="product-photo-thumb"
                      src={`${API_URL}${props.scopedPath(`/products/${item._id}/photo`)}`}
                      alt={`Foto de ${item.name}`}
                      title="Clique para ampliar"
                      onClick={() => props.openProductPhotoModal(item._id)}
                    />
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => props.editProduct(item)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-btn danger"
                      onClick={() => props.deleteProduct(item)}
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

