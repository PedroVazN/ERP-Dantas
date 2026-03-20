import type { Dispatch, SetStateAction, FormEvent } from "react";

import { api } from "../api";
import type { Settings, Theme, WhatsAppStatus } from "../types";

export function useUserHandlers(deps: {
  setTheme: Dispatch<SetStateAction<Theme>>;
  setSettings: Dispatch<SetStateAction<Settings | null>>;
  setError: Dispatch<SetStateAction<string>>;

  setWhatsAppStatus: Dispatch<SetStateAction<WhatsAppStatus | null>>;

  whatsAppForm: { phone: string; message: string };
  setWhatsAppForm: Dispatch<
    SetStateAction<{
      phone: string;
      message: string;
    }>
  >;
}) {
  async function handleThemeChange(nextTheme: Theme) {
    deps.setTheme(nextTheme);
    try {
      const newSettings = await api.put<Settings>("/settings/theme", { theme: nextTheme });
      deps.setSettings(newSettings);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao trocar tema";
      deps.setError(message);
    }
  }

  async function loadWhatsAppStatus() {
    try {
      const status = await api.get<WhatsAppStatus>("/integrations/whatsapp/status");
      deps.setWhatsAppStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao consultar status do WhatsApp.";
      deps.setError(message);
    }
  }

  async function sendManualWhatsAppMessage(event: FormEvent) {
    event.preventDefault();
    if (!deps.whatsAppForm.phone.trim() || !deps.whatsAppForm.message.trim()) {
      deps.setError("Preencha telefone e mensagem para enviar no WhatsApp.");
      return;
    }
    try {
      await api.post<{ sent: boolean; phone: string; provider: string }>("/integrations/whatsapp/send", {
        phone: deps.whatsAppForm.phone.trim(),
        message: deps.whatsAppForm.message.trim(),
      });
      deps.setWhatsAppForm((prev) => ({ ...prev, message: "" }));
      await loadWhatsAppStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem manual no WhatsApp.";
      deps.setError(message);
    }
  }

  return { handleThemeChange, loadWhatsAppStatus, sendManualWhatsAppMessage };
}

