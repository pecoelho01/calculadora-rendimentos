import type { Geography } from "../../lib/types";
import { MAX_TICKERS, tickerPattern } from "../../lib/validation";

export type GeographyAdapter = (ticker: string) => Promise<Geography | null>;

export function createGeographyService(getGeography: GeographyAdapter) {
  return async function loadGeographies(raw: string) {
    const tickers = [...new Set(raw.split(",").filter(Boolean))];
    if (
      !tickers.length ||
      tickers.length > MAX_TICKERS ||
      !tickers.every((ticker) => tickerPattern.test(ticker))
    ) {
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
