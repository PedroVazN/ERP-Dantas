import type { ReactNode } from "react";

export type AppModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function AppModal(props: AppModalProps) {
  return (
    <div className="app-modal-overlay" onClick={props.onClose}>
      <div className="app-modal" onClick={(event) => event.stopPropagation()}>
        <div className="app-modal-header">
          <div>
            <h3>{props.title}</h3>
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          <button type="button" className="ghost-btn" onClick={props.onClose}>
            Fechar
          </button>
        </div>
        <div className="app-modal-body">{props.children}</div>
      </div>
    </div>
  );
}

