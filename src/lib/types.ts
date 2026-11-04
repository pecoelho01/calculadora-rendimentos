export type Currency = "EUR" | "USD" | "GBP";
export type Order = {
  id: string;
  date: string;
  ticker: string;
  name: string;
  pricebuy: number;
  shares: number;
  type: "buy" | "sell";
};
export type Portfolio = {
  id: string;
  name: string;
  currency: Currency;
  orders: Order[];
};
export type PricePoint = { date: string; close: number };
/** Intraday observations use full UTC timestamps; null closes preserve gaps. */
export type IntradayPoint = { date: string; close: number | null };
export type Geography = {
  allocations: { country: string; weight: number }[];
  asOf: string;
  source: string;
  sourceName?: string;
  method?: "holdings" | "published";
  holdingsCount?: number;
};
export type MarketAsset = {
  price: number | null;
  previousClose: number | null;
  currency: string | null;
  name: string;
  asOf: string | null;
  history: PricePoint[];
  intraday?: IntradayPoint[];
  intradayError?: string;
  geography?: Geography | null;
  error?: string;
};
export type MarketData = Record<string, MarketAsset>;
