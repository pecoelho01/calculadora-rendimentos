"use client";

import { PortfolioAllocationCard } from "../_charts/portfolio-allocation-card";
import { PortfolioValueChart } from "../_charts/portfolio-value-chart";
import { formatMoney, formatPercent } from "./format-values";
import { PortfolioMetric } from "./portfolio-metric";
import { usePortfolioView } from "./portfolio-view-context";
import { PositionsHoldings } from "./positions-holdings";

export function PortfolioOverview() {
  const { portfolio, market } = usePortfolioView();

  return (
    <>
      <OverviewMetrics />
      <div className="charts-grid">
        <PortfolioValueChart
          key={portfolio.id}
          orders={portfolio.orders}
          market={market}
          currency={portfolio.currency}
        />
        <PortfolioAllocationCard />
      </div>
      <PositionsHoldings compact />
    </>
  );
}

function OverviewMetrics() {
  const { portfolio, summary } = usePortfolioView();
  const { currency } = portfolio;

  return (
    <div className="metrics">
      <PortfolioMetric
        label="Valor da carteira"
        value={formatMoney(summary.value, currency)}
        featured
        detail="Posições abertas · valor de mercado"
      />
      <PortfolioMetric
        label="Rentabilidade total"
        value={formatPercent(summary.roi)}
        detail={`${formatMoney(summary.gain, currency)} de ganho total`}
        trend={summary.gain}
      />
      <PortfolioMetric
        label="Ganho realizado"
        value={formatMoney(summary.realized, currency)}
        detail="Em unidades vendidas"
        trend={summary.realized}
      />
      <PortfolioMetric
        label="Compras acumuladas"
        value={formatMoney(summary.invested, currency)}
        detail="Valor de todas as compras"
      />
    </div>
  );
}
