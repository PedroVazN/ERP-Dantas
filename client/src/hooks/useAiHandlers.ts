import type { Dispatch, SetStateAction } from "react";

import { api } from "../api";

import type { AiMessage, AiPlan } from "../aiTypes";

type AiPlanState = AiPlan | null;

export function useAiHandlers(deps: {
  workspaceId: string | null;
  scopedPath: (path: string) => string;

  aiInput: string;
  setAiInput: Dispatch<SetStateAction<string>>;

  aiBusy: boolean;
  setAiBusy: Dispatch<SetStateAction<boolean>>;

  aiPlan: AiPlanState;
  setAiPlan: Dispatch<SetStateAction<AiPlanState>>;

  setAiMessages: Dispatch<SetStateAction<AiMessage[]>>;
  setError: Dispatch<SetStateAction<string>>;
}) {
  async function handleAiSend() {
    const text = deps.aiInput.trim();
    if (!text || deps.aiBusy) return;
    if (!deps.workspaceId) {
      deps.setError("Selecione um ERP antes de usar a IA.");
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    deps.setAiMessages((prev) => [...prev, { id, role: "user", content: text }]);
    deps.setAiInput("");
    deps.setAiBusy(true);
    deps.setError("");

    try {
      const response = await api.post<{
        planId: string;
        status: "READY" | "NEEDS_INFO" | "ERROR";
        source: string;
        summary: string;
        warnings: string[];
        requiresConfirmation: boolean;
        questions?: string[];
        actionsPreview?: string[];
        productDraft?: AiPlan["productDraft"];
      }>(deps.scopedPath("/ai/plan"), { message: text });

      deps.setAiPlan({
        planId: response.planId,
        status: response.status,
        source: response.source,
        summary: response.summary,
        warnings: response.warnings || [],
        requiresConfirmation: response.requiresConfirmation,
        questions: response.questions,
        actionsPreview: response.actionsPreview,
        productDraft: response.productDraft,
      });

      if (response.status === "READY") {
        deps.setAiMessages((prev) => [
          ...prev,
          {
            id: `${id}-a`,
            role: "assistant",
            content: `Plano pronto. ${response.summary}`,
          },
        ]);
      } else if (response.status === "NEEDS_INFO") {
        const q = response.questions?.join("\n") || "Me explique melhor.";
        deps.setAiMessages((prev) => [
          ...prev,
          { id: `${id}-a`, role: "assistant", content: `Preciso de:\n${q}` },
        ]);
      } else {
        deps.setAiMessages((prev) => [
          ...prev,
          { id: `${id}-a`, role: "assistant", content: response.summary || "Erro no planejamento." },
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao chamar IA.";
      deps.setError(message);
      deps.setAiMessages((prev) => [...prev, { id: `${id}-a`, role: "assistant", content: message }]);
    } finally {
      deps.setAiBusy(false);
    }
  }

  async function handleAiExecute(overrides?: unknown) {
    if (!deps.aiPlan || deps.aiBusy) return;
    deps.setAiBusy(true);
    deps.setError("");

    try {
      const response = await api.post<{
        ok: boolean;
        planId: string;
        executedAt: string;
        results: Record<string, unknown>;
        warnings: string[];
        error?: string;
      }>(deps.scopedPath("/ai/execute"), {
        planId: deps.aiPlan.planId,
        confirm: true,
        overrides,
      });

      const resultsText = response.ok
        ? `Executado com sucesso. Resultados: ${
            Object.keys(response.results || {}).join(", ") || "ok"
          }`
        : response.error || "Falha ao executar.";

      deps.setAiMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: "assistant", content: resultsText },
      ]);
      deps.setAiPlan(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao executar IA.";
      deps.setError(message);
      deps.setAiMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: "assistant", content: message },
      ]);
    } finally {
      deps.setAiBusy(false);
    }
  }

  return { handleAiSend, handleAiExecute };
}

