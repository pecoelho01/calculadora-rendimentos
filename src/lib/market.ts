import "server-only";
import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";
import type { MarketAsset } from "./types";
import { tradingDate } from "./market-date";
import { normalizeIntraday } from "./market-intraday";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  queue: { concurrency: 4 },
});
const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const getCachedAsset = unstable_cache(
  async (ticker: string, start: string, day: string): Promise<MarketAsset> => {
    const signal = AbortSignal.timeout(18_000);
    const now = new Date();
    const intradayStart = new Date(`${day}T00:00:00Z`);
    // Include earlier trading observations for weekends and exchanges ahead of UTC.
    const historyStart = new Date(start + "T00:00:00Z");
    historyStart.setUTCDate(historyStart.getUTCDate() - 7);
    const [quote, history, intraday] = await Promise.allSettled([
      yahoo.quote(ticker, {}, { fetchOptions: { signal } }),
      yahoo.chart(
        ticker,
        { period1: historyStart, interval: "1d" },
        { fetchOptions: { signal } },
      ),
      yahoo.chart(
        ticker,
        { period1: intradayStart, period2: now, interval: "5m", includePrePost: false },
        { fetchOptions: { signal } },
      ),
    ]);
    const q = quote.status === "fulfilled" ? quote.value : null;
    const h = history.status === "fulfilled" ? history.value : null;
    const i = intraday.status === "fulfilled" ? intraday.value : null;
    return {
      price: positive(q?.regularMarketPrice),
      previousClose: positive(q?.regularMarketPreviousClose),
      currency: q?.currency ?? h?.meta.currency ?? i?.meta.currency ?? null,
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
      intraday: i
        ? normalizeIntraday(i.quotes, intradayStart, now)
        : [],
      ...(intraday.status === "rejected"
        ? { intradayError: "Cotações intradiárias indisponíveis. Tenta atualizar os preços." }
        : {}),
      ...(q && h
        ? {}
        : { error: "Alguns dados do Yahoo Finance estão indisponíveis." }),
    };
  },
  ["yahoo-market-v5-intraday"],
  { revalidate: 300 },
);

export function getAsset(ticker: string, start: string): Promise<MarketAsset> {
  // The UTC day prevents yesterday's intraday series surviving a cache hit after midnight.
  return getCachedAsset(ticker, start, new Date().toISOString().slice(0, 10));
}
