import type { Product, Supplier } from "../types";
import { API_URL } from "../api";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";

/** Converte URL de imagem em base64 usando canvas (crossOrigin) com fallback para fetch */
async function fetchPhotoAsBase64(url: string): Promise<string | null> {
  // Método 1: canvas com crossOrigin (não exige segundo request se imagem já em cache)
  const canvasResult = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    // Cache-bust para forçar CORS no novo request
    img.src = url.includes("?") ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
    // Timeout de segurança
    setTimeout(() => resolve(null), 8000);
  });
  if (canvasResult) return canvasResult;

  // Método 2: fetch direto
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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
  const [tab, setTab] = useState<"lista" | "catalogo">("lista");
  const [exportingPDF, setExportingPDF] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  const catalogProducts = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return props.products.filter(
      (p) => p.hasPhoto && (!q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q))
    );
  }, [props.products, catalogSearch]);

  async function exportCatalogPDF() {
    setExportingPDF(true);
    try {
      const allProducts = props.products;
      const withPhoto = allProducts.filter((p) => p.hasPhoto);

      const photosMap: Record<string, string> = {};
      // Busca fotos em lotes de 4 para não sobrecarregar o servidor
      for (let i = 0; i < withPhoto.length; i += 4) {
        const batch = withPhoto.slice(i, i + 4);
        await Promise.all(
          batch.map(async (p) => {
            const url = `${API_URL}${props.scopedPath(`/products/${p._id}/photo`)}`;
            const b64 = await fetchPhotoAsBase64(url);
            if (b64) photosMap[p._id] = b64;
          })
        );
      }

      const cards = allProducts
        .map((p) => {
          const photoHtml = photosMap[p._id]
            ? `<img src="${photosMap[p._id]}" alt="${p.name}" />`
            : `<div class="no-photo"><span>Sem foto</span></div>`;
          const desc = p.description
            ? `<p class="desc">${p.description}</p>`
            : "";
          const stockClass = p.stock <= (p.minStock ?? 0) ? "stock low" : "stock";
          return `
<div class="card">
  <div class="photo-wrap">${photoHtml}</div>
  <div class="info">
    <h3>${p.name}</h3>
    ${p.sku ? `<small class="sku">SKU: ${p.sku}${p.productCode ? " · Cód: " + p.productCode : ""}</small>` : ""}
    ${desc}
    <div class="meta">
      <span class="price">${props.formatBRL(p.price)}</span>
      <span class="${stockClass}">Estoque: ${p.stock} un.${p.minStock ? " (mín " + String(p.minStock) + ")" : ""}</span>
    </div>
  </div>
</div>`;
        })
        .join("\n");

      const now = new Date().toLocaleString("pt-BR");
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Catálogo de Produtos</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;color:#111;padding:24px}
  header{text-align:center;margin-bottom:24px}
  header h1{font-size:22px;color:#1a1a2e}
  header p{font-size:11px;color:#666;margin-top:4px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
  .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.10);display:flex;flex-direction:column;break-inside:avoid}
  .photo-wrap{width:100%;height:180px;background:#eee;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .photo-wrap img{width:100%;height:100%;object-fit:cover}
  .no-photo{font-size:36px;color:#bbb}
  .info{padding:10px 12px 12px;display:flex;flex-direction:column;gap:5px;flex:1}
  .info h3{font-size:14px;font-weight:700;color:#1a1a2e;line-height:1.3}
  .sku{font-size:10px;color:#888}
  .desc{font-size:12px;color:#444;line-height:1.4;flex:1}
  .meta{display:flex;flex-direction:column;gap:3px;margin-top:auto;padding-top:8px;border-top:1px dashed #ddd}
  .price{font-size:15px;font-weight:700;color:#16a34a}
  .stock{font-size:11px;color:#555}
  .stock.low{color:#dc2626;font-weight:600}
  footer{text-align:center;font-size:10px;color:#999;margin-top:24px}
  @media print{
    body{background:#fff;padding:12px}
    .card{box-shadow:none;border:1px solid #ddd}
    @page{margin:1.5cm}
  }
</style>
</head>
<body>
<header>
  <h1>Catálogo de Produtos</h1>
  <p>Gerado em ${now} · ${String(allProducts.length)} produto(s)</p>
</header>
<div class="grid">
${cards}
</div>
<footer>E-Sentinel ERP · Catálogo gerado automaticamente</footer>
<script>window.onload=function(){window.print();}<\/script>
</body>
</html>`;

      const win = window.open("", "_blank", "width=900,height=780");
      if (!win) {
        alert("Permita pop-ups para exportar o PDF.");
        return;
      }
      win.document.write(html);
      win.document.close();
    } finally {
      setExportingPDF(false);
    }
  }

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
        <div className="catalog-tabs">
          <button
            type="button"
            className={tab === "lista" ? "ghost-btn catalog-tab active" : "ghost-btn catalog-tab"}
            onClick={() => setTab("lista")}
          >
            Lista
          </button>
          <button
            type="button"
            className={tab === "catalogo" ? "ghost-btn catalog-tab active" : "ghost-btn catalog-tab"}
            onClick={() => setTab("catalogo")}
          >
            Catálogo
          </button>
          <button
            type="button"
            className="ghost-btn catalog-tab catalog-export-btn"
            onClick={() => void exportCatalogPDF()}
            disabled={exportingPDF}
            title="Exportar todos os produtos como PDF"
          >
            {exportingPDF ? `⏳ Carregando fotos…` : "⬇ Exportar PDF"}
          </button>
        </div>

        {tab === "lista" ? (
          <>
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
          </>
        ) : (
          <div className="catalog-shell">
            <div className="catalog-hero">
              <div className="catalog-hero-text">
                <h2 className="catalog-hero-title">Catálogo de Produtos</h2>
                <p className="catalog-hero-sub">
                  {props.products.filter((p) => p.hasPhoto).length} produto
                  {props.products.filter((p) => p.hasPhoto).length !== 1 ? "s" : ""} com foto
                </p>
              </div>
              <div className="catalog-search-wrap">
                <span className="catalog-search-icon">⌕</span>
                <input
                  className="catalog-search-input"
                  placeholder="Buscar produto…"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
              </div>
            </div>

            {catalogProducts.length === 0 ? (
              <div className="catalog-empty">
                <span className="catalog-empty-icon">📷</span>
                <p>{catalogSearch ? "Nenhum produto encontrado." : "Adicione fotos aos produtos para exibi-los aqui."}</p>
              </div>
            ) : (
              <div className="catalog-grid">
                {catalogProducts.map((item) => (
                  <article className="catalog-card" key={item._id}>
                    <button
                      type="button"
                      className="catalog-photo-wrap"
                      onClick={() => props.openProductPhotoModal(item._id)}
                      aria-label={`Ver foto de ${item.name}`}
                    >
                      <img
                        className="catalog-photo"
                        src={`${API_URL}${props.scopedPath(`/products/${item._id}/photo`)}`}
                        alt={item.name}
                        loading="lazy"
                      />
                      <div className="catalog-photo-overlay">
                        <span className="catalog-overlay-zoom">🔍 Ampliar</span>
                      </div>
                      {item.stock <= (item.minStock ?? 0) && item.minStock > 0 && (
                        <span className="catalog-badge-low">Estoque baixo</span>
                      )}
                    </button>

                    <div className="catalog-card-body">
                      <div className="catalog-card-top">
                        {item.sku && <span className="catalog-sku">{item.sku}</span>}
                        <strong className="catalog-title">{item.name}</strong>
                        {item.description ? (
                          <p className="catalog-desc">{item.description}</p>
                        ) : null}
                      </div>

                      <div className="catalog-card-footer">
                        <div className="catalog-pricing">
                          <span className="catalog-price">{props.formatBRL(item.price)}</span>
                          <span className="catalog-stock-badge">
                            {item.stock} un.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="catalog-edit-btn"
                          onClick={() => props.editProduct(item)}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

