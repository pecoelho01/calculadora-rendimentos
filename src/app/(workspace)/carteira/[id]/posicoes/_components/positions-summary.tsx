"use client";

import { formatMoney } from "../../_components/format-values";
import { PortfolioMetric } from "../../_components/portfolio-metric";
import { usePortfolioView } from "../../_components/portfolio-view-context";

export function PositionsSummary() {
  const { portfolio, summary } = usePortfolioView();
  const openPositionsCount = summary.positions.filter(
    (position) => position.shares > 0,
  ).length;

  return (
    <div
      className="summary-strip"
      aria-label="Resumo das posições"
    >
      <PortfolioMetric
        label="Valor atual"
        value={formatMoney(summary.value, portfolio.currency)}
      />
      <PortfolioMetric
        label="Posições abertas"
        value={`${openPositionsCount} ativos`}
      />
      <PortfolioMetric
        label="Ganho não realizado"
        value={formatMoney(summary.unrealized, portfolio.currency)}
        trend={summary.unrealized}
      />
    </div>
  );
}
