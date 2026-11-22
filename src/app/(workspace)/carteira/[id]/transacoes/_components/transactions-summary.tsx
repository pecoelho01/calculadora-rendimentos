"use client";

import { PortfolioMetric } from "../../_components/portfolio-metric";
import { usePortfolioView } from "../../_components/portfolio-view-context";

export function TransactionsSummary() {
  const { portfolio } = usePortfolioView();
  const { orders } = portfolio;
  const buyCount = orders.filter((order) => order.type === "buy").length;
  const sellCount = orders.filter((order) => order.type === "sell").length;

  return (
    <div
      className="summary-strip"
      aria-label="Resumo das transações"
    >
      <PortfolioMetric
        label="Total de transações"
        value={`${orders.length} operações`}
      />
      <PortfolioMetric
        label="Compras"
        value={String(buyCount)}
      />
      <PortfolioMetric
        label="Vendas"
        value={String(sellCount)}
      />
    </div>
  );
}
