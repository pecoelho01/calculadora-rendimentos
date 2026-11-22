import { Icon } from "@/components/icon";
import type { AuthFormKind } from "./session-types";

export type SidebarAccountMenuProps = {
  hasSession: boolean;
  configured: boolean;
  busy: boolean;
  onLogout: () => Promise<void>;
  onOpenForm: (kind: AuthFormKind) => void;
};

export function SidebarAccountMenu({
  hasSession,
  configured,
  busy,
  onLogout,
  onOpenForm,
}: SidebarAccountMenuProps) {
  return hasSession ? (
    <>
      <button
        className="nav-item"
        disabled={busy}
        onClick={() => void onLogout()}
      >
        <Icon name="logout" />
        <span className="nav-label">Sair da conta</span>
      </button>
    </>
  ) : (
    <section
      className="sidebar-account"
      aria-label="Acesso à conta"
    >
      {configured ? (
        <>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onOpenForm("login")}
          >
            Iniciar sessão
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => onOpenForm("register")}
          >
            Criar conta
          </button>
        </>
      ) : (
        <p className="subtle">
          As contas estão indisponíveis. Podes continuar no modo local.
        </p>
      )}
    </section>
  );
}
