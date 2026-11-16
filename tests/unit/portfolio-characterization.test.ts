import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePerformance,
  calculatePortfolio,
  geographicAllocation,
} from "../../src/lib/portfolio/portfolio";
import type { MarketAsset, MarketData, Order } from "../../src/lib/types";

function order(
  id: string,
  ticker: string,
  details: Pick<Order, "type" | "shares" | "pricebuy" | "date">,
): Order {
  return { id, ticker, name: ticker, ...details };
}

function asset(
  price: number | null,
  currency = "EUR",
  history: MarketAsset["history"] = [],
): MarketAsset {
  return {
    price,
    // Este valor determina dayGain: (12 - 8) × 3 = 12 e (0 - 8) × 3 = -24.
    previousClose: 8,
    currency,
    name: "Ativo",
    asOf: "2024-06-30T16:00:00Z",
    history,
  };
}

test("carteira vazia tem resumo exato", () => {
  assert.deepEqual(calculatePortfolio([], {}, "EUR"), {
    positions: [],
    orderGains: new Map(),
    invested: 0,
    realized: 0,
    received: 0,
    value: 0,
    unrealized: 0,
    openCost: 0,
    openRoi: null,
    gain: 0,
    roi: 0,
  });
});

test("carteira mista fixa FIFO, cotação incompatível e indisponível", () => {
  const orders = [
    order("a1", "AAA", {
      type: "buy",
      shares: 2,
      pricebuy: 4,
      date: "2024-01-01",
    }),
    order("a2", "AAA", {
      type: "buy",
      shares: 2,
      pricebuy: 8,
      date: "2024-01-02",
    }),
    order("a3", "AAA", {
      type: "sell",
      shares: 1,
      pricebuy: 10,
      date: "2024-01-03",
    }),
    order("b1", "BBB", {
      type: "buy",
      shares: 1,
      pricebuy: 3,
      date: "2024-01-01",
    }),
  ];
  const result = calculatePortfolio(
    orders,
    { AAA: asset(12), BBB: asset(12, "USD") },
    "EUR",
  );

  // AAA: custo aberto 4 + 16 = 20; valor 36; não realizado 16.
  // BBB não tem preço EUR; o total da carteira fica indisponível.
  assert.deepEqual(result, {
    positions: [
      {
        ticker: "AAA",
        name: "AAA",
        shares: 3,
        average: 20 / 3,
        costBasis: 20,
        invested: 24,
        received: 10,
        realized: 6,
        realizedCost: 4,
        price: 12,
        value: 36,
        unrealized: 16,
        unrealizedPercent: 80,
        realizedPercent: 150,
        dayGain: 12,
        issue: null,
      },
      {
        ticker: "BBB",
        name: "BBB",
        shares: 1,
        average: 3,
        costBasis: 3,
        invested: 3,
        received: 0,
        realized: 0,
        realizedCost: 0,
        price: null,
        value: null,
        unrealized: null,
        unrealizedPercent: null,
        realizedPercent: null,
        dayGain: null,
        issue: "Cotação em USD; carteira em EUR",
      },
    ],
    orderGains: new Map([
      ["a3", { gain: 6, percent: 150, shares: 1 }],
      ["a1", { gain: 14, percent: 175, shares: 1 }],
      ["a2", { gain: 8, percent: 50, shares: 2 }],
      ["b1", { gain: null, percent: null, shares: 1 }],
    ]),
    invested: 27,
    realized: 6,
    received: 10,
    value: null,
    unrealized: null,
    openCost: 23,
    openRoi: null,
    gain: null,
    roi: null,
  });
});

test("posição fechada sem mercado mantém ganhos dos lotes e preço nulo", () => {
  const first = order("c1", "CCC", {
    type: "buy",
    shares: 2,
    pricebuy: 4,
    date: "2024-01-01",
  });
  const sale = order("c2", "CCC", {
    type: "sell",
    shares: 2,
    pricebuy: 7,
    date: "2024-01-02",
  });
  const result = calculatePortfolio([first, sale], {}, "EUR");
  // 2 × (7 - 4) = 6 realizado; as 2 ações fechadas valem zero. ROI = 6 / 8.
  assert.deepEqual(result, {
    positions: [
      {
        ticker: "CCC",
        name: "CCC",
        shares: 0,
        average: 0,
        costBasis: 0,
        invested: 8,
        received: 14,
        realized: 6,
        realizedCost: 8,
        price: null,
        value: 0,
        unrealized: 0,
        unrealizedPercent: null,
        realizedPercent: 75,
        dayGain: 0,
        issue: null,
      },
    ],
    orderGains: new Map([
      ["c2", { gain: 6, percent: 75, shares: 2 }],
      ["c1", { gain: 6, percent: 75, shares: 0 }],
    ]),
    invested: 8,
    realized: 6,
    received: 14,
    value: 0,
    unrealized: 0,
    openCost: 0,
    openRoi: null,
    gain: 6,
    roi: 75,
  });
});

test("cotação ausente difere de cotação válida a zero", () => {
  const orders = [
    order("c1", "CCC", {
      type: "buy",
      shares: 2,
      pricebuy: 4,
      date: "2024-01-01",
    }),
    order("d1", "DDD", {
      type: "buy",
      shares: 3,
      pricebuy: 2,
      date: "2024-01-01",
    }),
  ];
  const result = calculatePortfolio(
    orders,
    { CCC: asset(null), DDD: asset(0) },
    "EUR",
  );
  // CCC não tem valor mensurável. DDD vale 0 e perde os 6 EUR investidos:
  // (0 - 6) / 6 = -100%. O total permanece nulo por CCC.
  assert.deepEqual(result, {
    positions: [
      {
        ticker: "CCC",
        name: "CCC",
        shares: 2,
        average: 4,
        costBasis: 8,
        invested: 8,
        received: 0,
        realized: 0,
        realizedCost: 0,
        price: null,
        value: null,
        unrealized: null,
        unrealizedPercent: null,
        realizedPercent: null,
        dayGain: null,
        issue: "Cotação indisponível",
      },
      {
        ticker: "DDD",
        name: "DDD",
        shares: 3,
        average: 2,
        costBasis: 6,
        invested: 6,
        received: 0,
        realized: 0,
        realizedCost: 0,
        price: 0,
        value: 0,
        unrealized: -6,
        unrealizedPercent: -100,
        realizedPercent: null,
        dayGain: -24,
        issue: null,
      },
    ],
    orderGains: new Map([
      ["c1", { gain: null, percent: null, shares: 2 }],
      ["d1", { gain: -6, percent: -100, shares: 3 }],
    ]),
    invested: 14,
    realized: 0,
    received: 0,
    value: null,
    unrealized: null,
    openCost: 14,
    openRoi: null,
    gain: null,
    roi: null,
  });
});

test("abertura ausente para lote antigo deixa ROI e openRoi nulos", () => {
  const orders = [
    order("d1", "DDD", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-01-01",
    }),
    order("e1", "EEE", {
      type: "buy",
      shares: 1,
      pricebuy: 2,
      date: "2024-06-01",
    }),
  ];
  const market: MarketData = {
    DDD: { ...asset(4), history: [] },
    EEE: { ...asset(4), history: [{ date: "2024-06-30", close: 4 }] },
  };
  const result = calculatePerformance(
    orders,
    market,
    "EUR",
    "1M",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  // O valor atual é 8 EUR. Sem preço histórico de DDD, opening.value e openCost
  // ficam nulos pela mesma causa. Uma moeda histórica incompatível com value
  // disponível é inalcançável: marketAt copia a moeda do ativo.
  assert.equal(calculatePortfolio(orders, market, "EUR").value, 8);
  assert.deepEqual(result, {
    data: [
      { date: "2024-05-29", roi: null, openRoi: null },
      { date: "2024-06-30", roi: null, openRoi: null, current: true },
    ],
    roi: null,
    openRoi: null,
    start: "2024-05-30",
    end: "2024-06-30",
    boundary: "2024-05-29",
  });
});

test("posições abertas sem observações intradiárias têm série vazia", () => {
  const orders = [
    order("f1", "FFF", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-06-30",
    }),
  ];
  const result = calculatePerformance(
    orders,
    { FFF: { ...asset(4), intraday: [] } },
    "EUR",
    "1D",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  assert.deepEqual(result, {
    data: [],
    roi: null,
    openRoi: null,
    start: "2024-06-30",
    end: "2024-06-30",
    boundary: "2024-06-29",
  });
});

test("ignora observações intradiárias posteriores ao asOf e noutro dia", () => {
  const orders = [
    order("f1", "FFF", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-06-30",
    }),
  ];
  const result = calculatePerformance(
    orders,
    {
      FFF: {
        ...asset(8),
        intraday: [
          { date: "2024-06-30T16:01:00Z", close: 10 },
          { date: "2024-07-01T15:00:00Z", close: 12 },
        ],
      },
    },
    "EUR",
    "1D",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  // Ambas as observações são filtradas; não existe ponto observado.
  assert.deepEqual(result, {
    data: [],
    roi: null,
    openRoi: null,
    start: "2024-06-30",
    end: "2024-06-30",
    boundary: "2024-06-29",
  });
});

test("asOf inválido ignora as observações intradiárias", () => {
  const orders = [
    order("f1", "FFF", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-06-30",
    }),
  ];
  const result = calculatePerformance(
    orders,
    {
      FFF: {
        ...asset(8),
        intraday: [{ date: "2024-06-30T15:00:00Z", close: 10 }],
      },
    },
    "EUR",
    "1D",
    "2024-06-30",
    "data-inválida",
  );
  // Date.parse inválido invalida o cutoff e o código descarta todos os pontos.
  assert.deepEqual(result, {
    data: [],
    roi: null,
    openRoi: null,
    start: "2024-06-30",
    end: "2024-06-30",
    boundary: "2024-06-29",
  });
});

test("filtra datas sem hora e timestamps cujo dia UTC difere do end", () => {
  const orders = [
    order("f1", "FFF", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-06-30",
    }),
  ];
  const result = calculatePerformance(
    orders,
    {
      FFF: {
        ...asset(8),
        intraday: [
          { date: "2024-06-30T00:30:00+02:00", close: 10 },
          { date: "2024-06-30", close: 12 },
        ],
      },
    },
    "EUR",
    "1D",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  // O primeiro timestamp é 2024-06-29T22:30Z; o segundo não contém T.
  assert.deepEqual(result, {
    data: [],
    roi: null,
    openRoi: null,
    start: "2024-06-30",
    end: "2024-06-30",
    boundary: "2024-06-29",
  });
});

test("lacuna intradiária gera grelha e expira a cotação aos 15 minutos", () => {
  const orders = [
    order("f1", "FFF", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-06-30",
    }),
  ];
  const result = calculatePerformance(
    orders,
    {
      FFF: {
        ...asset(8),
        intraday: [
          { date: "2024-06-30T15:00:00Z", close: 10 },
          { date: "2024-06-30T15:05:00Z", close: null },
          { date: "2024-06-30T15:20:00Z", close: 12 },
        ],
      },
    },
    "EUR",
    "1D",
    "2024-06-30",
    "2024-06-30T15:20:00Z",
  );
  // A cotação das 15:00 é carregada até 15:15; 15:15:00.001 já expirou.
  // 15:05 preserva o último valor válido (ROI 150%) e é estimated; 15:10 e
  // 15:15:00.001 não têm preço e retornam ROI/openRoi nulos. A nova cotação
  // das 15:20 volta a produzir ROI 200%.
  assert.deepEqual(result, {
    data: [
      { date: "2024-06-30T15:00:00.000Z", roi: 150, openRoi: 150 },
      {
        date: "2024-06-30T15:05:00.000Z",
        roi: 150,
        openRoi: 150,
        estimated: true,
      },
      {
        date: "2024-06-30T15:10:00.000Z",
        roi: 150,
        openRoi: 150,
        estimated: true,
      },
      {
        date: "2024-06-30T15:15:00.000Z",
        roi: 150,
        openRoi: 150,
        estimated: true,
      },
      { date: "2024-06-30T15:15:00.001Z", roi: null, openRoi: null },
      {
        date: "2024-06-30T15:20:00.000Z",
        roi: 200,
        openRoi: 200,
        current: true,
      },
    ],
    roi: 200,
    openRoi: 200,
    start: "2024-06-30",
    end: "2024-06-30",
    boundary: "2024-06-29",
  });
});

test("cálculo diário repetido mantém a série determinística entre chamadas", () => {
  const orders = [
    order("i1", "III", {
      type: "buy",
      shares: 1,
      pricebuy: 4,
      date: "2024-06-30",
    }),
  ];
  const market = {
    III: {
      ...asset(12),
      intraday: [
        { date: "2024-06-30T15:00:00Z", close: 10 },
        { date: "2024-06-30T15:05:00Z", close: 12 },
      ],
    },
  };
  const first = calculatePerformance(
    orders,
    market,
    "EUR",
    "1D",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  calculatePerformance(
    orders,
    market,
    "EUR",
    "5D",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  const repeated = calculatePerformance(
    orders,
    market,
    "EUR",
    "1D",
    "2024-06-30",
    "2024-06-30T16:00:00Z",
  );
  // Com capital inicial zero, o capital do período são os 4 euros comprados:
  // os valores 10 e 12 correspondem a retornos de 150% e 200%.
  assert.deepEqual(first, {
    data: [
      { date: "2024-06-30T15:00:00.000Z", roi: 150, openRoi: 150 },
      {
        date: "2024-06-30T15:05:00.000Z",
        roi: 200,
        openRoi: 200,
        current: true,
      },
    ],
    roi: 200,
    openRoi: 200,
    start: "2024-06-30",
    end: "2024-06-30",
    boundary: "2024-06-29",
  });
  assert.deepEqual(repeated, first);
});

test("geografia absorve resíduos de ponto flutuante e ignora valor zero", () => {
  const orders = [
    order("g1", "GGG", {
      type: "buy",
      shares: 10,
      pricebuy: 10,
      date: "2024-01-01",
    }),
    order("h1", "HHH", {
      type: "buy",
      shares: 1,
      pricebuy: 1,
      date: "2024-01-01",
    }),
  ];
  const market: MarketData = {
    GGG: {
      ...asset(10),
      geography: {
        allocations: [
          { country: "US", weight: 0.1 },
          { country: "DE", weight: 0.2 },
          { country: "BR", weight: 0.7 },
        ],
        asOf: "2024-06-30",
        source: "test",
        sourceName: "Fonte",
        method: "published",
        holdingsCount: 3,
      },
    },
    HHH: {
      ...asset(0),
      geography: {
        allocations: [{ country: "PT", weight: 1 }],
        asOf: "2024-06-30",
        source: "ignored",
      },
    },
  };
  market.GGG.geography!.allocations = [
    { country: "BR", weight: 0.7 },
    { country: "DE", weight: 0.2 },
    { country: "US", weight: 0.1 },
  ];
  // A soma é 0.9999999999999999; a tolerância evita residual UNKNOWN.
  const positions = calculatePortfolio(orders, market, "EUR").positions;
  const result = geographicAllocation(positions, market);
  assert.deepEqual(result, {
    total: 100,
    allocations: [
      { continent: "SA", value: 70, percent: 70 },
      { continent: "EU", value: 20, percent: 20 },
      { continent: "NA", value: 10, percent: 10 },
    ],
    sources: [
      {
        ticker: "GGG",
        asOf: "2024-06-30",
        source: "test",
        sourceName: "Fonte",
        method: "published",
        holdingsCount: 3,
      },
    ],
    coverage: 100,
  });
});
