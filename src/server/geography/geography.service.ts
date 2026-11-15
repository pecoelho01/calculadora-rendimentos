import type { Geography } from "../../lib/types";
import { MAX_TICKERS, tickerPattern } from "../../lib/validation";

export type GeographyAdapter = (ticker: string) => Promise<Geography | null>;

export function createGeographyService(getGeography: GeographyAdapter) {
  return async function loadGeographies(rawTickers: string) {
    const tickers = [...new Set(rawTickers.split(",").filter(Boolean))];
    const hasValidTickers =
      tickers.length > 0 &&
      tickers.length <= MAX_TICKERS &&
      tickers.every((ticker) => tickerPattern.test(ticker));

    if (!hasValidTickers) {
      return null;
    }
    async function loadGeographyEntry(ticker: string) {
      const geography = await getGeography(ticker);
      return [ticker, geography] as const;
    }

    const entries = await Promise.all(tickers.map(loadGeographyEntry));
    return { geographies: Object.fromEntries(entries) };
  };
}
