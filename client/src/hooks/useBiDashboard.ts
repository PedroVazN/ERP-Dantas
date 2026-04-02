import { useCallback, useEffect, useRef } from "react";

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
  selectedMonth: string;
}) {
  const loadDashboardBi = useCallback(
    async (silent = false) => {
      if (!params.workspaceId) return;

      try {
        if (silent) {
          params.setBiRefreshing(true);
        }

        const monthQuery = params.selectedMonth ? `?month=${encodeURIComponent(params.selectedMonth)}` : "";

        const [dashboardData, biData] = await Promise.all([
          api.get<Dashboard>(params.scopedPath(`/dashboard${monthQuery}`)),
          api.get<BiInsights>(params.scopedPath(`/bi/insights${monthQuery}`)),
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
      params.selectedMonth,
    ]
  );

  const prevMonthRef = useRef<string | null>(null);

  useEffect(() => {
    prevMonthRef.current = null;
  }, [params.workspaceId]);

  useEffect(() => {
    if (!params.isAuthenticated || !params.workspaceId || params.activeModule !== "dashboard") return;
    if (!params.selectedMonth) return;

    if (prevMonthRef.current === null) {
      prevMonthRef.current = params.selectedMonth;
      return;
    }

    if (prevMonthRef.current === params.selectedMonth) return;

    prevMonthRef.current = params.selectedMonth;
    void loadDashboardBi(false).catch((err) => {
      const message = err instanceof Error ? err.message : "Erro ao atualizar dashboard";
      params.setError(message);
    });
  }, [
    params.selectedMonth,
    params.workspaceId,
    params.activeModule,
    params.isAuthenticated,
    loadDashboardBi,
    params.setError,
  ]);

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

