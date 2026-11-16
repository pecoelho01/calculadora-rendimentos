import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePerformance,
  calculatePortfolio,
} from "../../src/lib/portfolio/portfolio";
import type { MarketAsset, MarketData, Order } from "../../src/lib/types";

const fim = "2024-06-28";
const asOf = "2024-06-28T15:10:00Z";
const carteira: Order[] = [
  {
    id: "A1",
    ticker: "AAA",
    name: "AAA",
    type: "buy",
    shares: 2,
    pricebuy: 10,
    date: "2023-05-02",
  },
  {
    id: "B1",
    ticker: "BBB",
    name: "BBB",
    type: "buy",
    shares: 4,
    pricebuy: 5,
    date: "2023-11-01",
  },
  {
    id: "A2",
    ticker: "AAA",
    name: "AAA",
    type: "buy",
    shares: 2,
    pricebuy: 20,
    date: "2024-02-05",
  },
  {
    id: "A3",
    ticker: "AAA",
    name: "AAA",
    type: "sell",
    shares: 3,
    pricebuy: 30,
    date: "2024-06-03",
  },
  {
    id: "B2",
    ticker: "BBB",
    name: "BBB",
    type: "buy",
    shares: 1,
    pricebuy: 8,
    date: "2024-06-25",
  },
];
const historico = [
  ["2023-06-26", 12, 4],
  ["2023-12-27", 14, 5],
  ["2023-12-29", 15, 5],
  ["2024-05-27", 18, 6],
  ["2024-05-30", 21, 7],
  ["2024-06-07", 27, 8],
  ["2024-06-24", 22, 9],
  ["2024-06-26", 23, 9],
  ["2024-06-28", 24, 10],
  ["2024-07-01", 999, 999],
] as const;
const fechosAAA = historico.map(([date, close]) => ({ date, close }));
const fechosBBB = historico.map(([date, _aaa, close]) => ({ date, close }));

function ativo(
  ticker: string,
  price: number,
  history: MarketAsset["history"],
  closes: number[],
): MarketAsset {
  return {
    price,
    previousClose: null,
    currency: "EUR",
    name: ticker,
    asOf,
    history,
    intraday: closes.map((close, index) => ({
      date: `2024-06-28T15:${String(index * 5).padStart(2, "0")}:00Z`,
      close,
    })),
  };
}
const mercado: MarketData = {
  AAA: ativo("AAA", 24, fechosAAA, [22, 23, 24]),
  BBB: ativo("BBB", 10, fechosBBB, [9, 9, 10]),
  ZZZ: ativo(
    "ZZZ",
    999,
    [
      { date: "2024-06-10", close: 1 },
      { date: "2024-06-12", close: 2 },
    ],
    [],
  ),
};

type Ponto = { date: string; roi: number; openRoi: number; current?: true };
function performancePoint(
  date: string,
  roi: number,
  openRoi = roi,
  current = false,
): Ponto {
  return { date, roi, openRoi, ...(current ? { current: true } : {}) };
}
function calcular(period: Parameters<typeof calculatePerformance>[3]) {
  return calculatePerformance(carteira, mercado, "EUR", period, fim, asOf);
}
function comparar(
  period: Parameters<typeof calculatePerformance>[3],
  start: string,
  boundary: string | null,
  data: Ponto[],
) {
  const resultado = calcular(period);
  assert.deepEqual(resultado, {
    data,
    roi: data.at(-1)?.roi ?? null,
    openRoi: data.at(-1)?.openRoi ?? null,
    start,
    end: fim,
    boundary,
  });
}

test("1D: abertura 68; valores intradiários 67, 68 e 74", () => {
  // A1 foi consumido; A2 restante vale 23 na abertura. BBB vale 4×9+9=45.
  // ROI e openRoi: ((67−68)/68)×100, 0, ((74−68)/68)×100.
  comparar("1D", "2024-06-28", "2024-06-27", [
    performancePoint("2024-06-28T15:00:00.000Z", ((67 - 68) / 68) * 100),
    performancePoint("2024-06-28T15:05:00.000Z", 0),
    performancePoint(
      "2024-06-28T15:10:00.000Z",
      ((74 - 68) / 68) * 100,
      ((74 - 68) / 68) * 100,
      true,
    ),
  ]);
});

test("5D: abertura 59, compra B2 e fecho 74", () => {
  // Em 06-26, valor 68 e capital 59+8=67; custo aberto 27+32+8=67.
  comparar("5D", "2024-06-24", "2024-06-23", [
    performancePoint("2024-06-23", 0),
    performancePoint("2024-06-24", ((58 - 59) / 59) * 100),
    performancePoint("2024-06-26", ((68 - 67) / 67) * 100),
    performancePoint(
      "2024-06-28",
      ((74 - 67) / 67) * 100,
      ((74 - 67) / 67) * 100,
      true,
    ),
  ]);
});

test("1M: abertura 96, venda FIFO de 90 e compra B2", () => {
  // Em 06-07: ROI=((59+90−96)/96)×100; openRoi=((59−42)/42)×100.
  // No fecho: capital 104, valor 74 e custo aberto 50.
  comparar("1M", "2024-05-28", "2024-05-27", [
    performancePoint("2024-05-27", 0),
    performancePoint("2024-05-30", ((112 - 96) / 96) * 100),
    performancePoint(
      "2024-06-07",
      ((59 + 90 - 96) / 96) * 100,
      ((59 - 42) / 42) * 100,
    ),
    performancePoint(
      "2024-06-24",
      ((58 + 90 - 96) / 96) * 100,
      ((58 - 42) / 42) * 100,
    ),
    performancePoint(
      "2024-06-26",
      ((68 + 90 - 104) / 104) * 100,
      ((68 - 50) / 50) * 100,
    ),
    performancePoint(
      "2024-06-28",
      ((74 + 90 - 104) / 104) * 100,
      ((74 - 50) / 50) * 100,
      true,
    ),
  ]);
});

test("6M: abertura 48, compras 40 e venda FIFO", () => {
  // 06-07: roi=((59+90−88)/88)×100 e openRoi=((59−40)/40)×100.
  // 06-26: ROI=((68+90−96)/96)×100; openRoi=((68−48)/48)×100.
  comparar("6M", "2023-12-28", "2023-12-27", [
    performancePoint("2023-12-27", 0),
    performancePoint("2023-12-29", ((50 - 48) / 48) * 100),
    performancePoint("2024-05-30", ((112 - 88) / 88) * 100),
    performancePoint(
      "2024-06-07",
      ((59 + 90 - 88) / 88) * 100,
      ((59 - 40) / 40) * 100,
    ),
    performancePoint(
      "2024-06-26",
      ((68 + 90 - 96) / 96) * 100,
      ((68 - 48) / 48) * 100,
    ),
    performancePoint(
      "2024-06-28",
      ((74 + 90 - 96) / 96) * 100,
      ((74 - 48) / 48) * 100,
      true,
    ),
  ]);
});

test("YTD: abertura 50 e compras/venda no período", () => {
  // Em 06-07: roi=((59+90−90)/90)×100; openRoi=((59−40)/40)×100.
  // Fecho: roi=((74+90−98)/98)×100; openRoi=((74−48)/48)×100.
  comparar("YTD", "2024-01-01", "2023-12-31", [
    performancePoint("2023-12-31", 0),
    performancePoint("2024-05-30", ((112 - 90) / 90) * 100),
    performancePoint(
      "2024-06-07",
      ((59 + 90 - 90) / 90) * 100,
      ((59 - 40) / 40) * 100,
    ),
    performancePoint(
      "2024-06-26",
      ((68 + 90 - 98) / 98) * 100,
      ((68 - 48) / 48) * 100,
    ),
    performancePoint(
      "2024-06-28",
      ((74 + 90 - 98) / 98) * 100,
      ((74 - 48) / 48) * 100,
      true,
    ),
  ]);
});

test("1A: abertura 24 e lotes antigos ao preço de abertura", () => {
  // Em 06-07: roi=((59+90−84)/84)×100; openRoi=((59−40)/40)×100.
  // Fecho: roi=((74+90−92)/92)×100; openRoi=((74−48)/48)×100.
  comparar("1A", "2023-06-28", "2023-06-27", [
    performancePoint("2023-06-27", 0),
    performancePoint("2023-12-29", ((50 - 44) / 44) * 100),
    performancePoint("2024-05-30", ((112 - 84) / 84) * 100),
    performancePoint(
      "2024-06-07",
      ((59 + 90 - 84) / 84) * 100,
      ((59 - 40) / 40) * 100,
    ),
    performancePoint(
      "2024-06-26",
      ((68 + 90 - 92) / 92) * 100,
      ((68 - 48) / 48) * 100,
    ),
    performancePoint(
      "2024-06-28",
      ((74 + 90 - 92) / 92) * 100,
      ((74 - 48) / 48) * 100,
      true,
    ),
  ]);
});

test("Máximo: ROI total desde as compras e retorno das posições abertas", () => {
  // A 06-07: ganho total 69 sobre 80 investidos; 19 não realizados sobre custo 40.
  // No fecho: ganho 76 sobre 88 investidos; não realizado 26 sobre custo 48.
  comparar("Máximo", "2023-05-02", null, [
    performancePoint("2023-06-26", 20, 20),
    performancePoint("2023-12-29", 25, 25),
    performancePoint("2024-05-30", 40, 40),
    performancePoint("2024-06-07", (69 / 80) * 100, (19 / 40) * 100),
    performancePoint("2024-06-28", (76 / 88) * 100, (26 / 48) * 100, true),
  ]);
});

test("carteira mista caracteriza posições, lotes e resumo", () => {
  // AAA: custo aberto 20, realizado 50, não realizado 4; ganho total 54.
  // BBB: custo 28 e valor 50. Total: valor 74, ganho 76 e compras 88.
  assert.deepEqual(calculatePortfolio(carteira, mercado, "EUR"), {
    positions: [
      {
        ticker: "AAA",
        name: "AAA",
        shares: 1,
        average: 20,
        costBasis: 20,
        invested: 60,
        received: 90,
        realized: 50,
        realizedCost: 40,
        price: 24,
        value: 24,
        unrealized: 4,
        unrealizedPercent: 20,
        realizedPercent: 125,
        dayGain: null,
        issue: null,
      },
      {
        ticker: "BBB",
        name: "BBB",
        shares: 5,
        average: 28 / 5,
        costBasis: 28,
        invested: 28,
        received: 0,
        realized: 0,
        realizedCost: 0,
        price: 10,
        value: 50,
        unrealized: 22,
        unrealizedPercent: (22 / 28) * 100,
        realizedPercent: null,
        dayGain: null,
        issue: null,
      },
    ],
    orderGains: new Map([
      ["A3", { gain: 50, percent: 125, shares: 3 }],
      ["A1", { gain: 40, percent: 200, shares: 0 }],
      ["A2", { gain: 14, percent: 35, shares: 1 }],
      ["B1", { gain: 20, percent: 100, shares: 4 }],
      ["B2", { gain: 2, percent: 25, shares: 1 }],
    ]),
    invested: 88,
    realized: 50,
    received: 90,
    value: 74,
    unrealized: 26,
    openCost: 48,
    openRoi: (26 / 48) * 100,
    gain: 76,
    roi: (76 / 88) * 100,
  });
});

test("compras no mesmo dia mantêm ordem de registo no FIFO", () => {
  const ordens: Order[] = [
    {
      id: "primeira",
      ticker: "DDD",
      name: "DDD",
      type: "buy",
      shares: 1,
      pricebuy: 10,
      date: "2024-01-02",
    },
    {
      id: "segunda",
      ticker: "DDD",
      name: "DDD",
      type: "buy",
      shares: 1,
      pricebuy: 20,
      date: "2024-01-02",
    },
    {
      id: "venda",
      ticker: "DDD",
      name: "DDD",
      type: "sell",
      shares: 1,
      pricebuy: 30,
      date: "2024-01-03",
    },
  ];
  const mercadoDDD: MarketData = {
    DDD: {
      price: 30,
      previousClose: null,
      currency: "EUR",
      name: "DDD",
      asOf,
      history: [],
    },
  };

  // A primeira compra registada (custo 10) é consumida: ganho da venda 20.
  assert.deepEqual(calculatePortfolio(ordens, mercadoDDD, "EUR"), {
    positions: [
      {
        ticker: "DDD",
        name: "DDD",
        shares: 1,
        average: 20,
        costBasis: 20,
        invested: 30,
        received: 30,
        realized: 20,
        realizedCost: 10,
        price: 30,
        value: 30,
        unrealized: 10,
        unrealizedPercent: 50,
        realizedPercent: 200,
        dayGain: null,
        issue: null,
      },
    ],
    orderGains: new Map([
      ["venda", { gain: 20, percent: 200, shares: 1 }],
      ["primeira", { gain: 20, percent: 200, shares: 0 }],
      ["segunda", { gain: 10, percent: 50, shares: 1 }],
    ]),
    invested: 30,
    realized: 20,
    received: 30,
    value: 30,
    unrealized: 10,
    openCost: 20,
    openRoi: 50,
    gain: 30,
    roi: 100,
  });
});
