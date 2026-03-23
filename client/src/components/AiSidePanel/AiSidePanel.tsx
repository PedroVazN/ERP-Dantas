import { useEffect } from "react";

import IaModule from "../../modules/IaModule";
import type { IaModuleProps } from "../../modules/IaModule";

export type AiSidePanelProps = {
  open: boolean;
  onClose: () => void;
  onToggleFab: () => void;
} & IaModuleProps;

export default function AiSidePanel({ open, onClose, onToggleFab, ...ia }: AiSidePanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`ai-side-panel-backdrop ${open ? "visible" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`ai-side-panel ${open ? "open" : ""}`}
        aria-label="Assistente de IA"
        aria-hidden={!open}
      >
        <div className="ai-side-panel-header">
          <div>
            <h2>IA operacional</h2>
            <small className="ai-side-panel-sub">Disponível em qualquer tela</small>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="ai-side-panel-body">
          <IaModule {...ia} variant="drawer" />
        </div>
      </aside>
      <button
        type="button"
        className="ai-panel-fab"
        onClick={onToggleFab}
        aria-label={open ? "Fechar assistente de IA" : "Abrir assistente de IA"}
        aria-expanded={open}
      >
        <span className="ai-panel-fab-text">{open ? "×" : "IA"}</span>
      </button>
    </>
  );
}
