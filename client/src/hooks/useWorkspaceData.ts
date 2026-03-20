import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { api } from "../api";
import type {
  Business,
  ChecklistItem,
  Customer,
  EconomicIndicators,
  Expense,
  Product,
  Purchase,
  Sale,
  Settings,
  Supplier,
  Theme,
} from "../types";

export function useWorkspaceData(params: {
  workspaceId: string | null;
  scopedPath: (path: string) => string;

  // BI
  loadDashboardBi: (silent?: boolean) => Promise<void>;

  // Flags / errors
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setAuthError: Dispatch<SetStateAction<string>>;
  setWorkspaceLoading: Dispatch<SetStateAction<boolean>>;

  // Entities
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  setProducts: Dispatch<SetStateAction<Product[]>>;
  setSales: Dispatch<SetStateAction<Sale[]>>;
  setPurchases: Dispatch<SetStateAction<Purchase[]>>;
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setChecklistItems: Dispatch<SetStateAction<ChecklistItem[]>>;
  setEconomicIndicators: Dispatch<SetStateAction<EconomicIndicators | null>>;
  setSettings: Dispatch<SetStateAction<Settings | null>>;
  setTheme: Dispatch<SetStateAction<Theme>>;

  // Businesses / workspace selection
  businessKey: string;
  setBusinesses: Dispatch<SetStateAction<Business[]>>;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    workspaceId,
    scopedPath,
    loadDashboardBi,
    setLoading,
    setError,
    setAuthError,
    setWorkspaceLoading,
    setCustomers,
    setProducts,
    setSales,
    setPurchases,
    setSuppliers,
    setExpenses,
    setChecklistItems,
    setEconomicIndicators,
    setSettings,
    setTheme,
    businessKey,
    setBusinesses,
    setWorkspaceId,
  } = params;

  const loadBusinesses = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const data = await api.get<Business[]>("/businesses");
      setBusinesses(data);

      const storedWorkspace = localStorage.getItem(businessKey);
      if (storedWorkspace && data.some((item) => item.businessId === storedWorkspace)) {
        setWorkspaceId(storedWorkspace);
      } else if (data.length > 0) {
        setWorkspaceId(data[0].businessId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar ERPs";
      setAuthError(message);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [businessKey, setAuthError, setBusinesses, setWorkspaceId, setWorkspaceLoading]);

  const loadAllData = useCallback(async () => {
    if (!workspaceId) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [
        customersData,
        productsData,
        salesData,
        purchasesData,
        suppliersData,
        expensesData,
        checklistData,
        economicData,
        settingsData,
      ] = await Promise.all([
        api.get<Customer[]>(scopedPath("/customers")),
        api.get<Product[]>(scopedPath("/products")),
        api.get<Sale[]>(scopedPath("/sales")),
        api.get<Purchase[]>(scopedPath("/purchases")),
        api.get<Supplier[]>(scopedPath("/suppliers")),
        api.get<Expense[]>(scopedPath("/expenses")),
        api.get<ChecklistItem[]>(scopedPath("/checklist-items")),
        api.get<EconomicIndicators>("/economic/indicators"),
        api.get<Settings>("/settings"),
      ]);

      await loadDashboardBi(true);

      setCustomers(customersData);
      setProducts(productsData);
      setSales(salesData);
      setPurchases(purchasesData);
      setSuppliers(suppliersData);
      setExpenses(expensesData);
      setChecklistItems(checklistData);
      setEconomicIndicators(economicData);
      setSettings(settingsData);
      setTheme(settingsData.theme || "claro");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    workspaceId,
    scopedPath,
    loadDashboardBi,
    setCustomers,
    setProducts,
    setSales,
    setPurchases,
    setSuppliers,
    setExpenses,
    setChecklistItems,
    setEconomicIndicators,
    setSettings,
    setTheme,
    setLoading,
    setError,
  ]);

  return { loadBusinesses, loadAllData };
}

