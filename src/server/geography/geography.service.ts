import type { Geography } from "../../lib/types";
import { MAX_TICKERS, tickerPattern } from "../../lib/validation";

export type GeographyAdapter = (ticker: string) => Promise<Geography | null>;

export function createGeographyService(getGeography: GeographyAdapter) {
  return async function loadGeographies(raw: string) {
    const tickers = [...new Set(raw.split(",").filter(Boolean))];
    if (!tickers.length || tickers.length > MAX_TICKERS ||
        !tickers.every((ticker) => tickerPattern.test(ticker))) {
      return null;
    }
    const entries = await Promise.all(tickers.map(async (ticker) => [ticker, await getGeography(ticker)] as const));
    return { geographies: Object.fromEntries(entries) };
  };
}
