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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
      const exportProducts = props.products.filter((p) => p.stock > 0);
      const withPhoto = exportProducts.filter((p) => p.hasPhoto);

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

      const cards = exportProducts
        .map((p) => {
          const safeName = escapeHtml(p.name);
          const safeDesc = escapeHtml(p.description || "");
          const photoHtml = photosMap[p._id]
            ? `<img src="${photosMap[p._id]}" alt="${safeName}" />`
            : `<div class="no-photo"><span>Sem foto</span></div>`;
          const desc = safeDesc
            ? `<p class="desc">${safeDesc}</p>`
            : "";
          const stockClass = p.stock <= (p.minStock ?? 0) ? "stock low" : "stock";
          return `
<article class="card">
  <div class="photo-wrap">${photoHtml}</div>
  <div class="info">
    <h3>${safeName}</h3>
    ${desc}
    <div class="meta-row">
      <span class="price">${props.formatBRL(p.price)}</span>
      <span class="buy-icon">🛒</span>
    </div>
    <div class="stock-line">
      <span class="${stockClass}">Estoque: ${p.stock} un.</span>
    </div>
  </div>
</article>`;
        })
        .join("\n");

      const now = new Date().toLocaleString("pt-BR");
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Nature Saboaria - Catálogo de Produtos</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,Arial,Helvetica,sans-serif;background:#eef1f4;color:#111;padding:18px}
  .sheet{
    max-width:900px;margin:0 auto;background:#fff;border-radius:20px;padding:20px 24px 56px;
    box-shadow:0 10px 28px rgba(0,0,0,.12);position:relative;overflow:hidden;
    background-image:linear-gradient(180deg,rgba(240,242,245,.7),rgba(255,255,255,0));
  }
  .sheet::before{
    content:"";position:absolute;inset:0;pointer-events:none;opacity:.22;
    background-image:radial-gradient(circle at 8% 12%, #dbe9d0 0 8px, transparent 9px),
      radial-gradient(circle at 94% 10%, #f5f0c8 0 7px, transparent 8px),
      radial-gradient(circle at 92% 85%, #dbe9d0 0 9px, transparent 10px),
      radial-gradient(circle at 7% 82%, #f5f0c8 0 6px, transparent 7px);
  }
  header{text-align:center;margin-bottom:18px;position:relative;z-index:1}
  .brand{font-size:30px;line-height:1;margin-bottom:4px}
  .brand-name{font-size:24px;font-weight:600;letter-spacing:.02em;color:#273037}
  .brand-sub{font-size:11px;color:#4a545c;letter-spacing:.12em;text-transform:uppercase}
  header h1{font-size:37px;margin-top:10px;color:#111;font-weight:800;letter-spacing:-.02em}
  header p{font-size:12px;color:#666;margin-top:6px}
  .grid{display:flex;flex-direction:column;gap:14px;position:relative;z-index:1}
  .card{
    display:grid;grid-template-columns: 44% 56%;background:rgba(255,255,255,.94);
    border:1px solid #e4e7eb;border-radius:16px;overflow:hidden;break-inside:avoid;
  }
  .card:nth-child(even){grid-template-columns:56% 44%}
  .card:nth-child(even) .photo-wrap{order:2}
  .photo-wrap{min-height:200px;background:#eceff3;display:flex;align-items:center;justify-content:center}
  .photo-wrap img{width:100%;height:100%;object-fit:cover}
  .no-photo{width:100%;height:100%;display:grid;place-items:center;color:#8a939c;font-size:15px}
  .info{padding:18px 18px 16px;display:flex;flex-direction:column;justify-content:center}
  .info h3{font-size:38px;font-weight:800;color:#121418;line-height:1.08;letter-spacing:-.02em}
  .desc{font-size:14px;color:#3f4750;line-height:1.45;margin-top:10px}
  .meta-row{display:flex;align-items:center;gap:10px;margin-top:14px}
  .price{font-size:42px;font-weight:900;color:#151a1f;letter-spacing:-.03em}
  .buy-icon{
    display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
    border-radius:8px;border:1px solid #c8ccd1;font-size:15px
  }
  .stock-line{margin-top:8px}
  .stock{font-size:16px;color:#49515a}
  .stock.low{color:#b91c1c;font-weight:700}
  .footer{
    position:fixed;left:0;right:0;bottom:0;padding:7px 22px;background:#fff;
    border-top:1px solid #dfe3e7;display:flex;justify-content:space-between;
    font-size:11px;color:#5d6670
  }
  .page-number::after{content: "Página " counter(page);}
  @media print{
    @page{size:A4;margin:12mm}
    body{background:#fff;padding:0}
    .sheet{box-shadow:none;border-radius:0;max-width:none;padding:10px 8px 40px}
    .footer{position:fixed}
    .card{page-break-inside:avoid}
  }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <div class="brand">✿</div>
    <div class="brand-name">NATURE SABOARIA</div>
    <div class="brand-sub">SABONETES ARTESANAIS</div>
    <h1>Catálogo de Produtos</h1>
    <p>Gerado em ${now} · ${String(exportProducts.length)} produto(s) com estoque</p>
  </header>
  <div class="grid">
  ${cards}
  </div>
</div>
<div class="footer">
  <span>Nature Saboaria</span>
  <span class="page-number"></span>
</div>
<script>
  window.onload=function(){
    try { document.title = "Nature Saboaria - Catalogo"; } catch(e) {}
    window.print();
  }
<\/script>
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
            title="Exportar somente produtos com estoque como PDF"
          >
            {exportingPDF ? `⏳ Carregando fotos…` : "⬇ Exportar PDF (com estoque)"}
          </button>
        </div>

        {tab === "lista" ? (
          <>
            <h3>Produtos</h3>
            <div className="table-scroll">
              <table className="responsive-table">
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
                      <td data-label="Nome">{item.name}</td>
                      <td data-label="SKU">{item.sku}</td>
                      <td data-label="Código">{item.productCode || "-"}</td>
                      <td data-label="Descrição">{item.description || "-"}</td>
                      <td data-label="Preço">{props.formatBRL(item.price)}</td>
                      <td data-label="Custo">{props.formatBRL(item.cost)}</td>
                      <td data-label="Estoque">{item.stock}</td>
                      <td data-label="Foto">
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
                      <td data-label="Ações">
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
            </div>
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

