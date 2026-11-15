import type { MarketAsset } from "../../lib/types";
import { MAX_TICKERS, tickerPattern, validDate } from "../../lib/validation";

export type MarketAdapter = (
  ticker: string,
  start: string,
) => Promise<MarketAsset>;

export function createMarketService(getAsset: MarketAdapter) {
  return async function loadMarket(rawTickers: string, start: string) {
    const tickers = [...new Set(rawTickers.split(",").filter(Boolean))];
    const hasValidTickers =
      tickers.length > 0 &&
      tickers.length <= MAX_TICKERS &&
      tickers.every((ticker) => tickerPattern.test(ticker));

    if (!hasValidTickers || !validDate(start)) {
      return null;
    }
    async function loadAssetEntry(ticker: string) {
      try {
        return [ticker, await getAsset(ticker, start)] as const;
      } catch {
        return [
          ticker,
          {
            price: null,
            previousClose: null,
            currency: null,
            name: ticker,
            asOf: null,
            history: [],
            intraday: [],
            error: "Dados indisponíveis. Tenta novamente mais tarde.",
          },
        ] as const;
      }
    }

    const assets = await Promise.all(tickers.map(loadAssetEntry));
    return { assets: Object.fromEntries(assets) };
  };
}
