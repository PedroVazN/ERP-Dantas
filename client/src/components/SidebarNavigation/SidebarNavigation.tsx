export type SidebarModuleMeta = Record<string, { label: string; short: string; helper: string }>;

export type SidebarNavigationProps = {
  moduleMeta: SidebarModuleMeta;
  activeModule: string;
  selectModule: (key: string) => void;
  companyName: string;
};

export default function SidebarNavigation(props: SidebarNavigationProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">E-S</div>
        <div>
          <h1>E-Sentinel</h1>
          <p>{props.companyName}</p>
        </div>
      </div>

      <nav className="menu">
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

      <div className="theme-switch">
        <small>Personalize o visual no módulo de usuário.</small>
        <button className="ghost-btn" onClick={() => props.selectModule("usuario")}>
          Abrir preferências
        </button>
      </div>
    </aside>
  );
}

