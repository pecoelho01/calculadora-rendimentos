"use client";

import { useMemo } from "react";
import { calculatePortfolio } from "@/lib/portfolio/portfolio";
import type { MarketData, Portfolio } from "@/lib/types";
import { usePortfoliosContext } from "@/app/(workspace)/_components/portfolios-provider";
import type { PortfolioSection } from "@/app/(workspace)/_components/workspace-routes";
import { useAssetCountries } from "../_charts/use-asset-countries";
import { useMarketPrices } from "./use-market-prices";

/**
 * Market prices and the calculated summary for the open portfolio. Asset
 * countries are only requested while the overview, which shows them, is open.
 */
export function usePortfolioValuation(
  portfolio: Portfolio,
  section: PortfolioSection,
) {
  const { ready, refresh, assetCountryCache } = usePortfoliosContext();
  const { orders, currency } = portfolio;
  const {
    market,
    loading,
    error: marketError,
  } = useMarketPrices({ portfolioId: portfolio.id, orders, refresh });

  const summary = useMemo(
    () => calculatePortfolio(orders, market, currency),
    [orders, market, currency],
  );
  const openTickers = summary.positions
    .filter((position) => position.shares > 0)
    .map((position) => position.ticker)
    .sort((first, second) => first.localeCompare(second))
    .join(",");
  const geography = useAssetCountries(
    openTickers,
    ready && section === "overview",
    refresh,
    assetCountryCache,
  );
  const geographicMarket = useMemo(
    () => withGeography(market, geography.data),
    [market, geography.data],
  );

  return {
    market,
    loading,
    marketError,
    summary,
    geography,
    geographicMarket,
  };
}

function withGeography(
  market: MarketData,
  geographyByTicker: ReturnType<typeof useAssetCountries>["data"],
): MarketData {
  return Object.fromEntries(
    Object.entries(market).map(([ticker, asset]) => [
      ticker,
      { ...asset, geography: geographyByTicker[ticker] ?? null },
    ]),
  );
}
