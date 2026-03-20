import { useCallback, useEffect } from "react";

import { api } from "../api";
import type { BiInsights, Dashboard } from "../types";
import type { Dispatch, SetStateAction } from "react";

export function useBiDashboard(params: {
  workspaceId: string | null;
  isAuthenticated: boolean;
  activeModule: string;
  scopedPath: (path: string) => string;
  setDashboard: Dispatch<SetStateAction<Dashboard | null>>;
  setBiInsights: Dispatch<SetStateAction<BiInsights | null>>;
  setBiRefreshing: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
}) {
  const loadDashboardBi = useCallback(
    async (silent = false) => {
      if (!params.workspaceId) return;

      try {
        if (silent) {
          params.setBiRefreshing(true);
        }

        const [dashboardData, biData] = await Promise.all([
          api.get<Dashboard>(params.scopedPath("/dashboard")),
          api.get<BiInsights>(params.scopedPath("/bi/insights")),
        ]);

        params.setDashboard(dashboardData);
        params.setBiInsights(biData);
      } finally {
        if (silent) {
          params.setBiRefreshing(false);
        }
      }
    },
    [
      params.workspaceId,
      params.scopedPath,
      params.setDashboard,
      params.setBiInsights,
      params.setBiRefreshing,
    ]
  );

  useEffect(() => {
    if (!params.isAuthenticated || !params.workspaceId || params.activeModule !== "dashboard") return;

    const intervalId = window.setInterval(() => {
      void loadDashboardBi(true).catch((err) => {
        const message = err instanceof Error ? err.message : "Erro ao atualizar BI";
        params.setError(message);
      });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [params.isAuthenticated, params.workspaceId, params.activeModule, loadDashboardBi, params.setError]);

  return { loadDashboardBi };
}

