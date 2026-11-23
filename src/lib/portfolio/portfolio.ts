import type {
  Currency,
  Geography,
  MarketData,
  Order,
  PricePoint,
} from "../types";
import { continentForCountry, type Continent } from "../geography/continents";
import { chronological, validateOrders, shareUnits } from "../validation";
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

type FifoLot = {
  units: bigint;
  originalUnits: bigint;
  realized: number;
  price: number;
  date: string;
  orderId: string;
};

type FifoInventory = { units: bigint; lots: FifoLot[]; head: number };

export function geographicAllocation(
  positions: Position[],
  market: MarketData,
) {
  const open = positions.filter((p) => p.shares > 0);
  if (open.some((p) => p.value === null)) return null;
  const total = open.reduce((n, p) => n + p.value!, 0);
  const values = new Map<Continent, number>();
  const sources: (Pick<
    Geography,
    "asOf" | "source" | "sourceName" | "method" | "holdingsCount"
  > & { ticker: string })[] = [];
  for (const p of open) {
    if (!p.value) continue;
    const data = market[p.ticker]?.geography;
    const sum = data?.allocations.reduce((n, a) => n + a.weight, 0) ?? 0;
    const valid =
      data &&
      data.allocations.length > 0 &&
      sum > 0 &&
      sum <= 1.00000001 &&
      data.allocations.every(
        (a) => Number.isFinite(a.weight) && a.weight >= 0 && a.weight <= 1,
      );
    if (valid) {
      for (const a of data.allocations) {
        const continent = continentForCountry(a.country);
        values.set(
          continent,
          (values.get(continent) ?? 0) + p.value * a.weight,
        );
      }
      sources.push({
        ticker: p.ticker,
        asOf: data.asOf,
        source: data.source,
        sourceName: data.sourceName,
        method: data.method,
        holdingsCount: data.holdingsCount,
      });
    }
    const covered = valid
      ? Math.abs(1 - sum) < 1e-10
        ? 1
        : Math.min(sum, 1)
      : 0;
    const missing = p.value * (1 - covered);
    if (missing > 0)
      values.set("UNKNOWN", (values.get("UNKNOWN") ?? 0) + missing);
  }
  return {
    total,
    allocations: [...values]
      .filter(([, value]) => value > 0)
      .map(([continent, value]) => ({
        continent,
        value,
        percent: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value),
    sources,
    coverage: total > 0 ? (1 - (values.get("UNKNOWN") ?? 0) / total) * 100 : 0,
  };
}

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
  const inventory = new Map<string, FifoInventory>();
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
    p.price = compatiblePrice(q, currency);
    // Purchase gains include sales attributed to the lot and its remaining value.
    // Sale rows are a second view of the realized part, not additional gains.
    for (const lot of stock.lots) {
      const shares = Number(lot.units) / 1e8;
      const cost = (Number(lot.originalUnits) / 1e8) * lot.price;
      const unrealized =
        shares === 0
          ? 0
          : p.price === null
            ? null
            : shares * (p.price - lot.price);
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

function compatiblePrice(
  asset: MarketData[string] | undefined,
  currency: Currency,
): number | null {
  if (
    !asset ||
    asset.currency !== currency ||
    asset.price === null ||
    !Number.isFinite(asset.price) ||
    asset.price < 0
  )
    return null;
  return asset.price;
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
// Use only the portfolio assets' observations, independent of any external index.
function historyDates(
  orders: Order[],
  market: MarketData,
  start: string,
  end: string,
): string[] {
  return [
    ...new Set(
      [...new Set(orders.map((order) => order.ticker))].flatMap((ticker) =>
        (market[ticker]?.history ?? [])
          .filter((point) => point.date >= start && point.date <= end)
          .map((point) => point.date),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
export function calculateHistory(
  orders: Order[],
  market: MarketData,
  currency: Currency,
  end = new Date().toISOString().slice(0, 10),
) {
  if (!orders.length) return [];
  const first = chronological(orders)[0].date;
  const dates = historyDates(orders, market, first, end);
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
    return {
      date,
      roi: p.roi,
      openRoi: p.openRoi,
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
  current?: boolean;
  estimated?: boolean;
};
export const INTRADAY_MAX_AGE_MINUTES = 15;
export const performancePeriods = [
  "1D",
  "5D",
  "1M",
  "6M",
  "YTD",
  "1A",
  "Máximo",
] as const;
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

type PeriodWindow = {
  requestedStart: string | null;
  start: string;
  boundary: string;
};

function periodWindow(
  applicable: Order[],
  period: PerformancePeriod,
  end: string,
): PeriodWindow {
  const requestedStart = performanceStart(period, end);
  const first = applicable[0]?.date;
  const start =
    requestedStart && first
      ? requestedStart > first
        ? requestedStart
        : first
      : (requestedStart ?? first ?? end);
  return {
    requestedStart,
    start,
    boundary: previousCalendarDay(start),
  };
}

function addOpeningLotsCost(
  runningCost: number,
  stock: FifoInventory,
  openingPrice: number | null,
  start: string,
): number | null {
  let cost = runningCost;
  for (const lot of stock.lots.slice(stock.head)) {
    const price = lot.date < start ? openingPrice : lot.price;
    if (price === null) return null;
    cost += (Number(lot.units) / 1e8) * price;
  }
  return cost;
}

function simpleReturn(
  finalValue: number | null,
  cost: number | null,
): { gain: number | null; percent: number | null } {
  const gain = finalValue !== null && cost !== null ? finalValue - cost : null;
  return {
    gain,
    percent:
      gain !== null && cost !== null && cost > 0 ? (gain / cost) * 100 : null,
  };
}

export type PositionPeriodReturn = {
  gain: number | null;
  percent: number | null;
};

export function calculatePositionPeriodReturns({
  orders,
  market,
  currency,
  period,
  end,
}: {
  orders: Order[];
  market: MarketData;
  currency: Currency;
  period: PerformancePeriod;
  end: string;
}): Map<string, PositionPeriodReturn> {
  const applicable = chronological(orders.filter((order) => order.date <= end));
  const snapshot = calculateSnapshot(applicable, market, currency);
  const returns = new Map<string, PositionPeriodReturn>();

  if (period === "Máximo") {
    for (const position of snapshot.summary.positions) {
      if (position.shares <= 0) continue;
      returns.set(position.ticker, {
        gain: position.unrealized,
        percent: position.unrealizedPercent,
      });
    }

    return returns;
  }

  const window = periodWindow(applicable, period, end);

  for (const position of snapshot.summary.positions) {
    if (position.shares <= 0) continue;

    const openingPrice = priceAt(
      market[position.ticker]?.history ?? [],
      window.boundary,
    );
    const stock = snapshot.inventory.get(position.ticker)!;
    const openingCost = addOpeningLotsCost(
      0,
      stock,
      openingPrice,
      window.start,
    );
    returns.set(position.ticker, simpleReturn(position.value, openingCost));
  }

  return returns;
}

function historicalMarketsAt(
  market: MarketData,
  dates: string[],
): Map<string, MarketData> {
  const cursors = new Map<string, number>();
  const prices = new Map<string, number | null>();
  const markets = new Map<string, MarketData>();
  const tickers = Object.keys(market);
  for (const date of dates) {
    const historical: MarketData = {};
    for (const ticker of tickers) {
      const asset = market[ticker];
      const history = asset.history;
      let index = cursors.get(ticker) ?? -1;
      while (index + 1 < history.length && history[index + 1].date <= date) {
        index++;
        prices.set(ticker, history[index].close);
      }
      cursors.set(ticker, index);
      historical[ticker] = { ...asset, price: prices.get(ticker) ?? null };
    }
    markets.set(date, historical);
  }
  return markets;
}

type DailyFlows = { purchases: number; sales: number };

function groupFlowsByDate(orders: Order[]): Map<string, DailyFlows> {
  const flows = new Map<string, DailyFlows>();
  for (const order of orders) {
    const day = flows.get(order.date) ?? { purchases: 0, sales: 0 };
    const amount = order.pricebuy * order.shares;
    if (order.type === "buy") day.purchases += amount;
    else day.sales += amount;
    flows.set(order.date, day);
  }
  return flows;
}

type HoldingsCursor = {
  advanceThrough(date: string): Map<string, bigint>;
};

function createHoldingsCursor(orders: Order[]): HoldingsCursor {
  let index = 0;
  const units = new Map<string, bigint>();
  return {
    advanceThrough(date) {
      while (index < orders.length && orders[index].date <= date) {
        const order = orders[index++];
        const delta = shareUnits(order.shares);
        const next =
          (units.get(order.ticker) ?? 0n) +
          (order.type === "buy" ? delta : -delta);
        units.set(order.ticker, next);
      }
      return units;
    },
  };
}

function valueHoldings(
  units: Map<string, bigint>,
  prices: MarketData,
  currency: Currency,
): { value: number | null; hasUnits: boolean } {
  let value = 0;
  let hasUnits = false;
  for (const [ticker, quantity] of units) {
    if (quantity <= 0n) continue;
    hasUnits = true;
    const price = compatiblePrice(prices[ticker], currency);
    if (price === null) return { value: null, hasUnits };
    value += (Number(quantity) / 1e8) * price;
    if (!Number.isFinite(value)) return { value: null, hasUnits };
  }
  return { value, hasUnits };
}

function previousCalendarDay(date: string): string {
  const previous = new Date(`${date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function tickersHeldDuringPeriod(orders: Order[], start: string): Set<string> {
  const holdings = new Map<string, bigint>();
  const tickers = new Set<string>();

  for (const order of orders) {
    if (order.date >= start) {
      for (const [ticker, units] of holdings) {
        if (units > 0n) tickers.add(ticker);
      }
    }

    const orderUnits = shareUnits(order.shares);
    const positionUnits = holdings.get(order.ticker) ?? 0n;
    const nextUnits =
      positionUnits + (order.type === "buy" ? orderUnits : -orderUnits);
    holdings.set(order.ticker, nextUnits);

    if (order.date >= start && nextUnits > 0n) tickers.add(order.ticker);
  }

  for (const [ticker, units] of holdings) {
    if (units > 0n) tickers.add(ticker);
  }

  return tickers;
}

function zeroCloseDates(
  market: MarketData,
  orders: Order[],
  start: string,
  end: string,
): string[] {
  const heldTickers = tickersHeldDuringPeriod(orders, start);
  const dates = new Set<string>();
  for (const ticker of heldTickers) {
    const asset = market[ticker];
    if (!asset) continue;

    for (const point of asset.history) {
      const isZeroCloseInPeriod =
        point.close === 0 && point.date >= start && point.date <= end;
      if (isZeroCloseInPeriod) dates.add(point.date);
    }
  }

  return [...dates];
}

function calculateIntradayTwrReturn(
  openingValue: number | null,
  flows: DailyFlows,
  value: number | null,
): number | null {
  const capital = openingValue === null ? null : openingValue + flows.purchases;
  if (capital === null || capital <= 0 || value === null) return null;
  return ((value + flows.sales - capital) / capital) * 100;
}

function withEstimatedFlag(
  point: PerformancePoint,
  estimated: boolean,
): PerformancePoint {
  if (!estimated || (point.roi === null && point.openRoi === null))
    return point;
  return { ...point, estimated: true };
}

type TwrPointInput = {
  date: string;
  value: number | null;
  hasUnits: boolean;
};

type TwrLinkState = {
  factor: number;
  exposed: boolean;
  base: number | null;
  baseHasUnits: boolean;
};

function closeTwrSubperiod(
  state: TwrLinkState,
  value: number | null,
  sales: number,
) {
  if (state.factor === 0) return;
  if (
    !Number.isFinite(state.factor) ||
    value === null ||
    !Number.isFinite(value) ||
    state.base === null ||
    !Number.isFinite(state.base)
  ) {
    state.factor = Number.NaN;
    return;
  }
  if (state.base < 0 || value < 0) {
    state.factor = Number.NaN;
    return;
  }
  if (state.base === 0) {
    if (state.baseHasUnits) state.factor = Number.NaN;
    return;
  }
  const nextFactor = state.factor * ((value + sales) / state.base);
  state.factor =
    Number.isFinite(nextFactor) && nextFactor >= 0 ? nextFactor : Number.NaN;
}

function timeWeightedPointReturn(
  state: TwrLinkState,
  point: TwrPointInput,
  sales: number,
): number | null {
  if (state.factor === 0) return -100;
  if (
    !state.exposed ||
    !Number.isFinite(state.factor) ||
    point.value === null ||
    !Number.isFinite(point.value)
  )
    return null;
  if (state.base === 0) {
    if (!point.hasUnits && sales === 0) return (state.factor - 1) * 100;
    return null;
  }
  if (state.base === null || state.base < 0 || !Number.isFinite(state.base))
    return null;
  const linked = state.factor * ((point.value + sales) / state.base);
  return Number.isFinite(linked) ? (linked - 1) * 100 : null;
}

function assignTimeWeightedPointReturns(options: {
  date: string;
  dailyFlows: DailyFlows | undefined;
  points: TwrPointInput[];
  state: TwrLinkState;
  result: (number | null)[];
}) {
  for (const [index, point] of options.points.entries()) {
    if (point.date !== options.date) continue;
    options.result[index] = timeWeightedPointReturn(
      options.state,
      point,
      options.dailyFlows?.sales ?? 0,
    );
  }
}

function beginFlowSubperiod(options: {
  date: string;
  dailyFlows: DailyFlows | undefined;
  state: TwrLinkState;
  valueAt(date: string): TwrPointInput;
}) {
  const { dailyFlows } = options;
  if (!dailyFlows) return;
  const prior = options.valueAt(previousCalendarDay(options.date));
  closeTwrSubperiod(options.state, prior.value, 0);
  options.state.base =
    prior.value === null ? null : prior.value + dailyFlows.purchases;
  const holdingsAfterTrades = options.valueAt(options.date);
  options.state.baseHasUnits = holdingsAfterTrades.hasUnits;
  if (options.state.base !== null && options.state.base > 0)
    options.state.exposed = true;
}

function closeSaleSubperiod(options: {
  date: string;
  end: string;
  dailyFlows: DailyFlows | undefined;
  state: TwrLinkState;
  valueAt(date: string): TwrPointInput;
}) {
  if (!options.dailyFlows?.sales || options.date >= options.end) return;
  const closingValue = options.valueAt(options.date);
  closeTwrSubperiod(
    options.state,
    closingValue.value,
    options.dailyFlows.sales,
  );
  options.state.base = closingValue.value;
  options.state.baseHasUnits = closingValue.hasUnits;
}

function applyZeroValueLoss(options: {
  date: string;
  start: string;
  end: string;
  state: TwrLinkState;
  valueAt(date: string): TwrPointInput;
}) {
  if (options.date < options.start || options.date >= options.end) return;

  const closingValue = options.valueAt(options.date);
  if (closingValue.hasUnits && closingValue.value === 0) {
    // Zero determines the linked result even after an unknown factor.
    options.state.factor = 0;
  }
}

function linkTimeWeightedReturns(options: {
  start: string;
  end: string;
  boundaryValue: number | null;
  boundaryHasUnits: boolean;
  flows: Map<string, DailyFlows>;
  zeroValueDates: Set<string>;
  points: TwrPointInput[];
  valueAt(date: string): TwrPointInput;
}): (number | null)[] {
  const pointDates = new Set(options.points.map((point) => point.date));
  const flowDates = [...options.flows.keys()];
  const dates = [
    ...new Set([
      ...pointDates,
      ...flowDates,
      ...flowDates.map(previousCalendarDay),
      ...options.zeroValueDates,
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const state: TwrLinkState = {
    factor: 1,
    exposed: options.boundaryHasUnits,
    base: options.boundaryValue,
    baseHasUnits: options.boundaryHasUnits,
  };
  const result = options.points.map((): number | null => null);
  if (state.base === null) state.factor = Number.NaN;
  if (state.base !== null && state.base > 0) state.exposed = true;

  for (const date of dates) {
    const dailyFlows = options.flows.get(date);
    beginFlowSubperiod({ date, dailyFlows, state, valueAt: options.valueAt });

    if (date < options.end) {
      applyZeroValueLoss({
        date,
        start: options.start,
        end: options.end,
        state,
        valueAt: options.valueAt,
      });
    }

    assignTimeWeightedPointReturns({
      date,
      dailyFlows,
      points: options.points,
      state,
      result,
    });

    closeSaleSubperiod({
      date,
      end: options.end,
      dailyFlows,
      state,
      valueAt: options.valueAt,
    });
  }
  return result;
}

function calculateLinkedPerformancePoints(options: {
  applicable: Order[];
  market: MarketData;
  currency: Currency;
  start: string;
  end: string;
  boundary: string;
  flows: Map<string, DailyFlows>;
  sampledPoints: PerformancePoint[];
  hasCurrentPoint: boolean;
}): { pointInputs: TwrPointInput[]; linkedRois: (number | null)[] } {
  const flowsInPeriod = new Map(
    [...options.flows].filter(
      ([date]) => date >= options.start && date <= options.end,
    ),
  );
  const candidateZeroDates = zeroCloseDates(
    options.market,
    options.applicable,
    options.start,
    options.end,
  ).filter((date) => date < options.end);
  const requiredDates = new Set<string>([
    options.boundary,
    ...options.sampledPoints.map((point) => point.date),
    ...candidateZeroDates,
    ...(options.hasCurrentPoint ? [options.end] : []),
    ...flowsInPeriod.keys(),
    ...[...flowsInPeriod.keys()].map(previousCalendarDay),
    ...[...flowsInPeriod.keys()].filter(
      (date) => date < options.end && (flowsInPeriod.get(date)?.sales ?? 0) > 0,
    ),
  ]);
  const valuationDates = [...requiredDates].sort((left, right) =>
    left.localeCompare(right),
  );
  const historicalMarkets = historicalMarketsAt(options.market, valuationDates);
  const holdingsCursor = createHoldingsCursor(options.applicable);
  const historicalValueCache = new Map<string, TwrPointInput>();
  for (const date of valuationDates) {
    const holdings = holdingsCursor.advanceThrough(date);
    const prices =
      date === options.end ? options.market : historicalMarkets.get(date)!;
    const valued = valueHoldings(holdings, prices, options.currency);
    historicalValueCache.set(date, {
      date,
      value: valued.value,
      hasUnits: valued.hasUnits,
    });
  }
  const pointInputs: TwrPointInput[] = [
    ...options.sampledPoints.map((point) =>
      historicalValueCache.get(point.date)!,
    ),
    ...(options.hasCurrentPoint
      ? [historicalValueCache.get(options.end)!]
      : []),
  ];
  const boundaryValue = historicalValueCache.get(options.boundary)!;
  const linkedRois = linkTimeWeightedReturns({
    start: options.start,
    end: options.end,
    boundaryValue: boundaryValue.value,
    boundaryHasUnits: boundaryValue.hasUnits,
    flows: flowsInPeriod,
    zeroValueDates: new Set(candidateZeroDates),
    points: pointInputs,
    valueAt(date) {
      const value = historicalValueCache.get(date);
      if (!value)
        throw new Error(`Missing required TWR valuation date: ${date}`);
      return value;
    },
  });
  return { pointInputs, linkedRois };
}

// Compras entram no início do dia e vendas no fim, ambas ao preço da ordem.
// Sem hora de execução, não é possível determinar a sequência de venda e
// recompra no mesmo dia; a diferença para o fecho conta nesse dia.
// O TWR encadeia subperíodos; os lotes FIFO suportam a métrica de posições abertas.
// Historic FIFO lots retain their acquisition dates so only surviving old units
// need an opening price for the open-positions metric.
export function calculatePerformance(
  orders: Order[],
  market: MarketData,
  currency: Currency,
  period: PerformancePeriod,
  end = new Date().toISOString().slice(0, 10),
  asOf = new Date().toISOString(),
) {
  const applicable = chronological(orders.filter((o) => o.date <= end));
  const current = calculateSnapshot(applicable, market, currency);
  const { requestedStart, start, boundary } = periodWindow(
    applicable,
    period,
    end,
  );
  const first = applicable[0]?.date;
  const flows = groupFlowsByDate(applicable);

  const openingMarket = marketAt(market, boundary);
  const opening = calculatePortfolio(
    applicable.filter((o) => o.date < start),
    openingMarket,
    currency,
  );
  function evaluatePerformancePoint(
    date: string,
    prices: MarketData,
    isCurrent = false,
  ): PerformancePoint & { value?: number | null } {
    const snapshot = isCurrent
      ? current
      : calculateSnapshot(
          applicable.filter((o) => o.date <= date),
          prices,
          currency,
        );
    let openCost: number | null = 0;
    for (const [ticker, stock] of snapshot.inventory) {
      openCost = addOpeningLotsCost(
        openCost,
        stock,
        openingMarket[ticker]?.price ?? null,
        start,
      );
      if (openCost === null) break;
    }
    const openReturn = simpleReturn(snapshot.summary.value, openCost);
    const openRoi =
      openCost !== null && openCost > 0 ? openReturn.percent : null;
    return {
      date,
      roi: null,
      openRoi,
      value: snapshot.summary.value,
      ...(isCurrent ? { current: true } : {}),
    };
  }

  if (period === "1D") {
    // Orders have dates, not execution times: the day's registered orders apply
    // throughout the session. Keep the same FIFO and period-return evaluation.
    const tickers = [...new Set(applicable.map((order) => order.ticker))];
    const cutoff = Date.parse(asOf);
    function buildIntradaySeries(ticker: string) {
      const observations = new Map<number, number | null>();
      for (const point of market[ticker]?.intraday ?? []) {
        if (!point.date.includes("T")) continue;
        const time = Date.parse(point.date);
        if (!Number.isFinite(time) || !Number.isFinite(cutoff) || time > cutoff)
          continue;
        if (new Date(time).toISOString().slice(0, 10) !== end) continue;
        observations.set(
          time,
          typeof point.close === "number" &&
            Number.isFinite(point.close) &&
            point.close >= 0
            ? point.close
            : null,
        );
      }
      return [ticker, [...observations].sort(([a], [b]) => a - b)] as const;
    }

    const series = new Map(tickers.map(buildIntradaySeries));
    const observedTimes = [
      ...new Set(
        [...series.values()].flatMap((points) => points.map(([time]) => time)),
      ),
    ].sort((a, b) => a - b);
    const openTickers = new Set(
      current.summary.positions
        .filter((p) => p.shares > 0)
        .map((p) => p.ticker),
    );
    // Include omitted five-minute bars as well as explicit null observations.
    // This prevents a long outage being drawn as a continuous line.
    const timeSet = new Set(observedTimes);
    for (
      let time = observedTimes[0];
      time < observedTimes.at(-1)!;
      time += 5 * 60_000
    ) {
      timeSet.add(time);
    }
    // A quote recovering between grid ticks must not bridge an expired price.
    for (const ticker of openTickers) {
      const valid = (series.get(ticker) ?? []).filter(
        (point): point is [number, number] => point[1] !== null,
      );
      valid.forEach(([time], index) => {
        const expiredAt = time + INTRADAY_MAX_AGE_MINUTES * 60_000 + 1;
        if (
          expiredAt < (valid[index + 1]?.[0] ?? Infinity) &&
          expiredAt <= observedTimes.at(-1)!
        ) {
          timeSet.add(expiredAt);
        }
      });
    }
    const times = [...timeSet].sort((a, b) => a - b);
    const cursors = new Map<string, number>();
    const lastValid = new Map<string, [number, number]>();
    function evaluateIntradayPoint(time: number): PerformancePoint {
      const prices: MarketData = {};
      let estimated = false;
      for (const ticker of tickers) {
        const asset = market[ticker];
        if (!asset) continue;
        const observations = series.get(ticker)!;
        let index = cursors.get(ticker) ?? -1;
        while (
          index + 1 < observations.length &&
          observations[index + 1][0] <= time
        ) {
          index++;
          const [observedAt, close] = observations[index];
          if (close !== null) lastValid.set(ticker, [observedAt, close]);
        }
        cursors.set(ticker, index);
        const valid = lastValid.get(ticker);
        const usable =
          valid && time - valid[0] <= INTRADAY_MAX_AGE_MINUTES * 60_000;
        prices[ticker] = { ...asset, price: usable ? valid[1] : null };
        if (usable && valid[0] < time && openTickers.has(ticker))
          estimated = true;
      }
      const point = evaluatePerformancePoint(end, prices);
      point.date = new Date(time).toISOString();
      const dailyFlows = flows.get(end) ?? { purchases: 0, sales: 0 };
      point.roi = calculateIntradayTwrReturn(
        opening.value,
        dailyFlows,
        point.value ?? null,
      );
      delete point.value;
      return withEstimatedFlag(point, estimated);
    }

    const data = times.map(evaluateIntradayPoint);
    const latest = data.at(-1);
    if (latest) latest.current = true;
    return {
      data,
      roi: latest?.roi ?? null,
      openRoi: latest?.openRoi ?? null,
      start,
      end,
      boundary,
    };
  }
  const dates = historyDates(applicable, market, start, end).filter(
    (date) => date < end,
  );
  const sampledDates =
    period === "5D" || period === "1M"
      ? dates
      : dates.filter(
          (date, i) =>
            i === dates.length - 1 || weekKey(date) !== weekKey(dates[i + 1]),
        );
  const sampledPoints = first
    ? sampledDates.map((date) =>
        evaluatePerformancePoint(date, marketAt(market, date)),
      )
    : [];
  const currentPoint = first
    ? evaluatePerformancePoint(end, market, true)
    : null;
  const { linkedRois } = calculateLinkedPerformancePoints({
    applicable,
    market,
    currency,
    start,
    end,
    boundary,
    flows,
    sampledPoints,
    hasCurrentPoint: currentPoint !== null,
  });
  const data: PerformancePoint[] = [];
  if (first && requestedStart !== null) {
    const boundaryPoint = evaluatePerformancePoint(boundary, openingMarket);
    boundaryPoint.roi = opening.value !== null && opening.value > 0 ? 0 : null;
    data.push(boundaryPoint);
  }
  data.push(...sampledPoints);
  if (currentPoint) data.push(currentPoint);
  let linkedIndex = 0;
  for (const point of data) {
    if (point.current) {
      point.roi = linkedRois.at(-1) ?? null;
    } else if (point.date !== boundary) {
      point.roi = linkedRois[linkedIndex] ?? null;
      linkedIndex++;
    }
    delete (point as PerformancePoint & { value?: number | null }).value;
  }
  const latest = data.at(-1);
  return {
    data,
    roi: latest?.roi ?? null,
    openRoi: latest?.openRoi ?? null,
    start,
    end,
    boundary: requestedStart === null ? null : boundary,
  };
}
