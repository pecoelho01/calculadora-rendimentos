"use client";

import { portfolioPath } from "@/app/(workspace)/_components/workspace-routes";
import { HoldingsPanel } from "./holdings-panel";
import { PositionsTable } from "./positions-table";
import { usePortfolioView } from "./portfolio-view-context";

/** Positions list: compact in the overview, complete in `/posicoes`. */
export function PositionsHoldings({ compact = false }: { compact?: boolean }) {
  const { portfolio, summary, market, loading, search, clearSearch } =
    usePortfolioView();
  const showAllHref = compact
    ? portfolioPath(portfolio.id, "positions", search)
    : undefined;

  return (
    <HoldingsPanel
      title="As tuas posições"
      count={summary.positions.length}
      showAllHref={showAllHref}
      emptyItems={compact ? "transactions" : "positions"}
    >
      <PositionsTable
        key={portfolio.id}
        compact={compact}
        positions={summary.positions}
        market={market}
        currency={portfolio.currency}
        loading={loading}
        search={search}
        onClearSearch={clearSearch}
      />
    </HoldingsPanel>
  );
}
