import "server-only";
import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";
import type { MarketAsset } from "../../lib/types";
import { tradingDate } from "../../lib/market/market-date";
import { normalizeIntraday } from "../../lib/market/market-intraday";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  queue: { concurrency: 4 },
});

const nonNegativePrice = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

async function fetchMarketAsset(
  ticker: string,
  start: string,
  day: string,
): Promise<MarketAsset> {
  const signal = AbortSignal.timeout(18_000);
  const now = new Date();
  const intradayStart = new Date(`${day}T00:00:00Z`);
  // Include earlier trading observations for weekends and exchanges ahead of UTC.
  const historyStart = new Date(start + "T00:00:00Z");
  historyStart.setUTCDate(historyStart.getUTCDate() - 7);
  const [quoteResult, historyResult, intradayResult] = await Promise.allSettled(
    [
      yahoo.quote(ticker, {}, { fetchOptions: { signal } }),
      yahoo.chart(
        ticker,
        { period1: historyStart, interval: "1d" },
        { fetchOptions: { signal } },
      ),
      yahoo.chart(
        ticker,
        {
          period1: intradayStart,
          period2: now,
          interval: "5m",
          includePrePost: false,
        },
        { fetchOptions: { signal } },
      ),
    ],
  );
  const quoteData =
    quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const historyData =
    historyResult.status === "fulfilled" ? historyResult.value : null;
  const intradayData =
    intradayResult.status === "fulfilled" ? intradayResult.value : null;
  return {
    price: nonNegativePrice(quoteData?.regularMarketPrice),
    previousClose: nonNegativePrice(quoteData?.regularMarketPreviousClose),
    currency:
      quoteData?.currency ??
      historyData?.meta.currency ??
      intradayData?.meta.currency ??
      null,
    name: quoteData?.shortName ?? ticker,
    asOf:
      quoteData?.regularMarketTime instanceof Date
        ? quoteData.regularMarketTime.toISOString()
        : null,
    history: (historyData?.quotes ?? [])
      .flatMap((observation) => {
        const date = tradingDate(
          observation.date,
          historyData!.meta.exchangeTimezoneName,
        );
        const close = nonNegativePrice(observation.close);
        if (!date || close === null) return [];
        return [{ date, close }];
      })
      .sort((a, b) => a.date.localeCompare(b.date)),
    intraday: intradayData
      ? normalizeIntraday(intradayData.quotes, intradayStart, now)
      : [],
    ...(intradayResult.status === "rejected"
      ? {
          intradayError:
            "Cotações intradiárias indisponíveis. Tenta atualizar os preços.",
        }
      : {}),
    ...(quoteData && historyData
      ? {}
      : { error: "Alguns dados do Yahoo Finance estão indisponíveis." }),
  };
}

const getCachedAsset = unstable_cache(
  fetchMarketAsset,
  ["yahoo-market-v5-intraday"],
  { revalidate: 300 },
);

export function getAsset(ticker: string, start: string): Promise<MarketAsset> {
  // The UTC day prevents yesterday's intraday series surviving a cache hit after midnight.
  return getCachedAsset(ticker, start, new Date().toISOString().slice(0, 10));
}
