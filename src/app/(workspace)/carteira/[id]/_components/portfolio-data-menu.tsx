"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import type { Portfolio } from "@/lib/types";
import { Icon } from "@/components/icon";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";

type PortfolioDataMenuProps = {
  portfolio: Portfolio;
  loadingPrices: boolean;
  onRemovePortfolio: () => void;
  onRestoreBackup: () => void;
};

function closeMenuOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape") return;
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

function closeMenuAfterAction(event: MouseEvent<HTMLDivElement>) {
  const clickedAction = (event.target as HTMLElement).closest("button, a");
  if (clickedAction)
    event.currentTarget.closest("details")?.removeAttribute("open");
}

/** The "•••" menu with data, export and report actions. */
export function PortfolioDataMenu({
  portfolio,
  loadingPrices,
  onRemovePortfolio,
  onRestoreBackup,
}: PortfolioDataMenuProps) {
  const {
    portfolios,
    saveState,
    requestRefresh,
    openModal,
    exportTransactionsCsv,
    exportBackup,
  } = usePortfoliosContext();
  const hasOrders = portfolio.orders.length > 0;

  return (
    <details
      className="data-actions"
      onKeyDown={closeMenuOnEscape}
    >
      <summary className="button secondary">
        <span className="visually-hidden">Dados e exportação</span>
        <span aria-hidden="true">•••</span>
      </summary>
      <div
        className="data-actions-panel"
        onClick={closeMenuAfterAction}
      >
        <span className="action-group-label">Carteira atual</span>
        <button
          className="mobile-menu-action"
          disabled={loadingPrices || !hasOrders}
          onClick={requestRefresh}
        >
          <Icon name="refresh" /> Atualizar preços
        </button>
        <button
          disabled={saveState === "saving"}
          onClick={() => openModal("import")}
        >
          <Icon name="upload" /> Importar CSV
        </button>
        <button onClick={() => exportTransactionsCsv(portfolio.orders)}>
          <Icon name="download" /> Exportar transações CSV
        </button>
        <button onClick={() => window.print()}>
          <Icon name="file" /> Relatório PDF
        </button>
        <a
          href="/modelo_site_ativos.csv"
          download
        >
          <Icon name="download" /> Modelo de importação CSV
        </a>
        <button
          className="delete-button"
          onClick={onRemovePortfolio}
        >
          Eliminar carteira
        </button>
        <span className="action-group-label">Todas as carteiras</span>
        <button
          disabled={!portfolios.length}
          onClick={exportBackup}
        >
          <Icon name="download" /> Exportar backup JSON
        </button>
        <button onClick={onRestoreBackup}>
          <Icon name="upload" /> Restaurar cópia de segurança
        </button>
      </div>
    </details>
  );
}
