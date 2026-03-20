import { useEffect, useMemo, useRef, useState } from "react";
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
  const purchaseDraft = props.aiPlan?.purchaseDraft;
  const recognitionRef = useRef<any>(null);

  type ProductDraftSelection = Partial<Record<AiProductDraftField, string | number>>;
  const [productSelection, setProductSelection] = useState<ProductDraftSelection>({});
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [useMatchedSupplier, setUseMatchedSupplier] = useState<boolean | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [customProductInputs, setCustomProductInputs] = useState<{
    name: string;
    sku: string;
    productCode: string;
    description: string;
    price: string;
  }>({
    name: "",
    sku: "",
    productCode: "",
    description: "",
    price: "",
  });

  useEffect(() => {
    if (!props.aiPlan?.planId) return;
    setProductSelection({});
    setSelectedSupplierId(null);
    setSelectedProductId(null);
    setUseMatchedSupplier(null);
    setCustomProductInputs({
      name: "",
      sku: "",
      productCode: "",
      description: "",
      price: "",
    });
  }, [props.aiPlan?.planId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setVoiceError(null);
      setVoiceListening(true);
    };
    recognition.onend = () => {
      setVoiceListening(false);
    };
    recognition.onerror = (event: any) => {
      const code = String(event?.error || "erro_desconhecido");
      if (code === "not-allowed" || code === "service-not-allowed") {
        setVoiceError("Permissao de microfone negada.");
      } else if (code === "no-speech") {
        setVoiceError("Nenhuma fala detectada. Tente novamente.");
      } else {
        setVoiceError(`Falha ao capturar voz (${code}).`);
      }
    };
    recognition.onresult = (event: any) => {
      const text = String(event?.results?.[0]?.[0]?.transcript || "").trim();
      if (!text) return;
      props.setAiInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);

    return () => {
      try {
        recognition.stop();
      } catch {
        // Ignora erros de parada durante unmount.
      }
      recognitionRef.current = null;
    };
  }, [props.setAiInput]);

  function toggleVoiceCapture() {
    if (!recognitionRef.current) return;
    setVoiceError(null);
    try {
      if (voiceListening) recognitionRef.current.stop();
      else recognitionRef.current.start();
    } catch {
      setVoiceError("Nao foi possivel iniciar a captura de voz.");
    }
  }

  const isProductDraftComplete = useMemo(() => {
    if (!productDraft) return true;
    return productDraft.requiredFields.every((field) => {
      const value = productSelection[field];
      return value !== undefined && value !== null && value !== "";
    });
  }, [productDraft, productSelection]);

  const selectedSupplierName = useMemo(() => {
    if (!purchaseDraft || !selectedSupplierId) return null;
    return purchaseDraft.supplierOptions.find((s) => s.supplierId === selectedSupplierId)?.supplierName || null;
  }, [purchaseDraft, selectedSupplierId]);

  const productsForSelectedSupplier = useMemo(() => {
    if (!purchaseDraft || purchaseDraft.mode !== "productFound" || !selectedSupplierId) return [];
    return purchaseDraft.productsBySupplierId[selectedSupplierId] || [];
  }, [purchaseDraft, selectedSupplierId]);

  const canExecute = useMemo(() => {
    if (!props.aiPlan) return false;
    if (!purchaseDraft) {
      // fallback: comportamento antigo (só produto)
      return isProductDraftComplete;
    }

    if (purchaseDraft.mode === "productFound") {
      if (useMatchedSupplier === true) return true;
      if (useMatchedSupplier === false) return Boolean(selectedProductId);
      return false;
    }

    if (purchaseDraft.mode === "productMissing") {
      return Boolean(selectedSupplierId) && isProductDraftComplete;
    }

    return false;
  }, [props.aiPlan, purchaseDraft, useMatchedSupplier, selectedProductId, selectedSupplierId, isProductDraftComplete]);

  const executeOverrides = useMemo(() => {
    if (!canExecute) return undefined;
    if (!purchaseDraft) return undefined;

    if (purchaseDraft.mode === "productFound") {
      const productIdToUse = useMatchedSupplier ? purchaseDraft.defaultProductId : selectedProductId;
      if (!productIdToUse) return undefined;
      return {
        createPurchase: {
          productId: productIdToUse,
        },
      };
    }

    if (purchaseDraft.mode === "productMissing") {
      if (!selectedSupplierId) return undefined;
      return {
        createProduct: {
          supplierId: selectedSupplierId,
          name: productSelection.name as string,
          sku: productSelection.sku as string,
          productCode: productSelection.productCode as string,
          description: productSelection.description as string,
          price: productSelection.price as number,
        },
      };
    }

    return undefined;
  }, [canExecute, purchaseDraft, useMatchedSupplier, selectedProductId, selectedSupplierId, productSelection]);

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
            {voiceSupported ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={toggleVoiceCapture}
                disabled={props.aiBusy}
                title={voiceListening ? "Parar captura de voz" : "Falar no microfone"}
              >
                {voiceListening ? "Parar voz" : "Falar"}
              </button>
            ) : null}
            <button type="button" onClick={() => void props.handleAiSend()} disabled={props.aiBusy}>
              {props.aiBusy ? "Processando..." : "Enviar"}
            </button>
          </div>
          {voiceSupported ? <small className="theme-helper">Use "Falar" para ditar o comando.</small> : null}
          {voiceError ? <small className="theme-helper">{voiceError}</small> : null}
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

            {purchaseDraft?.mode === "productFound" ? (
              <div className="ai-warning" style={{ marginTop: 16 }}>
                <strong>Fornecedor do produto:</strong> {purchaseDraft.defaultSupplierName}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setUseMatchedSupplier(true);
                      setSelectedSupplierId(purchaseDraft.defaultSupplierId);
                      setSelectedProductId(purchaseDraft.defaultProductId);
                    }}
                    disabled={props.aiBusy}
                    style={{ opacity: useMatchedSupplier === true ? 1 : 0.85 }}
                  >
                    Sim (usar este fornecedor)
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setUseMatchedSupplier(false);
                      setSelectedSupplierId(null);
                      setSelectedProductId(null);
                    }}
                    disabled={props.aiBusy}
                    style={{ opacity: useMatchedSupplier === false ? 1 : 0.85 }}
                  >
                    Nao (escolher outros)
                  </button>
                </div>

                {useMatchedSupplier === false ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="theme-helper">Escolha um fornecedor</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {purchaseDraft.supplierOptions.map((s) => {
                        const selected = selectedSupplierId === s.supplierId;
                        return (
                          <button
                            key={s.supplierId}
                            type="button"
                            className="ghost-btn"
                            onClick={() => {
                              setSelectedSupplierId(s.supplierId);
                              setSelectedProductId(null);
                            }}
                            style={{ opacity: selected ? 1 : 0.75 }}
                          >
                            {s.supplierName}
                          </button>
                        );
                      })}
                    </div>

                    {selectedSupplierId ? (
                      <div style={{ marginTop: 14 }}>
                        <div className="theme-helper">Produtos deste fornecedor</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          {productsForSelectedSupplier.length ? (
                            productsForSelectedSupplier.map((p) => {
                              const selected = selectedProductId === p.productId;
                              return (
                                <button
                                  key={p.productId}
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => setSelectedProductId(p.productId)}
                                  style={{ opacity: selected ? 1 : 0.75 }}
                                >
                                  {p.label}
                                </button>
                              );
                            })
                          ) : (
                            <p className="empty">Este fornecedor nao tem o produto identificado no cadastro.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {purchaseDraft?.mode === "productMissing" ? (
              <div className="ai-warning" style={{ marginTop: 16 }}>
                <strong>Escolha o fornecedor (direto do banco)</strong>
                {selectedSupplierName ? (
                  <p style={{ marginTop: 6 }}>Fornecedor selecionado: {selectedSupplierName}</p>
                ) : (
                  <p className="theme-helper" style={{ marginTop: 6 }}>
                    Preciso que voce selecione o fornecedor antes de executar.
                  </p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {purchaseDraft.supplierOptions.map((s) => {
                    const selected = selectedSupplierId === s.supplierId;
                    return (
                      <button
                        key={s.supplierId}
                        type="button"
                        className="ghost-btn"
                        onClick={() => setSelectedSupplierId(s.supplierId)}
                        disabled={props.aiBusy}
                        style={{ opacity: selected ? 1 : 0.75 }}
                      >
                        {s.supplierName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {productDraft ? (
              <div className="ai-product-draft" style={{ marginTop: 16 }}>
                <strong>Produto sugerido (clique para selecionar antes de executar)</strong>
                <p className="theme-helper" style={{ marginTop: 6 }}>
                  Se nao gostar, voce pode digitar um “outro” valor e aplicar.
                </p>

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
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                          placeholder="Digite outro nome"
                          value={customProductInputs.name}
                          onChange={(e) => setCustomProductInputs((p) => ({ ...p, name: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            const v = customProductInputs.name.trim();
                            if (!v) return;
                            setProductSelection((p) => ({ ...p, name: v }));
                          }}
                        >
                          Aplicar
                        </button>
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
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                          placeholder="Digite outro SKU"
                          value={customProductInputs.sku}
                          onChange={(e) => setCustomProductInputs((p) => ({ ...p, sku: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            const v = customProductInputs.sku.trim();
                            if (!v) return;
                            setProductSelection((p) => ({ ...p, sku: v }));
                          }}
                        >
                          Aplicar
                        </button>
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
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                          placeholder="Digite outro código"
                          value={customProductInputs.productCode}
                          onChange={(e) =>
                            setCustomProductInputs((p) => ({ ...p, productCode: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            const v = customProductInputs.productCode.trim();
                            if (!v) return;
                            setProductSelection((p) => ({ ...p, productCode: v }));
                          }}
                        >
                          Aplicar
                        </button>
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
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                          placeholder="Digite outra descrição"
                          value={customProductInputs.description}
                          onChange={(e) =>
                            setCustomProductInputs((p) => ({ ...p, description: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            const v = customProductInputs.description.trim();
                            if (!v) return;
                            setProductSelection((p) => ({ ...p, description: v }));
                          }}
                        >
                          Aplicar
                        </button>
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
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Digite outro preço"
                          value={customProductInputs.price}
                          onChange={(e) => setCustomProductInputs((p) => ({ ...p, price: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            const v = Number(customProductInputs.price);
                            if (!Number.isFinite(v)) return;
                            setProductSelection((p) => ({ ...p, price: v }));
                          }}
                        >
                          Aplicar
                        </button>
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
                  disabled={props.aiBusy || !canExecute}
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

