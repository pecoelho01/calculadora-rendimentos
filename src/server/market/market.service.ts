import type { MarketAsset } from "../../lib/types";
import { MAX_TICKERS, tickerPattern, validDate } from "../../lib/validation";

export type MarketAdapter = (ticker: string, start: string) => Promise<MarketAsset>;

export function createMarketService(getAsset: MarketAdapter) {
  return async function loadMarket(raw: string, start: string) {
    const tickers = [...new Set(raw.split(",").filter(Boolean))];
    if (!tickers.length || tickers.length > MAX_TICKERS ||
        !tickers.every((ticker) => tickerPattern.test(ticker)) || !validDate(start)) {
      return null;
    }
    const assets = await Promise.all(tickers.map(async (ticker) => {
      try {
        return [ticker, await getAsset(ticker, start)] as const;
      } catch {
        return [ticker, {
          price: null,
          previousClose: null,
          currency: null,
          name: ticker,
          asOf: null,
          history: [],
          intraday: [],
          error: "Dados indisponíveis. Tenta novamente mais tarde.",
        }] as const;
      }
    }));
    return { assets: Object.fromEntries(assets) };
  };
}
