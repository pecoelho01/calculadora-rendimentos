import "server-only";
import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";
import type { MarketAsset } from "./types";
import { tradingDate } from "./market-date";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  queue: { concurrency: 4 },
});
const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export const getAsset = unstable_cache(
  async (ticker: string, start: string): Promise<MarketAsset> => {
    const signal = AbortSignal.timeout(18_000);
    // Include earlier trading observations for weekends and exchanges ahead of UTC.
    const historyStart = new Date(start + "T00:00:00Z");
    historyStart.setUTCDate(historyStart.getUTCDate() - 7);
    const [quote, history] = await Promise.allSettled([
      yahoo.quote(ticker, {}, { fetchOptions: { signal } }),
      yahoo.chart(
        ticker,
        { period1: historyStart, interval: "1d" },
        { fetchOptions: { signal } },
      ),
    ]);
    const q = quote.status === "fulfilled" ? quote.value : null;
    const h = history.status === "fulfilled" ? history.value : null;
    return {
      price: positive(q?.regularMarketPrice),
      previousClose: positive(q?.regularMarketPreviousClose),
      currency: q?.currency ?? h?.meta.currency ?? null,
      name: q?.shortName ?? ticker,
      asOf:
        q?.regularMarketTime instanceof Date
          ? q.regularMarketTime.toISOString()
          : null,
      history: (h?.quotes ?? [])
        .flatMap((p) => {
          const date = tradingDate(p.date, h!.meta.exchangeTimezoneName);
          return date && positive(p.close) !== null
            ? [{ date, close: p.close! }]
            : [];
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
      ...(q && h
        ? {}
        : { error: "Alguns dados do Yahoo Finance estão indisponíveis." }),
    };
  },
  ["yahoo-market-v1"],
  { revalidate: 300 },
);
