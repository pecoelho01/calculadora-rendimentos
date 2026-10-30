import type { Currency, MarketData, Order, PricePoint } from "./types";
import { chronological, validateOrders, shareUnits } from "./validation";
export type Position = {
  ticker: string;
  name: string;
  shares: number;
  average: number;
  invested: number;
  received: number;
  realized: number;
  price: number | null;
  value: number | null;
  unrealized: number | null;
  dayGain: number | null;
  issue: string | null;
};
export function calculatePortfolio(
  orders: Order[],
  market: MarketData,
  currency: Currency,
) {
  validateOrders(orders);
  const byTicker = new Map<string, Position>();
  const units = new Map<string, bigint>();
  for (const o of chronological(orders)) {
    const p = byTicker.get(o.ticker) ?? {
      ticker: o.ticker,
      name: o.name || o.ticker,
      shares: 0,
      average: 0,
      invested: 0,
      received: 0,
      realized: 0,
      price: null,
      value: null,
      unrealized: null,
      dayGain: null,
      issue: null,
    };
    if (o.type === "buy") {
      p.average =
        (p.average * p.shares + o.pricebuy * o.shares) / (p.shares + o.shares);
      units.set(o.ticker, (units.get(o.ticker) ?? 0n) + shareUnits(o.shares));
      p.shares = Number(units.get(o.ticker)) / 1e8;
      p.invested += o.pricebuy * o.shares;
    } else {
      p.realized += (o.pricebuy - p.average) * o.shares;
      p.received += o.pricebuy * o.shares;
      units.set(o.ticker, (units.get(o.ticker) ?? 0n) - shareUnits(o.shares));
      p.shares = Number(units.get(o.ticker)) / 1e8;
      if (units.get(o.ticker) === 0n) p.average = 0;
    }
    byTicker.set(o.ticker, p);
  }
  const positions = [...byTicker.values()];
  for (const p of positions) {
    const q = market[p.ticker];
    p.price =
      q?.currency === currency &&
      q.price !== null &&
      Number.isFinite(q.price) &&
      q.price >= 0
        ? q.price
        : null;
    if (!p.shares) {
      p.value = 0;
      p.unrealized = 0;
      p.dayGain = 0;
      continue;
    }
    if (p.price === null)
      p.issue =
        q?.currency && q.currency !== currency
          ? `Cotação em ${q.currency}; carteira em ${currency}`
          : "Cotação indisponível";
    else {
      p.value = p.price * p.shares;
      p.unrealized = (p.price - p.average) * p.shares;
      p.dayGain =
        q?.previousClose != null
          ? (p.price - q.previousClose) * p.shares
          : null;
    }
  }
  const sum = (key: "invested" | "received" | "realized") =>
    positions.reduce((n, p) => n + p[key], 0);
  const invested = sum("invested"),
    realized = sum("realized");
  const complete = positions.every((p) => p.value !== null);
  const value = complete
    ? positions.reduce((n, p) => n + (p.value ?? 0), 0)
    : null;
  const unrealized = complete
    ? positions.reduce((n, p) => n + (p.unrealized ?? 0), 0)
    : null;
  const gain = unrealized === null ? null : realized + unrealized;
  return {
    positions,
    invested,
    realized,
    received: sum("received"),
    value,
    unrealized,
    gain,
    roi: gain === null ? null : invested ? (gain / invested) * 100 : 0,
  };
}
export function priceAt(history: PricePoint[], date: string): number | null {
  // Histories are sorted ascending by the server. Never take a future observation.
  let value: number | null = null;
  for (const p of history) {
    if (p.date > date) break;
    value = p.close;
  }
  return value;
}
export function calculateHistory(
  orders: Order[],
  market: MarketData,
  currency: Currency,
) {
  if (!orders.length) return [];
  const first = chronological(orders)[0].date;
  const benchmark = market["^GSPC"]?.history ?? [];
  const dates = [
    ...new Set(benchmark.filter((p) => p.date >= first).map((p) => p.date)),
  ].sort();
  const base = dates.length ? priceAt(benchmark, dates[0]) : null;
  // Last trading observation of each ISO week; all transactions up to that day are included.
  const weekly = dates.filter(
    (date, i) =>
      i === dates.length - 1 || weekKey(date) !== weekKey(dates[i + 1]),
  );
  return weekly.map((date) => {
    const historical: MarketData = {};
    for (const ticker of new Set(orders.map((o) => o.ticker))) {
      const asset = market[ticker];
      if (asset)
        historical[ticker] = { ...asset, price: priceAt(asset.history, date) };
    }
    const p = calculatePortfolio(
      orders.filter((o) => o.date <= date),
      historical,
      currency,
    );
    const close = priceAt(benchmark, date);
    return {
      date,
      roi: p.roi,
      benchmark: base && close !== null ? (close / base - 1) * 100 : null,
    };
  });
}
function weekKey(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
