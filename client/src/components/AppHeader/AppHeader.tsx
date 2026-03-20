import type { Dispatch, SetStateAction } from "react";

import type { AuthUser, Business } from "../../types";

export type AppHeaderProps = {
  moduleMeta: Record<string, { label: string; short: string; helper: string }>;
  activeModule: string;

  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  selectModule: (key: string) => void;

  currentDate: string;
  workspaceId: string | null;
  selectedBusiness: Business | null;
  isGeneralWorkspace: boolean;
  pendingApprovalsCount: number;

  currentUser: AuthUser | null;

  loadAllData: () => Promise<void>;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  handleLogout: () => void;
};

export default function AppHeader(props: AppHeaderProps) {
  const activeMeta = props.moduleMeta[props.activeModule];

  return (
    <>
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <div className="brand-mark">E-S</div>
          <div>
            <strong>E-Sentinel</strong>
            <small>{activeMeta?.label}</small>
          </div>
        </div>
        <button
          className="ghost-btn mobile-menu-trigger"
          onClick={() => props.setMobileMenuOpen((prev) => !prev)}
        >
          {props.mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        </button>
      </header>

      {props.mobileMenuOpen ? (
        <section className="mobile-menu-panel">
          <nav className="menu mobile-menu-list">
            {Object.entries(props.moduleMeta).map(([key, meta]) => (
              <button
                key={key}
                className={props.activeModule === key ? "nav-button active" : "nav-button"}
                onClick={() => props.selectModule(key)}
              >
                <span className="nav-icon">{meta.short}</span>
                <span>
                  <strong>{meta.label}</strong>
                  <small>{meta.helper}</small>
                </span>
              </button>
            ))}
          </nav>
        </section>
      ) : null}

      <header className="content-header">
        <div>
          <h2>{activeMeta?.label}</h2>
          <p>
            {props.currentDate} -{" "}
            {props.workspaceId === "geral"
              ? "ERP Geral (consolidado)"
              : `ERP Especial: ${props.selectedBusiness?.name || props.workspaceId}`}
          </p>
          {!props.isGeneralWorkspace && props.pendingApprovalsCount > 0 ? (
            <p>{props.pendingApprovalsCount} item(ns) aguardando aprovacao automatizada.</p>
          ) : null}
        </div>
        <div className="header-actions">
          <button className="ghost-btn" onClick={() => void props.loadAllData()}>
            Atualizar dados
          </button>
          <button className="ghost-btn" onClick={() => props.setWorkspaceId(null)}>
            Trocar ERP
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              props.setMobileMenuOpen(false);
              props.handleLogout();
            }}
          >
            Sair ({props.currentUser?.name || "UsuÃ¡rio"})
          </button>
        </div>
      </header>
    </>
  );
}

