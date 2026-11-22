import { TransactionsHoldings } from "./_components/transactions-holdings";
import { TransactionsSummary } from "./_components/transactions-summary";

export default function PortfolioTransactionsPage() {
  return (
    <>
      <TransactionsSummary />
      <TransactionsHoldings />
    </>
  );
}
