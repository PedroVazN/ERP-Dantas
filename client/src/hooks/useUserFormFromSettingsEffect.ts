import { useEffect } from "react";
import type { Settings } from "../types";

type UserFormState = {
  userName: string;
  userEmail: string;
  userRole: string;
  companyName: string;
};

export function useUserFormFromSettingsEffect(params: {
  settings: Settings | null;
  setUserForm: (next: UserFormState) => void;
}) {
  useEffect(() => {
    if (!params.settings) return;
    params.setUserForm({
      userName: params.settings.userName || "Administrador",
      userEmail: params.settings.userEmail || "",
      userRole: params.settings.userRole || "Gestor",
      companyName: params.settings.companyName || "E-Sentinel Sabonetes",
    });
  }, [params.settings, params.setUserForm]);
}

