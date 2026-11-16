import assert from "node:assert/strict";
import test from "node:test";
import { calculatePerformance } from "../../src/lib/portfolio/portfolio";
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
] as const;

function ativo(ticker: string, indice: 1 | 2): MarketAsset {
  const prices = historico.map(([date, aaa, bbb]) => ({
    date,
    close: indice === 1 ? aaa : bbb,
  }));
  return {
    price: indice === 1 ? 24 : 10,
    previousClose: null,
    currency: "EUR",
    name: ticker,
    asOf,
    history: prices,
    intraday:
      indice === 1
        ? [22, 23, 24].map((close, index) => ({
            date: `2024-06-28T15:${String(index * 5).padStart(2, "0")}:00Z`,
            close,
          }))
        : [9, 9, 10].map((close, index) => ({
            date: `2024-06-28T15:${String(index * 5).padStart(2, "0")}:00Z`,
            close,
          })),
  };
}
const mercado: MarketData = { AAA: ativo("AAA", 1), BBB: ativo("BBB", 2) };

type Ponto = { date: string; roi: number; openRoi: number; current?: true };
function p(date: string, roi: number, openRoi = roi, current = false): Ponto {
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
    p("2024-06-28T15:00:00.000Z", ((67 - 68) / 68) * 100),
    p("2024-06-28T15:05:00.000Z", 0),
    p(
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
    p("2024-06-23", 0),
    p("2024-06-24", ((58 - 59) / 59) * 100),
    p("2024-06-26", ((68 - 67) / 67) * 100),
    p("2024-06-28", ((74 - 67) / 67) * 100, ((74 - 67) / 67) * 100, true),
  ]);
});

test("1M: abertura 96, venda FIFO de 90 e compra B2", () => {
  // Em 06-07: ROI=((59+90−96)/96)×100; openRoi=((59−42)/42)×100.
  // No fecho: capital 104, valor 74 e custo aberto 50.
  comparar("1M", "2024-05-28", "2024-05-27", [
    p("2024-05-27", 0),
    p("2024-05-30", ((112 - 96) / 96) * 100),
    p("2024-06-07", ((59 + 90 - 96) / 96) * 100, ((59 - 42) / 42) * 100),
    p("2024-06-24", ((58 + 90 - 96) / 96) * 100, ((58 - 42) / 42) * 100),
    p("2024-06-26", ((68 + 90 - 104) / 104) * 100, ((68 - 50) / 50) * 100),
    p(
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
    p("2023-12-27", 0),
    p("2023-12-29", ((50 - 48) / 48) * 100),
    p("2024-05-30", ((112 - 88) / 88) * 100),
    p("2024-06-07", ((59 + 90 - 88) / 88) * 100, ((59 - 40) / 40) * 100),
    p("2024-06-26", ((68 + 90 - 96) / 96) * 100, ((68 - 48) / 48) * 100),
    p("2024-06-28", ((74 + 90 - 96) / 96) * 100, ((74 - 48) / 48) * 100, true),
  ]);
});

test("YTD: abertura 50 e compras/venda no período", () => {
  // Em 06-07: roi=((59+90−90)/90)×100; openRoi=((59−40)/40)×100.
  // Fecho: roi=((74+90−98)/98)×100; openRoi=((74−48)/48)×100.
  comparar("YTD", "2024-01-01", "2023-12-31", [
    p("2023-12-31", 0),
    p("2024-05-30", ((112 - 90) / 90) * 100),
    p("2024-06-07", ((59 + 90 - 90) / 90) * 100, ((59 - 40) / 40) * 100),
    p("2024-06-26", ((68 + 90 - 98) / 98) * 100, ((68 - 48) / 48) * 100),
    p("2024-06-28", ((74 + 90 - 98) / 98) * 100, ((74 - 48) / 48) * 100, true),
  ]);
});

test("1A: abertura 24 e lotes antigos ao preço de abertura", () => {
  // Em 06-07: roi=((59+90−84)/84)×100; openRoi=((59−40)/40)×100.
  // Fecho: roi=((74+90−92)/92)×100; openRoi=((74−48)/48)×100.
  comparar("1A", "2023-06-28", "2023-06-27", [
    p("2023-06-27", 0),
    p("2023-12-29", ((50 - 44) / 44) * 100),
    p("2024-05-30", ((112 - 84) / 84) * 100),
    p("2024-06-07", ((59 + 90 - 84) / 84) * 100, ((59 - 40) / 40) * 100),
    p("2024-06-26", ((68 + 90 - 92) / 92) * 100, ((68 - 48) / 48) * 100),
    p("2024-06-28", ((74 + 90 - 92) / 92) * 100, ((74 - 48) / 48) * 100, true),
  ]);
});

test("Máximo: ROI total desde as compras e retorno das posições abertas", () => {
  // A 06-07: ganho total 69 sobre 80 investidos; 19 não realizados sobre custo 40.
  // No fecho: ganho 76 sobre 88 investidos; não realizado 26 sobre custo 48.
  comparar("Máximo", "2023-05-02", null, [
    p("2023-06-26", 20, 20),
    p("2023-12-29", 25, 25),
    p("2024-05-30", 40, 40),
    p("2024-06-07", (69 / 80) * 100, (19 / 40) * 100),
    p("2024-06-28", (76 / 88) * 100, (26 / 48) * 100, true),
  ]);
});
