import type { Order } from "./types";
export function demoOrders(): Order[] {
  return [
    {
      date: "2024-01-10",
      ticker: "AAPL",
      name: "Apple",
      pricebuy: 185,
      shares: 12,
      type: "buy" as const,
    },
    {
      date: "2024-02-12",
      ticker: "MSFT",
      name: "Microsoft",
      pricebuy: 415,
      shares: 8,
      type: "buy" as const,
    },
    {
      date: "2024-03-20",
      ticker: "GOOGL",
      name: "Alphabet",
      pricebuy: 149,
      shares: 15,
      type: "buy" as const,
    },
    {
      date: "2024-06-14",
      ticker: "AAPL",
      name: "Apple",
      pricebuy: 212,
      shares: 3,
      type: "sell" as const,
    },
  ].map((o) => ({ ...o, id: crypto.randomUUID() }));
}
