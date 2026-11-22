import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import type { SidebarAccountMenuProps } from "./sidebar-account-menu";

type StorageModeSwitchProps = SidebarAccountMenuProps & {
  entered: boolean;
  checking: boolean;
  email?: string;
  accountMode: boolean;
  onToggleMode: () => void;
  onContinueLocal: () => void;
  feedback: ReactNode;
};

export function StorageModeSwitch({
  entered,
  checking,
  configured,
  hasSession,
  email,
  accountMode,
  busy,
  onToggleMode,
  onLogout,
  onOpenForm,
  onContinueLocal,
  feedback,
}: StorageModeSwitchProps) {
  let description =
    "Com conta, acedes às carteiras noutros dispositivos. Sem sessão, ficam neste navegador.";
  if (hasSession) description = email ?? "";
  else if (entered)
    description = "As carteiras locais ficam só neste navegador.";

  return (
    <section
      className="account-controls no-print"
      aria-label="Conta e armazenamento"
    >
      <div className="account-description">
        {entered ? <strong>Conta</strong> : null}
        <p>{description}</p>
      </div>
      <div className="account-actions">
        {checking ? (
          <span>A verificar sessão…</span>
        ) : hasSession ? (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={onToggleMode}
            >
              {accountMode ? "Usar modo local" : "Abrir carteiras da conta"}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void onLogout()}
            >
              Sair da conta
            </button>
          </>
        ) : configured ? (
          <>
            <button
              className={`button ${entered ? "primary" : "entry-option"}`}
              aria-label="Iniciar sessão"
              disabled={busy}
              onClick={() => onOpenForm("login")}
            >
              {!entered && (
                <span className="entry-option-icon">
                  <Icon name="shield" />
                </span>
              )}
              <span>
                Iniciar sessão
                {!entered && (
                  <small>
                    Acede às tuas carteiras em qualquer dispositivo.
                  </small>
                )}
              </span>
              {!entered && (
                <span
                  className="entry-option-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </button>
            <button
              className={`button ${entered ? "secondary" : "entry-option"}`}
              aria-label="Criar conta"
              disabled={busy}
              onClick={() => onOpenForm("register")}
            >
              {!entered && (
                <span className="entry-option-icon purple">
                  <Icon name="plus" />
                </span>
              )}
              <span>
                Criar conta
                {!entered && (
                  <small>Guarda os investimentos na tua conta.</small>
                )}
              </span>
              {!entered && (
                <span
                  className="entry-option-arrow"
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </button>
          </>
        ) : (
          <span className="subtle">
            As contas estão indisponíveis. Podes continuar no modo local.
          </span>
        )}
        {!entered && !checking && (
          <>
            {configured && (
              <div
                className="entry-divider"
                aria-hidden="true"
              >
                ou
              </div>
            )}
            <button
              className="button secondary entry-local"
              aria-label="Continuar sem sessão"
              disabled={busy}
              onClick={onContinueLocal}
            >
              Continuar sem sessão <span aria-hidden="true">→</span>
            </button>
          </>
        )}
      </div>
      {feedback}
    </section>
  );
}
