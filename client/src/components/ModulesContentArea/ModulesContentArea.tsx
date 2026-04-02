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
  viewerOnly: boolean;
  totalOpenReceivables: number;
  formatPct: DashboardPanelProps["formatPct"];
  maxTimeseriesValue: DashboardPanelProps["maxTimeseriesValue"];
  maxTopProductValue: DashboardPanelProps["maxTopProductValue"];
  maxCostCategoryValue: DashboardPanelProps["maxCostCategoryValue"];
  selectModule: DashboardPanelProps["selectModule"];
  dashboardMonth: string;
  setDashboardMonth: (value: string) => void;
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
    viewerOnly,
    totalOpenReceivables,
    products,
    formatBRL,
    formatPct,
    maxTimeseriesValue,
    maxTopProductValue,
    maxCostCategoryValue,
    selectModule,
    dashboardMonth,
    setDashboardMonth,
    ...activeModuleRendererProps
  } = props;

  return (
    <>
      {loading && <p className="feedback">Carregando dados...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && activeModule === "dashboard" && dashboard && biInsights ? (
        <DashboardPanel
          dashboard={dashboard}
          products={products}
          biInsights={biInsights}
          biRefreshing={biRefreshing}
          realSalesCount={realSalesCount}
          realPurchasesCount={realPurchasesCount}
          viewerOnly={viewerOnly}
          totalOpenReceivables={totalOpenReceivables}
          formatBRL={formatBRL}
          formatPct={formatPct}
          maxTimeseriesValue={maxTimeseriesValue}
          maxTopProductValue={maxTopProductValue}
          maxCostCategoryValue={maxCostCategoryValue}
          selectModule={selectModule}
          selectedMonth={dashboardMonth}
          setSelectedMonth={setDashboardMonth}
          // Note: DashboardPanel already receives helpers/handlers via its own props;
          // module actions are handled by selectModule.
        />
      ) : null}

      <ActiveModuleRenderer
        loading={loading}
        activeModule={activeModule}
        products={products}
        // `formatBRL` é necessário por vários módulos (ex.: ProdutosModule).
        formatBRL={formatBRL}
        {...(activeModuleRendererProps as any)}
      />
    </>
  );
}

