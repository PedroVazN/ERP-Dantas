import { useEffect } from "react";

import type { AuthUser } from "../types";

export function useWorkspaceSession(params: {
  SESSION_KEY: string;
  BUSINESS_KEY: string;

  isAuthenticated: boolean;
  workspaceId: string | null;

  setAuthChecking: (next: boolean) => void;
  setIsAuthenticated: (next: boolean) => void;
  setCurrentUser: (u: AuthUser | null) => void;

  setMobileMenuOpen: (next: boolean) => void;

  loadBusinesses: () => Promise<void>;
  loadAllData: () => Promise<void>;
}) {
  const {
    SESSION_KEY,
    BUSINESS_KEY,
    isAuthenticated,
    workspaceId,
    setAuthChecking,
    setIsAuthenticated,
    setCurrentUser,
    setMobileMenuOpen,
    loadBusinesses,
    loadAllData,
  } = params;

  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const parsed = JSON.parse(session) as { token: string; user: AuthUser };
        if (parsed?.token && parsed?.user) {
          setCurrentUser(parsed.user);
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setAuthChecking(false);
  }, [SESSION_KEY, setAuthChecking, setCurrentUser, setIsAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadBusinesses();
  }, [isAuthenticated, loadBusinesses]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    localStorage.setItem(BUSINESS_KEY, workspaceId);
    void loadAllData();
  }, [isAuthenticated, workspaceId, loadAllData, BUSINESS_KEY]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [workspaceId, setMobileMenuOpen]);
}

