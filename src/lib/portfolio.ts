import type { Currency, MarketData, Order, PricePoint } from "./types";
import { chronological, validateOrders, shareUnits } from "./validation";
export type Position = {
  ticker: string;
  name: string;
  shares: number;
  average: number;
  costBasis: number;
  invested: number;
  received: number;
  realized: number;
  realizedCost: number;
  price: number | null;
  value: number | null;
  unrealized: number | null;
  unrealizedPercent: number | null;
  realizedPercent: number | null;
  dayGain: number | null;
  issue: string | null;
};
export type OrderGain = {
  gain: number | null;
  percent: number | null;
  shares: number;
};

const gainPercent = (gain: number | null, cost: number) =>
  gain !== null && cost > 0 ? (gain / cost) * 100 : null;

function calculateSnapshot(
  orders: Order[],
  market: MarketData,
  currency: Currency,
) {
  validateOrders(orders);
  const byTicker = new Map<string, Position>();
  const orderGains = new Map<string, OrderGain>();
  const inventory = new Map<
    string,
    {
      units: bigint;
      lots: {
        units: bigint;
        originalUnits: bigint;
        realized: number;
        price: number;
        date: string;
        orderId: string;
      }[];
      head: number;
    }
  >();
  for (const o of chronological(orders)) {
    const p = byTicker.get(o.ticker) ?? {
      ticker: o.ticker,
      name: o.name || o.ticker,
      shares: 0,
      average: 0,
      costBasis: 0,
      invested: 0,
      received: 0,
      realized: 0,
      realizedCost: 0,
      price: null,
      value: null,
      unrealized: null,
      unrealizedPercent: null,
      realizedPercent: null,
      dayGain: null,
      issue: null,
    };
    const stock = inventory.get(o.ticker) ?? { units: 0n, lots: [], head: 0 };
    const quantity = shareUnits(o.shares);
    if (o.type === "buy") {
      stock.lots.push({
        units: quantity,
        originalUnits: quantity,
        realized: 0,
        price: o.pricebuy,
        date: o.date,
        orderId: o.id,
      });
      stock.units += quantity;
      p.invested += o.pricebuy * o.shares;
    } else {
      let remaining = quantity;
      let soldCost = 0;
      // Validation guarantees sufficient units; consume the oldest lots first.
      while (remaining > 0n) {
        const lot = stock.lots[stock.head];
        const consumed = remaining < lot.units ? remaining : lot.units;
        soldCost += (Number(consumed) / 1e8) * lot.price;
        lot.realized += (Number(consumed) / 1e8) * (o.pricebuy - lot.price);
        lot.units -= consumed;
        remaining -= consumed;
        if (lot.units === 0n) stock.head++;
      }
      const gain = o.pricebuy * o.shares - soldCost;
      p.realized += gain;
      p.realizedCost += soldCost;
      orderGains.set(o.id, {
        gain,
        percent: gainPercent(gain, soldCost),
        shares: o.shares,
      });
      p.received += o.pricebuy * o.shares;
      stock.units -= quantity;
    }
    p.shares = Number(stock.units) / 1e8;
    inventory.set(o.ticker, stock);
    byTicker.set(o.ticker, p);
  }
  const positions = [...byTicker.values()];
  for (const p of positions) {
    const stock = inventory.get(p.ticker)!;
    p.costBasis = stock.lots
      .slice(stock.head)
      .reduce((cost, lot) => cost + (Number(lot.units) / 1e8) * lot.price, 0);
    p.average = p.shares > 0 ? p.costBasis / p.shares : 0;
    p.realizedPercent = gainPercent(p.realized, p.realizedCost);
    const q = market[p.ticker];
    p.price =
      q?.currency === currency &&
      q.price !== null &&
      Number.isFinite(q.price) &&
      q.price >= 0
        ? q.price
        : null;
    // Purchase gains include sales attributed to the lot and its remaining value.
    // Sale rows are a second view of the realized part, not additional gains.
    for (const lot of stock.lots) {
      const shares = Number(lot.units) / 1e8;
      const cost = (Number(lot.originalUnits) / 1e8) * lot.price;
      const unrealized =
        shares === 0 ? 0 : p.price === null ? null : shares * (p.price - lot.price);
      const gain = unrealized === null ? null : lot.realized + unrealized;
      orderGains.set(lot.orderId, {
        gain,
        percent: gainPercent(gain, cost),
        shares,
      });
    }
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
      p.unrealized = p.value - p.costBasis;
      p.dayGain =
        q?.previousClose != null
          ? (p.price - q.previousClose) * p.shares
          : null;
    }
    p.unrealizedPercent = gainPercent(p.unrealized, p.costBasis);
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
  const openCost = positions.reduce((cost, p) => cost + p.costBasis, 0);
  const gain = unrealized === null ? null : realized + unrealized;
  return {
    inventory,
    summary: {
      positions,
      orderGains,
      invested,
      realized,
      received: sum("received"),
      value,
      unrealized,
      openCost,
      openRoi:
        unrealized !== null && openCost > 0
          ? (unrealized / openCost) * 100
          : null,
      gain,
      roi: gain === null ? null : invested ? (gain / invested) * 100 : 0,
    },
  };
}
export function calculatePortfolio(
  orders: Order[],
  market: MarketData,
  currency: Currency,
) {
  return calculateSnapshot(orders, market, currency).summary;
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
  end = new Date().toISOString().slice(0, 10),
) {
  if (!orders.length) return [];
  const first = chronological(orders)[0].date;
  const benchmark = market["^GSPC"]?.history ?? [];
  const dates = [
    ...new Set(
      benchmark
        .filter((p) => p.date >= first && p.date <= end)
        .map((p) => p.date),
    ),
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
      openRoi: p.openRoi,
      benchmark: base && close !== null ? (close / base - 1) * 100 : null,
    };
  });
}
function weekKey(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type PerformancePoint = {
  date: string;
  roi: number | null;
  openRoi: number | null;
  benchmark: number | null;
  current?: boolean;
};
export const performancePeriods = ["1D", "5D", "1M", "6M", "YTD", "1A", "Máximo"] as const;
export type PerformancePeriod = (typeof performancePeriods)[number];

export function performanceStart(
  period: PerformancePeriod,
  end: string,
): string | null {
  if (period === "Máximo") return null;
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const date = new Date(`${end}T00:00:00Z`);
  if (period === "1D" || period === "5D") {
    date.setUTCDate(date.getUTCDate() - (period === "5D" ? 4 : 0));
    return date.toISOString().slice(0, 10);
  }
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - { "1M": 1, "6M": 6, "1A": 12 }[period]);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function marketAt(market: MarketData, date: string): MarketData {
  return Object.fromEntries(
    Object.entries(market).map(([ticker, asset]) => [
      ticker,
      { ...asset, price: priceAt(asset.history, date) },
    ]),
  );
}

// Period returns are simple returns on opening capital plus purchases, not TWR.
// Historic FIFO lots retain their acquisition dates so only surviving old units
// need an opening price for the open-positions metric.
export function calculatePerformance(
  orders: Order[],
  market: MarketData,
  currency: Currency,
  period: PerformancePeriod,
  end = new Date().toISOString().slice(0, 10),
) {
  const applicable = chronological(orders.filter((o) => o.date <= end));
  const current = calculateSnapshot(applicable, market, currency);
  const requestedStart = performanceStart(period, end);
  const first = applicable[0]?.date;
  const start =
    requestedStart && first
      ? requestedStart > first
        ? requestedStart
        : first
      : (requestedStart ?? first ?? end);
  const boundaryDate = new Date(`${start}T00:00:00Z`);
  boundaryDate.setUTCDate(boundaryDate.getUTCDate() - 1);
  const boundary = boundaryDate.toISOString().slice(0, 10);
  const benchmark = market["^GSPC"];

  if (requestedStart === null) {
    const data: PerformancePoint[] = calculateHistory(
      applicable,
      market,
      currency,
      end,
    );
    const firstIndexDate = benchmark?.history.find(
      (p) => p.date >= start && p.date <= end,
    )?.date;
    const base = firstIndexDate
      ? priceAt(benchmark?.history ?? [], firstIndexDate)
      : null;
    if (first) {
      const point: PerformancePoint = {
        date: end,
        roi: current.summary.roi,
        openRoi: current.summary.openRoi,
        benchmark:
          base !== null && base > 0 && benchmark?.price != null
            ? (benchmark.price / base - 1) * 100
            : null,
        current: true,
      };
      if (data.at(-1)?.date === end) data[data.length - 1] = point;
      else data.push(point);
    }
    return {
      data,
      roi: current.summary.roi,
      openRoi: current.summary.openRoi,
      start,
      end,
      boundary: null,
    };
  }

  const openingMarket = marketAt(market, boundary);
  const opening = calculatePortfolio(
    applicable.filter((o) => o.date < start),
    openingMarket,
    currency,
  );
  const base = priceAt(benchmark?.history ?? [], boundary);
  const evaluate = (
    date: string,
    prices: MarketData,
    isCurrent = false,
  ): PerformancePoint => {
    const snapshot = isCurrent
      ? current
      : calculateSnapshot(
          applicable.filter((o) => o.date <= date),
          prices,
          currency,
        );
    const flows = applicable.filter((o) => o.date >= start && o.date <= date);
    const purchases = flows
      .filter((o) => o.type === "buy")
      .reduce((sum, o) => sum + o.pricebuy * o.shares, 0);
    const proceeds = flows
      .filter((o) => o.type === "sell")
      .reduce((sum, o) => sum + o.pricebuy * o.shares, 0);
    const capital = opening.value === null ? null : opening.value + purchases;
    const roi =
      snapshot.summary.value !== null && capital !== null && capital > 0
        ? ((snapshot.summary.value + proceeds - capital) / capital) * 100
        : null;
    let openCost: number | null = 0;
    for (const [ticker, stock] of snapshot.inventory) {
      for (const lot of stock.lots.slice(stock.head)) {
        const price =
          lot.date < start ? (openingMarket[ticker]?.price ?? null) : lot.price;
        if (price === null) {
          openCost = null;
          break;
        }
        openCost += (Number(lot.units) / 1e8) * price;
      }
      if (openCost === null) break;
    }
    const openRoi =
      snapshot.summary.value !== null && openCost !== null && openCost > 0
        ? ((snapshot.summary.value - openCost) / openCost) * 100
        : null;
    const indexPrice = isCurrent
      ? (benchmark?.price ?? null)
      : priceAt(benchmark?.history ?? [], date);
    return {
      date,
      roi,
      openRoi,
      benchmark:
        base !== null && base > 0 && indexPrice !== null
          ? (indexPrice / base - 1) * 100
          : null,
      ...(isCurrent ? { current: true } : {}),
    };
  };
  const dates = [
    ...new Set(
      (benchmark?.history ?? [])
        .filter((p) => p.date >= start && p.date < end)
        .map((p) => p.date),
    ),
  ].sort();
  const sampledDates =
    period === "1D" || period === "5D" || period === "1M"
      ? dates
      : dates.filter(
          (date, i) =>
            i === dates.length - 1 || weekKey(date) !== weekKey(dates[i + 1]),
        );
  const data: PerformancePoint[] = first
    ? [
        evaluate(boundary, openingMarket),
        ...sampledDates.map((date) => evaluate(date, marketAt(market, date))),
        evaluate(end, market, true),
      ]
    : [];
  const latest = data.at(-1);
  return {
    data,
    roi: latest?.roi ?? null,
    openRoi: latest?.openRoi ?? null,
    start,
    end,
    boundary,
  };
}
