"use client";

import { Icon } from "@/components/icon";
import { AccountStorageBar } from "./account-storage-bar";
import { EmptyPortfolioState } from "./empty-portfolio-state";
import { MessageNotice } from "./message-notice";
import { usePortfoliosContext } from "./portfolios-provider";
import { WorkspaceTopbar } from "./workspace-topbar";

/** Shown at `/` when the current storage has no portfolio to open. */
export function NoPortfoliosView() {
  const { identity, hasAccountSnapshot, accountFeedback, openModal } =
    usePortfoliosContext();
  const showsEmptyAccountNotice = identity !== null && hasAccountSnapshot;

  return (
    <>
      <WorkspaceTopbar label="Visão geral" />
      <main className="content">
        {accountFeedback}
        <AccountStorageBar />
        <div className="page-heading">
          <div>
            <span className="eyebrow">OS TEUS INVESTIMENTOS</span>
            <h1 aria-label="Visão Geral">Visão geral</h1>
            <p>O essencial da tua carteira, apresentado com clareza.</p>
          </div>
          {/* Same actions as a portfolio page, unavailable until one exists. */}
          <div className="heading-actions no-print">
            <button
              className="button secondary import-csv-action"
              disabled
            >
              <Icon name="upload" /> Importar CSV
            </button>
            <button
              className="button primary"
              disabled
            >
              <Icon name="plus" /> Nova transação
            </button>
          </div>
        </div>
        {showsEmptyAccountNotice ? (
          <div className="notice account-empty-notice">
            <span>A tua conta ainda não tem carteiras.</span>
            <button
              className="button secondary"
              onClick={() => openModal("portfolio")}
            >
              Criar a primeira carteira
            </button>
          </div>
        ) : null}
        <MessageNotice />
        <section className="panel holdings">
          <EmptyPortfolioState
            hasPortfolio={false}
            emptyItems="transactions"
          />
        </section>
      </main>
      <button
        className="mobile-trade-action no-print"
        aria-label="Nova transação"
        title="Nova transação"
        disabled
      >
        <Icon name="plus" />
      </button>
    </>
  );
}
