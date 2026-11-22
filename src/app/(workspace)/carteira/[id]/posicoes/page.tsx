import { PositionsHoldings } from "../_components/positions-holdings";
import { PositionsSummary } from "./_components/positions-summary";

export default function PortfolioPositionsPage() {
  return (
    <>
      <PositionsSummary />
      <PositionsHoldings />
    </>
  );
}
