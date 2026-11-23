import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePerformance,
  calculatePositionPeriodReturns,
} from "../../src/lib/portfolio/portfolio";
import type { MarketData, Order } from "../../src/lib/types";

function buy(
  ticker: string,
  shares: number,
  pricebuy: number,
  date: string,
): Order {
  return {
    id: crypto.randomUUID(),
    ticker,
    name: ticker,
    shares,
    pricebuy,
    date,
    type: "buy",
  };
}

function sell(
  ticker: string,
  shares: number,
  pricebuy: number,
  date: string,
): Order {
  return { ...buy(ticker, shares, pricebuy, date), type: "sell" };
}

function marketAsset(
  price: number | null,
  history: { date: string; close: number }[],
  currency = "EUR",
): MarketData[string] {
  return {
    price,
    previousClose: null,
    currency,
    name: "Teste",
    asOf: null,
    history,
  };
}

function returns(
  orders: Order[],
  market: MarketData,
  period: "1D" | "5D" | "1M" | "6M" | "YTD" | "1A" | "Máximo" = "6M",
  end = "2024-10-31",
) {
  return calculatePositionPeriodReturns({
    orders,
    market,
    currency: "EUR",
    period,
    end,
  });
}

const history = [
  { date: "2024-04-29", close: 120 },
  { date: "2024-05-02", close: 130 },
  { date: "2024-10-25", close: 140 },
];

test("retorno do período usa custo FIFO dos lotes ainda detidos", () => {
  const orders = [buy("P", 1, 100, "2024-01-01")];
  assert.deepEqual(returns(orders, { P: marketAsset(180, history) }).get("P"), {
    gain: 60,
    percent: 50,
  });
  assert.deepEqual(
    returns(orders, { P: marketAsset(180, history) }, "Máximo").get("P"),
    {
      gain: 80,
      percent: 80,
    },
  );
  assert.deepEqual(
    returns([buy("P", 1, 150, "2024-05-01")], {
      P: marketAsset(180, history),
    }).get("P"),
    { gain: 30, percent: 20 },
  );
});

test("vendas FIFO e recompras preservam a mesma base de posições abertas do gráfico", () => {
  const orders = [
    buy("P", 2, 100, "2024-01-01"),
    buy("P", 1, 150, "2024-05-01"),
    sell("P", 1, 200, "2024-05-02"),
  ];
  const result = returns(orders, { P: marketAsset(180, history) }).get("P");
  assert.equal(result?.gain, 90);
  assert.ok(Math.abs(result!.percent! - 100 / 3) < 1e-10);
  const chart = calculatePerformance(
    orders,
    { P: marketAsset(180, history) },
    "EUR",
    "6M",
    "2024-10-31",
  );
  assert.equal(result?.percent, chart.openRoi);

  const missingBoundary = [
    buy("P", 1, 100, "2024-01-01"),
    sell("P", 1, 130, "2024-05-01"),
    buy("P", 1, 50, "2024-05-02"),
  ];
  assert.deepEqual(
    returns(missingBoundary, {
      P: marketAsset(60, [{ date: "2024-05-02", close: 130 }]),
    }).get("P"),
    { gain: 10, percent: 20 },
  );
  const tickerWithMissingBoundary = returns(
    [buy("P", 1, 100, "2024-01-01"), buy("B", 1, 50, "2024-05-01")],
    {
      P: marketAsset(180, [{ date: "2024-05-02", close: 130 }]),
      B: marketAsset(60, [{ date: "2024-05-02", close: 130 }]),
    },
  );
  assert.deepEqual(tickerWithMissingBoundary.get("P"), {
    gain: null,
    percent: null,
  });
  assert.deepEqual(tickerWithMissingBoundary.get("B"), {
    gain: 10,
    percent: 20,
  });
});

test("fronteira ausente, zero válido e preço atual em falta são distintos", () => {
  const order = [buy("P", 1, 100, "2024-01-01")];
  assert.deepEqual(
    returns(order, {
      P: marketAsset(180, [{ date: "2024-05-02", close: 130 }]),
    }).get("P"),
    {
      gain: null,
      percent: null,
    },
  );
  assert.deepEqual(
    returns(order, {
      P: marketAsset(180, [{ date: "2024-04-29", close: 0 }]),
    }).get("P"),
    {
      gain: 180,
      percent: null,
    },
  );
  assert.deepEqual(
    returns(order, {
      P: marketAsset(0, [{ date: "2024-04-29", close: 120 }]),
    }).get("P"),
    {
      gain: -120,
      percent: -100,
    },
  );
  assert.deepEqual(returns(order, { P: marketAsset(null, history) }).get("P"), {
    gain: null,
    percent: null,
  });
  assert.equal(
    returns(order, { P: marketAsset(180, history, "USD") }).get("P")?.gain,
    null,
  );
});

test("retorna apenas posições abertas e ignora ordens posteriores ao fim", () => {
  const closed = [
    buy("P", 1, 100, "2024-01-01"),
    sell("P", 1, 130, "2024-05-01"),
  ];
  assert.equal(
    returns(closed, { P: marketAsset(180, history) }).has("P"),
    false,
  );
  const future = [
    buy("P", 1, 100, "2024-01-01"),
    buy("P", 1, 50, "2024-11-01"),
  ];
  assert.equal(
    returns(future, { P: marketAsset(180, history) }).get("P")?.gain,
    60,
  );
});

test("1D usa o fecho do dia anterior e YTD usa a fronteira do ano", () => {
  const dailyHistory = [
    { date: "2024-10-25", close: 110 },
    { date: "2024-10-28", close: 120 },
    { date: "2024-10-31", close: 999 },
  ];
  assert.deepEqual(
    returns(
      [buy("P", 1, 100, "2024-01-01")],
      { P: marketAsset(140, dailyHistory) },
      "1D",
      "2024-10-28",
    ).get("P"),
    { gain: 30, percent: (30 / 110) * 100 },
  );
  assert.deepEqual(
    returns(
      [buy("P", 1, 100, "2024-10-28")],
      { P: marketAsset(140, dailyHistory) },
      "1D",
      "2024-10-28",
    ).get("P"),
    { gain: 40, percent: 40 },
  );
  assert.deepEqual(
    returns(
      [buy("P", 1, 100, "2023-06-01")],
      { P: marketAsset(180, [{ date: "2023-12-29", close: 90 }]) },
      "YTD",
    ).get("P"),
    { gain: 90, percent: 100 },
  );
});

test("períodos de tickers distintos somam conforme o openRoi da carteira", () => {
  const orders = [
    buy("A", 1, 100, "2024-01-01"),
    buy("B", 2, 50, "2024-05-01"),
  ];
  const market = {
    A: marketAsset(180, [{ date: "2024-04-29", close: 120 }]),
    B: marketAsset(40, [{ date: "2024-04-29", close: 30 }]),
  };
  assert.deepEqual(returns(orders, market).get("A"), { gain: 60, percent: 50 });
  assert.deepEqual(returns(orders, market).get("B"), {
    gain: -20,
    percent: -20,
  });
  const chart = calculatePerformance(orders, market, "EUR", "6M", "2024-10-31");
  assert.ok(Math.abs(chart.openRoi! - (40 / 220) * 100) < 1e-10);
});
