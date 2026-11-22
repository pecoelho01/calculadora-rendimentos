"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import type { Portfolio } from "@/lib/types";
import { Icon } from "@/components/icon";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import {
  portfolioPath,
  type PortfolioSection,
} from "@/app/(workspace)/_components/workspace-routes";

type PortfolioToolbarProps = {
  portfolio: Portfolio;
  section: PortfolioSection;
  loadingPrices: boolean;
};

/** Portfolio selector (mobile), printed portfolio context and price refresh. */
export function PortfolioToolbar({
  portfolio,
  section,
  loadingPrices,
}: PortfolioToolbarProps) {
  const router = useRouter();
  const { portfolios, ready, requestRefresh, clearSectionSearches } =
    usePortfoliosContext();
  const listClass = section === "overview" ? "" : "portfolio-toolbar-list";
  const refreshLabel = loadingPrices ? "A obter cotações…" : "Atualizar preços";

  function openSelectedPortfolio(event: ChangeEvent<HTMLSelectElement>) {
    clearSectionSearches();
    router.push(portfolioPath(event.target.value, section));
  }

  return (
    <div className={`portfolio-toolbar ${listClass}`}>
      <div className="portfolio-context">
        <label className="portfolio-selector no-print">
          <Icon name="wallet" />
          <span
            className="portfolio-selection-label"
            aria-hidden="true"
          >
            <strong>{portfolio.name}</strong>
            <span> · {portfolio.currency}</span>
          </span>
          <Icon name="chevron" />
          <select
            aria-label="Selecionar carteira"
            value={portfolio.id}
            disabled={!ready}
            onChange={openSelectedPortfolio}
          >
            {portfolios.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.name} · {item.currency}
              </option>
            ))}
          </select>
        </label>
        <span className="portfolio-print-context">
          <strong>{portfolio.name}</strong>
          <span className="currency-tag">Moeda: {portfolio.currency}</span>
        </span>
      </div>
      <button
        className="text-button refresh-prices no-print"
        aria-label={refreshLabel}
        disabled={loadingPrices || !portfolio.orders.length}
        onClick={requestRefresh}
      >
        <Icon name="refresh" />
        <span className="refresh-label">{refreshLabel}</span>
      </button>
    </div>
  );
}
