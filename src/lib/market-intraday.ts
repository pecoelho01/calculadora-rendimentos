import type { IntradayPoint } from "./types";

/** Keep only observed timestamps in the requested window, preserving missing prices. */
export function normalizeIntraday(
  quotes: readonly { date: Date; close?: number | null }[],
  start: Date,
  end: Date,
): IntradayPoint[] {
  const first = start.getTime();
  const last = end.getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) return [];
  const points = new Map<string, IntradayPoint>();
  for (const quote of quotes) {
    const timestamp = quote.date instanceof Date ? quote.date.getTime() : NaN;
    if (!Number.isFinite(timestamp) || timestamp < first || timestamp > last) continue;
    const date = quote.date.toISOString();
    const close = typeof quote.close === "number" && Number.isFinite(quote.close) && quote.close >= 0
      ? quote.close
      : null;
    points.set(date, { date, close });
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
