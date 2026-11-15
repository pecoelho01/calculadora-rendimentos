"use client";

import { useEffect, useState } from "react";
import type { MarketData, Order } from "@/lib/types";
import { chronological } from "@/lib/validation";

const EMPTY_MARKET: MarketData = {};

type MarketDataOptions = {
  portfolioId?: string;
  orders: Order[];
  refresh: number;
};

export function useMarketData({
  portfolioId,
  orders,
  refresh,
}: MarketDataOptions) {
  const [marketResult, setMarketResult] = useState<{
    key: string;
    data: MarketData;
    error: string;
  }>({ key: "", data: {}, error: "" });
  const tickers = [...new Set(orders.map((order) => order.ticker))]
    .sort((a, b) => a.localeCompare(b))
    .join(",");
  const start = orders.length ? chronological(orders)[0].date : "";
  const requestKey = `${portfolioId}|${tickers}|${start}|${refresh}`;
  useEffect(
    function loadMarketData() {
      if (!tickers || !start) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55_000);
      async function load() {
        try {
          const response = await fetch(
            `/api/market?${new URLSearchParams({ tickers, start })}`,
            { signal: controller.signal },
          );
          if (!response.ok)
            throw new Error("Não foi possível obter os dados de mercado.");
          const body = await response.json();
          setMarketResult({ key: requestKey, data: body.assets, error: "" });
        } catch {
          if (!controller.signal.aborted)
            setMarketResult({
              key: requestKey,
              data: {},
              error:
                "O Yahoo Finance está indisponível. As tuas transações continuam guardadas.",
            });
          else if (!cancelled)
            setMarketResult({
              key: requestKey,
              data: {},
              error: "O pedido demorou demasiado. Tenta atualizar os preços.",
            });
        } finally {
          clearTimeout(timeout);
        }
      }
      let cancelled = false;
      void load();
      return () => {
        cancelled = true;
        clearTimeout(timeout);
        controller.abort();
      };
    },
    [tickers, start, requestKey],
  );
  const market =
    marketResult.key === requestKey ? marketResult.data : EMPTY_MARKET;
  const loading = !!tickers && marketResult.key !== requestKey;

  const error = marketResult.key === requestKey ? marketResult.error : "";
  return { market, loading, error };
}
