"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { CreatePortfolioDialog } from "./create-portfolio-dialog";
import { MobileNavigation } from "./mobile-navigation";
import { usePortfoliosContext } from "./portfolios-provider";
import { RenamePortfolioDialog } from "./rename-portfolio-dialog";
import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { WorkspaceSidebar } from "./workspace-sidebar";

/**
 * Frame shared by every workspace route: sidebar, mobile navigation and the
 * dialogs that do not depend on an open portfolio. Each route renders its own
 * content inside `.main-area`.
 */
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { ready, storageBroken } = usePortfoliosContext();
  const { view, currentPortfolio } = useWorkspaceNavigation();
  // Account settings stay reachable while portfolios load or need recovery.
  const isAccountView = view === "account";

  if (!ready && !isAccountView) return <LoadingScreen />;
  if (storageBroken !== null && !isAccountView)
    return <StorageRecoveryScreen />;

  return (
    <AppSidebar
      portfolioName={currentPortfolio?.name ?? "As tuas carteiras"}
      currency={currentPortfolio?.currency}
      mobileNavigation={<MobileNavigation />}
      sidebar={<WorkspaceSidebar />}
    >
      <div className={`main-area view-${view}`}>{children}</div>
      <CreatePortfolioDialog />
      <RenamePortfolioDialog />
    </AppSidebar>
  );
}

function LoadingScreen() {
  const { accountControls } = usePortfoliosContext();

  return (
    <main
      className="boot"
      aria-busy="true"
    >
      {accountControls}A abrir a tua carteira…
    </main>
  );
}

function StorageRecoveryScreen() {
  const { accountControls, message, exportOriginalStorage, recoverStorage } =
    usePortfoliosContext();

  return (
    <main className="boot">
      {accountControls ?? (
        <Link
          className="button secondary"
          href="/definicoes"
        >
          Aceder à conta
        </Link>
      )}
      <h1>Recuperar carteiras</h1>
      <p role="alert">{message}</p>
      <button onClick={exportOriginalStorage}>Exportar dados originais</button>
      <button onClick={() => void recoverStorage()}>Repor armazenamento</button>
    </main>
  );
}
