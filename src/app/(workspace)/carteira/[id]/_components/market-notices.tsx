"use client";

import type { Currency, MarketData } from "@/lib/types";

type MarketNoticesProps = {
  hasOrders: boolean;
  loading: boolean;
  error: string;
  market: MarketData;
  portfolioValue: number | null;
  currency: Currency;
};

/** Warns when prices failed or are missing, instead of showing invented values. */
export function MarketNotices({
  hasOrders,
  loading,
  error,
  market,
  portfolioValue,
  currency,
}: MarketNoticesProps) {
  const hasQuoteErrors = Object.values(market).some((asset) => asset.error);
  const showsMissingQuotes =
    hasOrders && !loading && (portfolioValue === null || hasQuoteErrors);

  return (
    <>
      {error ? (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {showsMissingQuotes ? (
        <div className="notice">
          Algumas cotações estão em falta ou noutra moeda. Os totais que
          dependem delas aparecem como «—». A carteira usa {currency}, sem
          conversão cambial.
        </div>
      ) : null}
    </>
  );
}
