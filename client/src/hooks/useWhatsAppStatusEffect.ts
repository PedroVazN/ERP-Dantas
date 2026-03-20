import { useEffect } from "react";

export function useWhatsAppStatusEffect(params: {
  isAuthenticated: boolean;
  activeModule: string;
  loadWhatsAppStatus: () => Promise<void> | void;
}) {
  useEffect(() => {
    if (!params.isAuthenticated || params.activeModule !== "usuario") return;
    void params.loadWhatsAppStatus();
  }, [params.activeModule, params.isAuthenticated]);
}

