"use client";
import { useEffect, useRef, useState } from "react";
import type { Geography } from "@/lib/types";

type Entry = { value: Geography | null; expires: number };
const DAY = 86_400_000;
const RETRY = 300_000;

/** Session cache contains only public compositions, keyed by ticker. */
export function useGeography(
  tickers: string,
  enabled: boolean,
  refresh: number,
) {
  const cache = useRef(new Map<string, Entry>());
  const pending = useRef(new Map<string, Promise<void>>());
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  useEffect(() => {
    if (!enabled || !tickers) return;
    let cancelled = false;
    const requested = tickers.split(",");
    const missing = requested.filter(
      (ticker) =>
        (cache.current.get(ticker)?.expires ?? 0) <= Date.now() &&
        !pending.current.has(ticker),
    );
    if (missing.length) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      const task = Promise.resolve().then(async () => {
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
          cache.current.set(ticker, {
            value,
            expires: Date.now() + (value ? DAY : RETRY),
          });
          pending.current.delete(ticker);
        }
      });
      for (const ticker of missing) pending.current.set(ticker, task);
    }
    // Keep in-flight public requests alive across tab changes and reuse their result.
    void Promise.all(
      requested.map((ticker) => pending.current.get(ticker)),
    ).then(() => {
      if (!cancelled) setEntries(Object.fromEntries(cache.current));
    });
    return () => {
      cancelled = true;
    };
  }, [tickers, enabled, refresh]);
  const requested = tickers ? tickers.split(",") : [];
  return {
    data: Object.fromEntries(
      requested.map((ticker) => [ticker, entries[ticker]?.value ?? null]),
    ),
    loading: enabled && requested.some((ticker) => !entries[ticker]),
  };
}
