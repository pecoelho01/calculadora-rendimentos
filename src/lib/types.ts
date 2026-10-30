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
export type MarketAsset = {
  price: number | null;
  previousClose: number | null;
  currency: string | null;
  name: string;
  asOf: string | null;
  history: PricePoint[];
  error?: string;
};
export type MarketData = Record<string, MarketAsset>;
