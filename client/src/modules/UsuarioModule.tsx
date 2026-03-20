import type { Theme, WhatsAppStatus } from "../types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type UserFormState = {
  userName: string;
  userEmail: string;
  userRole: string;
  companyName: string;
};

type WhatsAppFormState = { phone: string; message: string };

export type UsuarioModuleProps = {
  submitUserProfile: (event: FormEvent) => Promise<void> | void;
  userForm: UserFormState;
  setUserForm: Dispatch<SetStateAction<UserFormState>>;
  themeOptions: Array<{ value: Theme; label: string; description: string }>;
  theme: Theme;
  handleThemeChange: (next: Theme) => void;

  whatsAppStatus: WhatsAppStatus | null;
  whatsAppForm: WhatsAppFormState;
  setWhatsAppForm: Dispatch<SetStateAction<WhatsAppFormState>>;
  sendManualWhatsAppMessage: (event: FormEvent) => Promise<void> | void;
  loadWhatsAppStatus: () => Promise<void> | void;
};

export default function UsuarioModule(props: UsuarioModuleProps) {
  return (
    <section className="module-grid animated user-grid">
      <form className="form-card" onSubmit={props.submitUserProfile}>
        <h3>Gestão do usuário</h3>
        <div className="form-field">
          <label>Nome do usuário</label>
          <small className="field-help">Como você quer aparecer no sistema e nas aprovações.</small>
          <input
            placeholder="ex.: Administrador"
            value={props.userForm.userName}
            onChange={(event) => props.setUserForm({ ...props.userForm, userName: event.target.value })}
            required
          />
        </div>
        <div className="form-field">
          <label>E-mail</label>
          <small className="field-help">E-mail do responsável (usado em comunicação/relatórios).</small>
          <input
            type="email"
            placeholder="ex.: admin@empresa.com"
            value={props.userForm.userEmail}
            onChange={(event) => props.setUserForm({ ...props.userForm, userEmail: event.target.value })}
            required
          />
        </div>
        <div className="form-field">
          <label>Cargo</label>
          <small className="field-help">Seu papel (ex.: Gestor, Financeiro).</small>
          <input
            placeholder="ex.: Gestor"
            value={props.userForm.userRole}
            onChange={(event) => props.setUserForm({ ...props.userForm, userRole: event.target.value })}
          />
        </div>
        <div className="form-field">
          <label>Nome da empresa</label>
          <small className="field-help">Nome exibido no cabeçalho e no módulo do usuário.</small>
          <input
            placeholder="ex.: E-Sentinel Sabonetes"
            value={props.userForm.companyName}
            onChange={(event) => props.setUserForm({ ...props.userForm, companyName: event.target.value })}
          />
        </div>
        <button type="submit">Salvar perfil</button>
      </form>

      <section className="table-card">
        <h3>Tema da interface</h3>
        <p className="theme-helper">Escolha um dos 6 temas elegantes e aplique imediatamente no seu ERP.</p>
        <div className="theme-cards">
          {props.themeOptions.map((option) => (
            <button
              key={option.value}
              className={props.theme === option.value ? "theme-card active" : "theme-card"}
              onClick={() => props.handleThemeChange(option.value)}
            >
              <span className={`theme-preview ${option.value}`}></span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="table-card whatsapp-card">
        <h3>WhatsApp Business</h3>
        <p className="theme-helper">
          Integração nativa do sistema para notificações operacionais, envio manual e cobranças.
        </p>

        <div className="whatsapp-status">
          <span>
            Status:{" "}
            <strong>{props.whatsAppStatus?.configured ? "Conectado" : "Não configurado"}</strong>
          </span>
          <span>
            Notificação interna: <strong>{props.whatsAppStatus?.notifyTo || "Não definido"}</strong>
          </span>
        </div>

        <form className="whatsapp-form" onSubmit={props.sendManualWhatsAppMessage}>
          <div className="form-field">
            <label>Telefone de destino</label>
            <small className="field-help">DDD + número. Ex.: 11999999999.</small>
            <input
              placeholder="ex.: 11999999999"
              value={props.whatsAppForm.phone}
              onChange={(event) =>
                props.setWhatsAppForm({ ...props.whatsAppForm, phone: event.target.value })
              }
              required
            />
          </div>
          <div className="form-field">
            <label>Mensagem</label>
            <small className="field-help">Texto que será enviado pelo WhatsApp Business.</small>
            <textarea
              rows={4}
              placeholder="Digite sua mensagem..."
              value={props.whatsAppForm.message}
              onChange={(event) =>
                props.setWhatsAppForm({ ...props.whatsAppForm, message: event.target.value })
              }
              required
            />
          </div>
          <div className="table-actions">
            <button type="submit" className="ghost-btn">
              Enviar mensagem
            </button>
            <button type="button" className="ghost-btn" onClick={() => props.loadWhatsAppStatus()}>
              Atualizar status
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

