"use client";

import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";
import type { Portfolio } from "@/lib/types";
import { Icon } from "@/components/icon";
import { AccountStorageBar } from "@/app/(workspace)/_components/account-storage-bar";
import { MessageNotice } from "@/app/(workspace)/_components/message-notice";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import { WorkspaceTopbar } from "@/app/(workspace)/_components/workspace-topbar";
import {
  portfolioSectionFromSegment,
  useRoutePortfolioId,
  type PortfolioSection,
} from "@/app/(workspace)/_components/workspace-routes";
import { CsvImportDialog } from "./csv-import-dialog";
import { CsvImportPreview } from "./csv-import-preview";
import { MarketNotices } from "./market-notices";
import { NewOrderDialog } from "./new-order-dialog";
import { PortfolioDataMenu } from "./portfolio-data-menu";
import { PortfolioHeader, portfolioSectionDetails } from "./portfolio-header";
import { PortfolioTabs } from "./portfolio-tabs";
import { PortfolioToolbar } from "./portfolio-toolbar";
import { PortfolioViewProvider } from "./portfolio-view-context";
import { usePortfolioRouteSelection } from "./use-portfolio-route-selection";
import { usePortfolioValuation } from "./use-portfolio-valuation";

/** Layout of `/carteira/[id]`: resolves the portfolio from the URL. */
export function PortfolioWorkspace({ children }: { children: ReactNode }) {
  const routePortfolioId = useRoutePortfolioId();
  const section = portfolioSectionFromSegment(useSelectedLayoutSegment());
  const { portfolio, removeRoutePortfolio } = usePortfolioRouteSelection(
    routePortfolioId,
    section,
  );

  // A missing id is redirected by usePortfolioRouteSelection.
  if (!portfolio) return null;

  return (
    <OpenPortfolio
      portfolio={portfolio}
      section={section}
      onRemovePortfolio={() => void removeRoutePortfolio(portfolio)}
    >
      {children}
    </OpenPortfolio>
  );
}

type OpenPortfolioProps = {
  portfolio: Portfolio;
  section: PortfolioSection;
  onRemovePortfolio: () => void;
  children: ReactNode;
};

function OpenPortfolio({
  portfolio,
  section,
  onRemovePortfolio,
  children,
}: OpenPortfolioProps) {
  const {
    accountFeedback,
    saveState,
    openModal,
    sectionSearches,
    rememberSectionSearch,
    rememberPortfolioSection,
  } = usePortfoliosContext();
  const valuation = usePortfolioValuation(portfolio, section);
  const files = usePortfolioFileInputs();

  useEffect(() => {
    rememberPortfolioSection(section);
  }, [rememberPortfolioSection, section]);

  useSearchFromUrl(section);

  function setSearch(value: string) {
    rememberSectionSearch(section, value);
    const query = value ? `?q=${encodeURIComponent(value)}` : "";
    // Avoids a server round trip for each typed character.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query}`,
    );
  }

  const viewValue = {
    ...valuation,
    portfolio,
    section,
    search: sectionSearches[section],
    setSearch,
    clearSearch: () => setSearch(""),
  };

  return (
    <>
      <WorkspaceTopbar label={portfolioSectionDetails[section].label}>
        <PortfolioDataMenu
          portfolio={portfolio}
          loadingPrices={valuation.loading}
          onRemovePortfolio={onRemovePortfolio}
          onRestoreBackup={files.chooseBackupFile}
        />
      </WorkspaceTopbar>
      <main className="content">
        {accountFeedback}
        <AccountStorageBar />
        <PortfolioHeader section={section} />
        <PortfolioTabs section={section} />
        {files.inputs}
        <MessageNotice />
        <MarketNotices
          hasOrders={portfolio.orders.length > 0}
          loading={valuation.loading}
          error={valuation.marketError}
          market={valuation.market}
          portfolioValue={valuation.summary.value}
          currency={portfolio.currency}
        />
        <PortfolioToolbar
          portfolio={portfolio}
          section={section}
          loadingPrices={valuation.loading}
        />
        <PortfolioViewProvider value={viewValue}>
          {children}
        </PortfolioViewProvider>
        <div className="bottom-actions no-print">
          <span>
            <Icon name="download" /> Exporta uma cópia regularmente.
          </span>
          <button
            className="bottom-delete"
            onClick={onRemovePortfolio}
          >
            Eliminar carteira
          </button>
        </div>
      </main>
      <button
        className="mobile-trade-action no-print"
        aria-label="Nova transação"
        title="Nova transação"
        disabled={saveState === "saving"}
        onClick={() => openModal("order")}
      >
        <Icon name="plus" />
      </button>
      <CsvReviewDialog />
      <NewOrderDialog portfolio={portfolio} />
      <CsvImportDialog
        portfolio={portfolio}
        onChooseCsv={files.chooseCsvFile}
        onImportCsv={files.importDroppedCsv}
      />
    </>
  );
}

/**
 * Keeps the remembered search equal to `?q=` when the URL changes through a
 * link or the browser history, so the table always matches the address.
 */
function useSearchFromUrl(section: PortfolioSection) {
  const urlSearch = useSearchParams().get("q") ?? "";
  const { sectionSearches, rememberSectionSearch } = usePortfoliosContext();
  const rememberedSearch = sectionSearches[section];

  useEffect(() => {
    if (urlSearch !== rememberedSearch)
      rememberSectionSearch(section, urlSearch);
    // Only URL changes should overwrite the remembered search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, urlSearch]);
}

/** Hidden file inputs used by the CSV import and the backup restore. */
function usePortfolioFileInputs() {
  const { closeModal, importCsvFile, restoreBackupFile } =
    usePortfoliosContext();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  function readCsvInput(event: ChangeEvent<HTMLInputElement>) {
    void importCsvFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function readBackupInput(event: ChangeEvent<HTMLInputElement>) {
    void restoreBackupFile(event.target.files?.[0]);
    event.target.value = "";
  }

  const inputs = (
    <>
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        aria-label="Importar ficheiro CSV"
        onChange={readCsvInput}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        aria-label="Restaurar cópia de segurança"
        onChange={readBackupInput}
      />
    </>
  );

  return {
    inputs,
    chooseCsvFile() {
      closeModal();
      csvInputRef.current?.click();
    },
    importDroppedCsv(file: File | undefined) {
      closeModal();
      void importCsvFile(file);
    },
    chooseBackupFile() {
      backupInputRef.current?.click();
    },
  };
}

function CsvReviewDialog() {
  const { csvReview, cancelCsvReview, confirmCsvImport } =
    usePortfoliosContext();

  if (!csvReview) return null;

  return (
    <CsvImportPreview
      key={csvReview.drafts[0].id}
      portfolio={csvReview.portfolio}
      filename={csvReview.filename}
      drafts={csvReview.drafts}
      onClose={cancelCsvReview}
      onConfirm={confirmCsvImport}
    />
  );
}
