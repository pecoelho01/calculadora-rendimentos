"use client";
import { useEffect, useMemo, useState } from "react";
import type { Geography } from "@/lib/types";

type Entry = { value: Geography | null; expires: number };
export type AssetCountryCache = {
  cache: Map<string, Entry>;
  pending: Map<string, Promise<void>>;
};
export function createAssetCountryCache(): AssetCountryCache {
  return { cache: new Map(), pending: new Map() };
}
const DAY = 86_400_000;
const RETRY = 300_000;

/** Session cache contains only public compositions, keyed by ticker. */
export function useAssetCountries(
  tickers: string,
  enabled: boolean,
  refresh: number,
  sharedCache?: AssetCountryCache,
) {
  const geographyCache = useMemo(
    () => sharedCache ?? createAssetCountryCache(),
    [sharedCache],
  );
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  useEffect(
    function loadRequestedGeographies() {
      if (!enabled || !tickers) return;
      let cancelled = false;
      const requested = tickers.split(",");
      const missing = requested.filter(
        (ticker) =>
          (geographyCache.cache.get(ticker)?.expires ?? 0) <= Date.now() &&
          !geographyCache.pending.has(ticker),
      );
      if (missing.length) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35_000);
        async function loadMissingGeographies() {
          let data: Record<string, Geography | null> = {};
          try {
            const response = await fetch(
              `/api/geography?${new URLSearchParams({ tickers: missing.join(",") })}`,
              { signal: controller.signal },
            );
            if (!response.ok) throw new Error("Composição indisponível");
            const body = await response.json();
            if (body.geographies && typeof body.geographies === "object")
              data = body.geographies;
          } catch {
            // Unavailability is local to the chart; quotes and portfolio remain usable.
          } finally {
            clearTimeout(timeout);
          }
          for (const ticker of missing) {
            const value = data[ticker] ?? null;
            geographyCache.cache.set(ticker, {
              value,
              expires: Date.now() + (value ? DAY : RETRY),
            });
            geographyCache.pending.delete(ticker);
          }
        }
        const task = Promise.resolve().then(loadMissingGeographies);
        for (const ticker of missing) geographyCache.pending.set(ticker, task);
      }
      // Keep in-flight public requests alive across tab changes and reuse their result.
      void Promise.all(
        requested.map((ticker) => geographyCache.pending.get(ticker)),
      ).then(() => {
        if (!cancelled) setEntries(Object.fromEntries(geographyCache.cache));
      });
      return () => {
        cancelled = true;
      };
    },
    [tickers, enabled, refresh, geographyCache],
  );
  const requested = tickers ? tickers.split(",") : [];
  return {
    data: Object.fromEntries(
      requested.map((ticker) => [ticker, entries[ticker]?.value ?? null]),
    ),
    loading: enabled && requested.some((ticker) => !entries[ticker]),
  };
}
