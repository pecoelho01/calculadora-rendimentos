"use client";

import Link from "next/link";
import { usePortfoliosContext } from "../_components/portfolios-provider";
import { useWorkspaceNavigation } from "../_components/use-workspace-navigation";
import { WorkspaceTopbar } from "../_components/workspace-topbar";
import { AccountSettings } from "./_components/account-settings";

export default function AccountSettingsPage() {
  const {
    identity,
    message,
    saveState,
    hasAccountSnapshot,
    portfolios,
    storageBroken,
    notify,
    reloadAccount,
    migrateLocal,
    exportBackup,
    accountControls,
    accountFeedback,
  } = usePortfoliosContext();
  const { returnToPortfolioHref } = useWorkspaceNavigation();

  async function reloadAccountData() {
    await reloadAccount();
  }

  return (
    <>
      <WorkspaceTopbar label="Definições da conta" />
      <main className="content">
        <AccountSettings
          accountControls={accountControls}
          accountFeedback={accountFeedback}
          isAccountMode={identity !== null}
          message={message}
          saveState={saveState}
          canMigrate={hasAccountSnapshot && saveState !== "saving"}
          hasPortfolios={portfolios.length > 0}
          storageBroken={storageBroken !== null}
          onDismissMessage={() => notify("")}
          onReloadAccount={reloadAccountData}
          onMigrateLocal={migrateLocal}
          onExportBackup={exportBackup}
        >
          <div className="page-heading">
            <div>
              <p className="eyebrow">A tua conta</p>
              <h1>Definições da conta</h1>
              <p>
                Controla a tua sessão e a forma como guardas as tuas carteiras.
              </p>
            </div>
          </div>
          <Link
            className="button secondary account-back"
            href={returnToPortfolioHref()}
          >
            Voltar às carteiras
          </Link>
        </AccountSettings>
      </main>
    </>
  );
}
