import { useEffect, useMemo, useState } from "react";

import { API_URL, api } from "../api";
import type { Product } from "../types";

export type PrecosModuleProps = {
  scopedPath: (path: string) => string;
  formatBRL: (value: number) => string;
  products: Product[];
  /** Reaproveita o loader global para refletir mudanças nos demais módulos. */
  loadAllData: () => Promise<void> | void;
};

type ImportPreviewRow = {
  line: number;
  sku: string;
  name: string;
  price: number;
  productId: string;
  matchedName: string;
  valid: boolean;
  errors: string[];
};

type ImportPreviewResponse = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ImportPreviewRow[];
};

function computeMargin(price: number, cost: number) {
  const revenue = Number(price) || 0;
  const c = Number(cost) || 0;
  if (revenue <= 0) return { profit: 0 - c, percent: 0 };
  const profit = revenue - c;
  return { profit, percent: (profit / revenue) * 100 };
}

export default function PrecosModule(props: PrecosModuleProps) {
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null);
  const [importMessage, setImportMessage] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Sempre que a lista de produtos vinda do App.tsx mudar, refletimos o
  // valor mais recente no draft (sem sobrescrever edições em andamento).
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const product of props.products) {
        if (next[product._id] === undefined) {
          next[product._id] = Number(product.price ?? 0).toFixed(2);
        }
      }
      return next;
    });
  }, [props.products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return props.products;
    return props.products.filter((product) => {
      const haystack = [product.name, product.sku, product.productCode, product.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [props.products, search]);

  function parsePriceInput(value: string): number {
    const normalized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  async function savePriceFor(product: Product) {
    setFeedback(null);
    const draft = drafts[product._id];
    const next = parsePriceInput(draft ?? "");
    if (!Number.isFinite(next) || next < 0) {
      setFeedback({ kind: "error", message: `Preço inválido para "${product.name}".` });
      return;
    }
    if (Math.abs(next - Number(product.price ?? 0)) < 0.0001) {
      return;
    }
    setSavingId(product._id);
    try {
      await api.patch<Product>(props.scopedPath(`/price-table/${product._id}`), {
        price: next,
      });
      setFeedback({ kind: "success", message: `Preço de "${product.name}" atualizado.` });
      await props.loadAllData();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar preço.",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function saveBulkPrices() {
    setFeedback(null);
    const rows = props.products
      .map((product) => {
        const next = parsePriceInput(drafts[product._id] ?? "");
        if (!Number.isFinite(next) || next < 0) return null;
        if (Math.abs(next - Number(product.price ?? 0)) < 0.0001) return null;
        return { id: product._id, price: next };
      })
      .filter((row): row is { id: string; price: number } => row !== null);

    if (!rows.length) {
      setFeedback({ kind: "error", message: "Nenhuma alteração pendente para salvar." });
      return;
    }

    try {
      const response = await api.post<{ updated: number }>(
        props.scopedPath("/price-table/bulk"),
        { rows }
      );
      setFeedback({
        kind: "success",
        message: `${response.updated} preço(s) atualizado(s) em lote.`,
      });
      await props.loadAllData();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao atualizar em lote.",
      });
    }
  }

  function resetDrafts() {
    const next: Record<string, string> = {};
    for (const product of props.products) {
      next[product._id] = Number(product.price ?? 0).toFixed(2);
    }
    setDrafts(next);
    setFeedback(null);
  }

  async function downloadTemplate() {
    setImportMessage(null);
    try {
      const response = await fetch(
        `${API_URL}${props.scopedPath("/price-table/import/template")}`
      );
      if (!response.ok) {
        throw new Error("Não foi possível baixar o modelo.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "modelo-tabela-precos.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao baixar modelo.",
      });
    }
  }

  async function previewImport() {
    if (!importFile) {
      setImportMessage({ kind: "error", message: "Selecione um arquivo .xlsx para continuar." });
      return;
    }
    setImportLoading(true);
    setImportMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await api.postFormData<ImportPreviewResponse>(
        props.scopedPath("/price-table/import/preview"),
        formData
      );
      setImportPreview(response);
    } catch (error) {
      setImportPreview(null);
      setImportMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao ler planilha.",
      });
    } finally {
      setImportLoading(false);
    }
  }

  async function commitImport() {
    if (!importPreview) return;
    const validRows = importPreview.rows.filter((row) => row.valid);
    if (!validRows.length) {
      setImportMessage({ kind: "error", message: "Nenhuma linha válida para confirmar." });
      return;
    }
    setImportCommitting(true);
    setImportMessage(null);
    try {
      const response = await api.post<{ updated: number; message: string }>(
        props.scopedPath("/price-table/import/commit"),
        { rows: validRows }
      );
      setImportMessage({
        kind: "success",
        message: response.message || `${response.updated} preço(s) atualizado(s).`,
      });
      setImportPreview(null);
      setImportFile(null);
      await props.loadAllData();
    } catch (error) {
      setImportMessage({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao confirmar importação.",
      });
    } finally {
      setImportCommitting(false);
    }
  }

  const pendingChanges = useMemo(() => {
    return props.products.reduce((acc, product) => {
      const draft = drafts[product._id];
      if (draft === undefined) return acc;
      const next = parsePriceInput(draft);
      if (!Number.isFinite(next) || next < 0) return acc;
      if (Math.abs(next - Number(product.price ?? 0)) >= 0.0001) acc += 1;
      return acc;
    }, 0);
  }, [drafts, props.products]);

  return (
    <section className="module-grid animated">
      <section className="table-card" style={{ gridColumn: "1 / -1" }}>
        <div className="order-header">
          <h3>Tabela de preços</h3>
          <div className="table-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={resetDrafts}
              disabled={pendingChanges === 0}
              title="Descartar alterações pendentes"
            >
              Descartar alterações
            </button>
            <button
              type="button"
              onClick={() => void saveBulkPrices()}
              disabled={pendingChanges === 0}
              title="Atualizar em lote todos os preços alterados"
            >
              Salvar {pendingChanges > 0 ? `(${pendingChanges})` : ""} em lote
            </button>
          </div>
        </div>
        <p className="theme-helper">
          Atualize preços de venda produto a produto (Enter ou botão Salvar) ou em lote pela planilha
          Excel. O custo exibido é o <strong>custo médio</strong> ponderado, recalculado
          automaticamente a cada nova ordem de compra recebida.
        </p>

        {feedback ? (
          <p className={feedback.kind === "success" ? "feedback" : "error"}>{feedback.message}</p>
        ) : null}

        <div className="order-toolbar">
          <div className="form-field">
            <label>Buscar</label>
            <input
              placeholder="Buscar por nome, SKU, código ou descrição"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="table-scroll">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Custo médio</th>
                <th>Preço de venda (R$)</th>
                <th>Margem</th>
                <th>Estoque</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const draft = drafts[product._id] ?? Number(product.price ?? 0).toFixed(2);
                  const parsed = parsePriceInput(draft);
                  const hasError = !Number.isFinite(parsed) || parsed < 0;
                  const isDirty =
                    Number.isFinite(parsed) &&
                    Math.abs(parsed - Number(product.price ?? 0)) >= 0.0001;
                  const margin = computeMargin(
                    Number.isFinite(parsed) && parsed >= 0 ? parsed : Number(product.price ?? 0),
                    product.cost
                  );
                  const marginClass =
                    margin.percent >= 30
                      ? "status-chip success"
                      : margin.percent >= 10
                        ? "status-chip warning"
                        : "status-chip danger";

                  return (
                    <tr key={product._id}>
                      <td data-label="Produto">
                        <strong>{product.name}</strong>
                        {product.description ? (
                          <div className="theme-helper">{product.description}</div>
                        ) : null}
                      </td>
                      <td data-label="SKU">{product.sku}</td>
                      <td data-label="Custo médio">{props.formatBRL(Number(product.cost) || 0)}</td>
                      <td data-label="Preço (R$)">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft}
                          onChange={(event) =>
                            setDrafts((prev) => ({ ...prev, [product._id]: event.target.value }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void savePriceFor(product);
                            }
                          }}
                          aria-invalid={hasError}
                        />
                      </td>
                      <td data-label="Margem">
                        <span className={marginClass}>
                          {margin.percent.toFixed(1)}% · {props.formatBRL(margin.profit)}
                        </span>
                      </td>
                      <td data-label="Estoque">{product.stock}</td>
                      <td data-label="Ação">
                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={!isDirty || hasError || savingId === product._id}
                          onClick={() => void savePriceFor(product)}
                        >
                          {savingId === product._id ? "Salvando…" : "Salvar"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-card" style={{ gridColumn: "1 / -1" }}>
        <div className="order-header">
          <h3>Atualização em massa por Excel</h3>
          <button type="button" className="ghost-btn" onClick={() => void downloadTemplate()}>
            Baixar modelo Excel
          </button>
        </div>
        <p className="theme-helper">
          Baixe o modelo, preencha as colunas <code>sku</code> e <code>preco_venda</code> e envie
          a planilha. O sistema valida cada linha antes de confirmar a atualização.
        </p>

        <div className="products-import-actions">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setImportFile(file);
              setImportPreview(null);
              setImportMessage(null);
            }}
          />
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void previewImport()}
            disabled={!importFile || importLoading}
          >
            {importLoading ? "Lendo planilha…" : "Validar planilha"}
          </button>
          <button
            type="button"
            onClick={() => void commitImport()}
            disabled={!importPreview || importPreview.validRows === 0 || importCommitting}
          >
            {importCommitting ? "Atualizando…" : "Confirmar atualização"}
          </button>
        </div>

        {importMessage ? (
          <p className={importMessage.kind === "success" ? "feedback" : "error"}>
            {importMessage.message}
          </p>
        ) : null}

        {importPreview ? (
          <div className="products-import-preview">
            <p className="theme-helper">
              Linhas: {importPreview.totalRows} · Válidas: {importPreview.validRows} · Com erro:{" "}
              {importPreview.invalidRows}
            </p>
            <div className="table-scroll">
              <table className="responsive-table products-import-table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Novo preço</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((row) => (
                    <tr
                      key={`${row.line}-${row.sku}`}
                      className={row.valid ? "" : "products-import-row-error"}
                    >
                      <td data-label="Linha">{row.line}</td>
                      <td data-label="SKU">{row.sku || "-"}</td>
                      <td data-label="Produto">{row.matchedName || "—"}</td>
                      <td data-label="Novo preço">{props.formatBRL(row.price)}</td>
                      <td data-label="Status">
                        {row.valid ? "OK" : row.errors.join(" | ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
