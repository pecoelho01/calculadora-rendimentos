"use client";

import Link from "next/link";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import {
  portfolioPath,
  scrollToTop,
} from "@/app/(workspace)/_components/workspace-routes";
import { usePortfolioView } from "../_components/portfolio-view-context";
import { AllocationByAssetChart } from "./allocation-by-asset-chart";
import { AllocationByCountryChart } from "./allocation-by-country-chart";

/** Overview card that switches between allocation by asset and by country. */
export function PortfolioAllocationCard() {
  const { allocationView, setAllocationView } = usePortfoliosContext();
  const { portfolio, summary, loading, geography, geographicMarket, search } =
    usePortfolioView();
  const openPositionsCount = summary.positions.filter(
    (position) => position.shares > 0,
  ).length;

  return (
    <section
      className="panel allocation-card"
      aria-label="Distribuição da carteira"
    >
      <div className="panel-heading">
        <div>
          <h2>A tua distribuição</h2>
          <p className="panel-subtitle">Por valor de mercado</p>
        </div>
        <div
          className="segments allocation-toggle no-print"
          role="group"
          aria-label="Tipo de distribuição"
        >
          <button
            aria-pressed={allocationView === "assets"}
            onClick={() => setAllocationView("assets")}
          >
            ETFs
          </button>
          <button
            aria-pressed={allocationView === "geography"}
            onClick={() => setAllocationView("geography")}
          >
            Geografia
          </button>
        </div>
      </div>
      <div className="allocation-content">
        <div
          className="allocation asset-allocation"
          hidden={allocationView !== "assets"}
        >
          <AllocationByAssetChart summary={summary} />
        </div>
        <div
          className="geographic-view"
          hidden={allocationView !== "geography"}
        >
          <AllocationByCountryChart
            positions={summary.positions}
            market={geographicMarket}
            loading={loading || geography.loading}
          />
        </div>
      </div>
      <div className="allocation-footer">
        <span>{openPositionsCount} ativos na carteira</span>
        <Link
          className="text-button"
          href={portfolioPath(portfolio.id, "positions", search)}
          onClick={scrollToTop}
        >
          Ver posições <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
