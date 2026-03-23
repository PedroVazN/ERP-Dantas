import type { BiInsights } from "../../types";

import DashboardPanel, { type DashboardPanelProps } from "../DashboardPanel/DashboardPanel";
import ActiveModuleRenderer, {
  type ActiveModuleRendererProps,
} from "../ActiveModuleRenderer/ActiveModuleRenderer";

export type ModulesContentAreaProps = Omit<ActiveModuleRendererProps, "loading" | "activeModule"> & {
  loading: boolean;
  error: string;
  activeModule: ActiveModuleRendererProps["activeModule"];

  dashboard: DashboardPanelProps["dashboard"] | null;
  biInsights: BiInsights | null;
  biRefreshing: boolean;
  realSalesCount: number;
  realPurchasesCount: number;
  realCriticalStockCount: number;
  pendingReceivablesCount: number;
  overdueExpensesCount: number;
  overdueExpensesTotal: number;
  opsReminderEnabled: boolean;
  opsReminderSending: boolean;
  opsReminderSentToday: boolean;
  sendOpsReminder: () => Promise<void> | void;
  totalOpenReceivables: number;
  formatPct: DashboardPanelProps["formatPct"];
  maxTimeseriesValue: DashboardPanelProps["maxTimeseriesValue"];
  maxTopProductValue: DashboardPanelProps["maxTopProductValue"];
  maxCostCategoryValue: DashboardPanelProps["maxCostCategoryValue"];
  selectModule: DashboardPanelProps["selectModule"];
};

export default function ModulesContentArea(props: ModulesContentAreaProps) {
  const {
    loading,
    error,
    activeModule,
    dashboard,
    biInsights,
    biRefreshing,
    realSalesCount,
    realPurchasesCount,
    realCriticalStockCount,
    pendingReceivablesCount,
    overdueExpensesCount,
    overdueExpensesTotal,
    opsReminderEnabled,
    opsReminderSending,
    opsReminderSentToday,
    sendOpsReminder,
    totalOpenReceivables,
    formatBRL,
    formatPct,
    maxTimeseriesValue,
    maxTopProductValue,
    maxCostCategoryValue,
    selectModule,
    ...activeModuleRendererProps
  } = props;

  return (
    <>
      {loading && <p className="feedback">Carregando dados...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && activeModule === "dashboard" && dashboard && biInsights ? (
        <DashboardPanel
          dashboard={dashboard}
          biInsights={biInsights}
          biRefreshing={biRefreshing}
          realSalesCount={realSalesCount}
          realPurchasesCount={realPurchasesCount}
          realCriticalStockCount={realCriticalStockCount}
          pendingReceivablesCount={pendingReceivablesCount}
          overdueExpensesCount={overdueExpensesCount}
          overdueExpensesTotal={overdueExpensesTotal}
          opsReminderEnabled={opsReminderEnabled}
          opsReminderSending={opsReminderSending}
          opsReminderSentToday={opsReminderSentToday}
          sendOpsReminder={sendOpsReminder}
          totalOpenReceivables={totalOpenReceivables}
          formatBRL={formatBRL}
          formatPct={formatPct}
          maxTimeseriesValue={maxTimeseriesValue}
          maxTopProductValue={maxTopProductValue}
          maxCostCategoryValue={maxCostCategoryValue}
          selectModule={selectModule}
          // Note: DashboardPanel already receives helpers/handlers via its own props;
          // module actions are handled by selectModule.
        />
      ) : null}

      <ActiveModuleRenderer
        loading={loading}
        activeModule={activeModule}
        // `formatBRL` é necessário por vários módulos (ex.: ProdutosModule).
        formatBRL={formatBRL}
        {...(activeModuleRendererProps as any)}
      />
    </>
  );
}

