import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "../shared/icon";
import { ChartPeriodSelector } from "../shared/chart-period-selector";
import { ThemeSelector } from "../shared/theme-selector";

type AccountSettingsProps = {
  children?: ReactNode;
  accountControls?: ReactNode;
  accountFeedback?: ReactNode;
  isAccountMode: boolean;
  message: string;
  saveState: "saving" | "saved" | "error";
  canMigrate: boolean;
  hasPortfolios: boolean;
  storageBroken: boolean;
  onDismissMessage: () => void;
  onReloadAccount: () => Promise<void>;
  onMigrateLocal: () => Promise<void>;
  onExportBackup: () => void;
};

const saveStatusLabels = {
  saving: "A guardar ou carregar carteiras…",
  error:
    "Erro ao guardar ou carregar. Verifica o aviso e recarrega os dados antes de repetir.",
  saved: "Guardado na conta",
};

export function AccountSettings({
  children,
  accountControls,
  accountFeedback,
  isAccountMode,
  message,
  saveState,
  canMigrate,
  hasPortfolios,
  storageBroken,
  onDismissMessage,
  onReloadAccount,
  onMigrateLocal,
  onExportBackup,
}: AccountSettingsProps) {
  const saveStatusLabel = saveStatusLabels[saveState];

  return (
    <>
      {children}
      {message ? (
        <div
          className="notice"
          role={saveState === "error" ? "alert" : "status"}
        >
          <span>{message}</span>
          <button
            aria-label="Fechar aviso"
            onClick={onDismissMessage}
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}
      {isAccountMode ? (
        <p
          className="account-save-status"
          role="status"
        >
          {saveStatusLabel}
        </p>
      ) : null}
      <div className="account-settings-grid">
        <div>
          {accountControls ?? (
            <section className="account-controls">
              <div className="account-description">
                <strong>Modo local</strong>
                <p>
                  As carteiras ficam apenas neste navegador. Inicia sessão pelo
                  menu para aceder às carteiras da tua conta.
                </p>
              </div>
            </section>
          )}
          {accountControls ? null : accountFeedback}
          <section className="panel settings-card">
            <h2>Preferências</h2>
            <p>Personaliza a aparência do teu espaço.</p>
            <div className="settings-row">
              <div>
                <strong>Aparência</strong>
                <span>
                  Escolhe o tema claro, escuro ou segue o sistema do
                  dispositivo.{" "}
                  {isAccountMode
                    ? "Guardado na tua conta."
                    : "Guardado neste dispositivo."}
                </span>
              </div>
              <ThemeSelector />
            </div>
            <div className="settings-row">
              <div>
                <strong>Período predefinido do gráfico</strong>
                <span>
                  Período apresentado ao abrir o gráfico de rentabilidade.{" "}
                  {isAccountMode
                    ? "Guardado na tua conta."
                    : "Guardado neste dispositivo."}
                </span>
              </div>
              <ChartPeriodSelector />
            </div>
            <div className="settings-row">
              <div>
                <strong>Armazenamento das carteiras</strong>
                <span>
                  {isAccountMode
                    ? "Carteiras guardadas na tua conta."
                    : "Carteiras guardadas neste navegador."}{" "}
                  Os modos local e conta são independentes.
                </span>
              </div>
            </div>
          </section>
          {isAccountMode ? (
            <section className="panel settings-card">
              <h2>Carteiras da conta</h2>
              <p>
                Recarrega os dados ou copia as carteiras locais após
                confirmação.
              </p>
              <div className="account-actions settings-row">
                <button
                  className="button secondary"
                  disabled={saveState === "saving"}
                  onClick={() => void onReloadAccount()}
                >
                  Recarregar dados da conta
                </button>
                <button
                  className="button secondary"
                  disabled={!canMigrate}
                  onClick={() => void onMigrateLocal()}
                >
                  Copiar carteiras locais para a conta
                </button>
              </div>
            </section>
          ) : null}
        </div>
        <aside className="panel settings-card">
          <div className="settings-illustration">
            <Icon name="shield" />
          </div>
          <span className="eyebrow">PROTEÇÃO DOS TEUS DADOS</span>
          <h2>As tuas carteiras, sob o teu controlo.</h2>
          <p>
            Acede aos investimentos através da tua conta ou mantém os dados
            neste navegador, em modo local. Cada carteira mantém a sua moeda,
            sem conversão automática.
          </p>
          <div className="settings-backup">
            <h2>Guarda o teu histórico</h2>
            <p>
              Exporta uma cópia JSON das carteiras do modo ativo para poderes
              recuperar os teus dados.
            </p>
            <button
              className="button secondary"
              disabled={!hasPortfolios}
              onClick={onExportBackup}
            >
              <Icon name="download" /> Exportar backup JSON
            </button>
          </div>
        </aside>
      </div>
      {storageBroken ? (
        <div
          className="notice"
          role="alert"
        >
          <span>
            Não foi possível ler o armazenamento local. Recupera os dados antes
            de alterar as carteiras.
          </span>
          <Link
            className="button secondary"
            href="/"
          >
            Recuperar carteiras
          </Link>
        </div>
      ) : null}
    </>
  );
}
