"use client";

import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import { HoldingsPanel } from "../../_components/holdings-panel";
import { usePortfolioView } from "../../_components/portfolio-view-context";
import { TransactionsTable } from "./transactions-table";

export function TransactionsHoldings() {
  const { deleteOrder } = usePortfoliosContext();
  const { portfolio, summary, search, clearSearch } = usePortfolioView();

  return (
    <HoldingsPanel
      title="Histórico de transações"
      count={portfolio.orders.length}
      emptyItems="transactions"
      footerNote={<GainCalculationNote />}
    >
      <TransactionsTable
        key={portfolio.id}
        orders={portfolio.orders}
        orderGains={summary.orderGains}
        currency={portfolio.currency}
        search={search}
        onClearSearch={clearSearch}
        onDelete={(orderId) => void deleteOrder(portfolio, orderId)}
      />
    </HoldingsPanel>
  );
}

function GainCalculationNote() {
  return (
    <span className="transaction-gain-note">
      Compras: ganho total do lote (realizado + não realizado), % sobre o custo
      original. Vendas: ganho realizado, % sobre o custo vendido. Os ganhos das
      vendas já estão incluídos nas compras; não somar as duas vistas.
    </span>
  );
}
