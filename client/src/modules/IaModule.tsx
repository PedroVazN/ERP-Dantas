import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AiMessage, AiPlan, AiProductDraftField } from "../aiTypes";

export type IaModuleProps = {
  aiMessages: AiMessage[];
  aiInput: string;
  setAiInput: Dispatch<SetStateAction<string>>;
  aiBusy: boolean;
  aiPlan: AiPlan | null;
  handleAiSend: () => Promise<void> | void;
  handleAiExecute: (overrides?: unknown) => Promise<void> | void;
};

export default function IaModule(props: IaModuleProps) {
  const productDraft = props.aiPlan?.productDraft;

  type ProductDraftSelection = Partial<Record<AiProductDraftField, string | number>>;
  const [productSelection, setProductSelection] = useState<ProductDraftSelection>({});

  useEffect(() => {
    if (!props.aiPlan?.planId) return;
    setProductSelection({});
  }, [props.aiPlan?.planId]);

  const isProductDraftComplete = useMemo(() => {
    if (!productDraft) return true;
    return productDraft.requiredFields.every((field) => {
      const value = productSelection[field];
      return value !== undefined && value !== null && value !== "";
    });
  }, [productDraft, productSelection]);

  const executeOverrides = useMemo(() => {
    if (!productDraft || !isProductDraftComplete) return undefined;
    return {
      createProduct: {
        name: productSelection.name as string,
        sku: productSelection.sku as string,
        productCode: productSelection.productCode as string,
        description: productSelection.description as string,
        price: productSelection.price as number,
      },
    };
  }, [productDraft, isProductDraftComplete, productSelection]);

  return (
    <section className="module-grid animated">
      <section className="form-card">
        <h3>IA operacional</h3>
        <p className="theme-helper">
          Digite o que você quer fazer. Exemplos: <strong>compre 20 sabonetes de cidreira</strong>,
          <strong> vender 5 sabonete X</strong> ou <strong>cadastrar cliente Maria</strong>.
        </p>

        <div className="ai-chat">
          <div className="ai-messages">
            {props.aiMessages.length === 0 ? (
              <div className="empty">Nenhuma mensagem ainda.</div>
            ) : (
              props.aiMessages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === "user" ? "ai-bubble ai-user" : "ai-bubble ai-assistant"}
                >
                  {m.content}
                </div>
              ))
            )}
          </div>

          <div className="ai-compose">
            <input
              placeholder="Ex.: compre 20 sabonetes de cidreira"
              value={props.aiInput}
              onChange={(event) => props.setAiInput(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void props.handleAiSend();
                }
              }}
            />
            <button type="button" onClick={() => void props.handleAiSend()} disabled={props.aiBusy}>
              {props.aiBusy ? "Processando..." : "Enviar"}
            </button>
          </div>
        </div>
      </section>

      <section className="table-card">
        <h3>Prévia / Confirmação</h3>

        {props.aiPlan ? (
          <>
            <p className="theme-helper">
              <strong>Status:</strong> {props.aiPlan.status}
            </p>
            <p>{props.aiPlan.summary}</p>
            {props.aiPlan.warnings.length ? (
              <div className="ai-warning">
                <strong>Atenção:</strong>
                <ul>
                  {props.aiPlan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {props.aiPlan.questions?.length ? (
              <div className="ai-warning">
                <strong>Preciso de:</strong>
                <ul>
                  {props.aiPlan.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {props.aiPlan.actionsPreview?.length ? (
              <div className="ai-plan-preview">
                <strong>Ações:</strong>
                <ul>
                  {props.aiPlan.actionsPreview.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {productDraft ? (
              <div className="ai-product-draft" style={{ marginTop: 16 }}>
                <strong>Produto sugerido (clique para selecionar antes de executar)</strong>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
                  {productDraft.requiredFields.includes("name") ? (
                    <div>
                      <div className="theme-helper">Nome</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productDraft.options.name.map((opt) => {
                          const selected = productSelection.name === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              className="ghost-btn"
                              onClick={() => setProductSelection((p) => ({ ...p, name: opt }))}
                              style={{ opacity: selected ? 1 : 0.75 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {productDraft.requiredFields.includes("sku") ? (
                    <div>
                      <div className="theme-helper">SKU</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productDraft.options.sku.map((opt) => {
                          const selected = productSelection.sku === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              className="ghost-btn"
                              onClick={() => setProductSelection((p) => ({ ...p, sku: opt }))}
                              style={{ opacity: selected ? 1 : 0.75 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {productDraft.requiredFields.includes("productCode") ? (
                    <div>
                      <div className="theme-helper">Código do produto</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productDraft.options.productCode.map((opt) => {
                          const selected = productSelection.productCode === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              className="ghost-btn"
                              onClick={() => setProductSelection((p) => ({ ...p, productCode: opt }))}
                              style={{ opacity: selected ? 1 : 0.75 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {productDraft.requiredFields.includes("description") ? (
                    <div>
                      <div className="theme-helper">Descrição</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productDraft.options.description.map((opt) => {
                          const selected = productSelection.description === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              className="ghost-btn"
                              onClick={() => setProductSelection((p) => ({ ...p, description: opt }))}
                              style={{ opacity: selected ? 1 : 0.75 }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {productDraft.requiredFields.includes("price") ? (
                    <div>
                      <div className="theme-helper">Preço sugerido</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {productDraft.options.price.map((opt) => {
                          const selected = productSelection.price === opt;
                          return (
                            <button
                              key={String(opt)}
                              type="button"
                              className="ghost-btn"
                              onClick={() => setProductSelection((p) => ({ ...p, price: opt }))}
                              style={{ opacity: selected ? 1 : 0.75 }}
                            >
                              R$ {Number(opt).toFixed(2)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="table-actions" style={{ justifyContent: "flex-end", marginTop: 6 }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() =>
                        setProductSelection({
                          name: productDraft.suggested.name,
                          sku: productDraft.suggested.sku,
                          productCode: productDraft.suggested.productCode || "",
                          description: productDraft.suggested.description || "",
                          price: productDraft.suggested.price,
                        })
                      }
                    >
                      Usar sugestões
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {props.aiPlan.requiresConfirmation ? (
              <div className="table-actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={props.aiBusy || !isProductDraftComplete}
                  onClick={() => void props.handleAiExecute(executeOverrides)}
                >
                  Confirmar e executar
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="theme-helper">A prévia do plano aparecerá aqui.</p>
        )}
      </section>
    </section>
  );
}

