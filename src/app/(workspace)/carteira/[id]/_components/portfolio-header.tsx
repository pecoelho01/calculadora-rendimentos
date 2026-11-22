"use client";

import { Icon } from "@/components/icon";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import type { PortfolioSection } from "@/app/(workspace)/_components/workspace-routes";

export const portfolioSectionDetails: Record<
  PortfolioSection,
  { label: string; title: string; description: string }
> = {
  overview: {
    label: "Visão geral",
    title: "Visão geral",
    description: "O essencial da tua carteira, apresentado com clareza.",
  },
  positions: {
    label: "Posições",
    title: "Posições",
    description: "As tuas posições e o seu desempenho.",
  },
  transactions: {
    label: "Transações",
    title: "Transações",
    description: "O histórico de compras e vendas da tua carteira.",
  },
};

/** Page title of the current section, with the import and new order actions. */
export function PortfolioHeader({ section }: { section: PortfolioSection }) {
  const { saveState, openModal } = usePortfoliosContext();
  const details = portfolioSectionDetails[section];
  const saving = saveState === "saving";
  // Tests and screen readers have always used "Visão Geral" for this heading.
  const headingLabel = section === "overview" ? "Visão Geral" : undefined;

  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">OS TEUS INVESTIMENTOS</span>
        <h1 aria-label={headingLabel}>{details.title}</h1>
        <p>{details.description}</p>
      </div>
      <div className="heading-actions no-print">
        <button
          className="button secondary import-csv-action"
          disabled={saving}
          onClick={() => openModal("import")}
        >
          <Icon name="upload" /> Importar CSV
        </button>
        <button
          className="button primary"
          disabled={saving}
          onClick={() => openModal("order")}
        >
          <Icon name="plus" /> Nova transação
        </button>
      </div>
    </div>
  );
}
