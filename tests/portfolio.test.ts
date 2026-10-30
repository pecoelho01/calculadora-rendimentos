import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculatePortfolio,
  calculateHistory,
  priceAt,
} from "../src/lib/portfolio";
import { parseCsv, exportCsv } from "../src/lib/csv";
import {
  validateOrder,
  validateOrders,
  validDate,
} from "../src/lib/validation";
import { decodeStorage, encodeStorage } from "../src/lib/storage";
import type { MarketData, Order } from "../src/lib/types";
const buy = (shares: number, pricebuy: number, date = "2024-01-01"): Order => ({
  id: crypto.randomUUID(),
  ticker: "TEST",
  name: "Teste",
  shares,
  pricebuy,
  date,
  type: "buy",
});
const sell = (
  shares: number,
  pricebuy: number,
  date = "2024-01-02",
): Order => ({ ...buy(shares, pricebuy, date), type: "sell" });
const quote = (price: number | null, currency = "EUR"): MarketData => ({
  TEST: {
    price,
    previousClose: 130,
    currency,
    name: "Teste",
    asOf: null,
    history: [],
  },
});
const almost = (a: number | null, b: number) =>
  assert.ok(a !== null && Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
test("FIFO com compras múltiplas, venda parcial e ROI conhecido", () => {
  const p = calculatePortfolio(
    [buy(10, 100), buy(10, 120), sell(5, 130)],
    quote(140),
    "EUR",
  );
  almost(p.positions[0].average, 1700 / 15);
  almost(p.positions[0].costBasis, 1700);
  almost(p.openCost, 1700);
  almost(p.openRoi, 400 / 1700 * 100);
  almost(p.positions[0].shares, 15);
  almost(p.invested, 2200);
  almost(p.received, 650);
  almost(p.realized, 150);
  almost(p.value, 2100);
  almost(p.unrealized, 400);
  almost(p.gain, 550);
  almost(p.roi, 25);
});
test("venda total não exige cotação e recompra inicia novos lotes FIFO", () => {
  const orders = [buy(10, 100), buy(10, 120), sell(5, 130), sell(15, 140)];
  const p = calculatePortfolio(orders, {}, "EUR");
  almost(p.realized, 550);
  almost(p.value, 0);
  almost(p.roi, 25);
  almost(p.openCost, 0);
  assert.equal(p.openRoi, null);
  const reopened = calculatePortfolio(
    [...orders, buy(2, 50, "2024-01-03")],
    quote(60),
    "EUR",
  );
  almost(reopened.positions[0].average, 50);
  almost(reopened.unrealized, 20);
  almost(reopened.openRoi, 20);
});
test("ordenação cronológica estável e carteira vazia", () => {
  const p = calculatePortfolio(
    [sell(2, 120, "2024-02-02"), buy(5, 100)],
    quote(110),
    "EUR",
  );
  almost(p.realized, 40);
  const empty = calculatePortfolio([], {}, "EUR");
  almost(empty.value, 0);
  almost(empty.roi, 0);
  assert.equal(empty.openRoi, null);
  assert.throws(
    () =>
      calculatePortfolio([sell(1, 10, "2024-01-01"), buy(1, 10)], {}, "EUR"),
    /superior/,
  );
});
test("impedir vendas acima da posição e deleções que as criariam", () => {
  assert.throws(() => validateOrders([buy(2, 100), sell(3, 120)]), /superior/);
  assert.throws(() => validateOrders([sell(1, 100)]), /superior/);
});
test("preço zero é válido; falha de preço e moeda incompatível não são zero", () => {
  const orders = [buy(2, 100), sell(1, 120)];
  for (const market of [{}, quote(null), quote(140, "USD")]) {
    const p = calculatePortfolio(orders, market, "EUR");
    assert.equal(p.value, null);
    assert.equal(p.roi, null);
    assert.equal(p.openRoi, null);
    almost(p.openCost, 100);
    almost(p.realized, 20);
  }
  const zero = calculatePortfolio([buy(2, 100)], quote(0), "EUR");
  almost(zero.value, 0);
  almost(zero.roi, -100);
  almost(zero.openRoi, -100);
});
test("validar números, datas, ticker e tipo", () => {
  for (const field of ["shares", "pricebuy"])
    for (const bad of [0, -1, "NaN", "Infinity", "1e100", ""])
      assert.throws(() => validateOrder({ ...buy(1, 10), [field]: bad }));
  for (const date of [
    "2024-02-30",
    "2024-13-01",
    "1999-01-01",
    "2099-01-01",
    "abc",
  ])
    assert.equal(validDate(date), false);
  assert.throws(() =>
    validateOrder({ ...buy(1, 10), ticker: "https://evil.test" }),
  );
  assert.throws(() => validateOrder({ ...buy(1, 10), type: "hold" }));
  almost(validateOrder({ ...buy(1, 10), shares: "1,25" }).shares, 1.25);
});
test("CSV antigo, formato limpo, vírgula decimal, campos com aspas e roundtrip", () => {
  const old = parseCsv(readFileSync("sample_combo.csv", "utf8"));
  assert.equal(old.length, 9);
  validateOrders(old);
  const model = readFileSync("modelo_site_ativos.csv", "utf8");
  assert.equal(model, readFileSync("public/modelo_site_ativos.csv", "utf8"));
  const example = parseCsv(model);
  assert.equal(example.length, 2);
  validateOrders(example);
  assert.throws(() => parseCsv("date,ticker,name,pricebuy,shares,type\n"), /não contém/);
  const parsed = parseCsv(
    'date,ticker,name,pricebuy,shares\n2024-01-01,TEST,"Teste, SA","10,50",2\n',
  );
  assert.equal(parsed[0].name, "Teste, SA");
  almost(parsed[0].pricebuy, 10.5);
  assert.equal(parsed[0].type, "buy");
  assert.equal(exportCsv(parseCsv(exportCsv(old))), exportCsv(old));
  assert.throws(
    () => parseCsv("date,ticker,pricebuy,shares\n2024-01-01,T,1,0"),
    /Linha 2/,
  );
  assert.throws(
    () => parseCsv('date,ticker,pricebuy,shares\n2024-01-01,T,"1,2'),
    /Aspas/,
  );
  const appended = parseCsv(
    "date;ticker;pricebuy;shares;type\n2024-02-01;TEST;15,2;1;sell",
  );
  validateOrders([buy(1, 10), ...appended]);
});
test("histórico sem antecipação, fim de semana, fusos UTC e benchmark alinhado", () => {
  const h = [
    { date: "2024-01-05", close: 100 },
    { date: "2024-01-08", close: 120 },
    { date: "2024-01-12", close: 140 },
  ];
  assert.equal(priceAt(h, "2024-01-04"), null);
  assert.equal(priceAt(h, "2024-01-07"), 100);
  const market = quote(140);
  market.TEST.history = h;
  market["^GSPC"] = {
    ...market.TEST,
    history: [
      { date: "2024-01-05", close: 4000 },
      { date: "2024-01-08", close: 4200 },
      { date: "2024-01-12", close: 4400 },
    ],
  };
  const points = calculateHistory(
    [buy(1, 100, "2024-01-05"), buy(1, 120, "2024-01-06")],
    market,
    "EUR",
  );
  assert.deepEqual(
    points.map((p) => p.date),
    ["2024-01-05", "2024-01-12"],
  );
  almost(points[0].roi, 0);
  almost(points[0].openRoi, 0);
  almost(points[1].roi, (60 / 220) * 100);
  almost(points[1].openRoi, (60 / 220) * 100);
  almost(points[1].benchmark, 10);
  market.TEST.history = [];
  assert.equal(calculateHistory([buy(1, 100)], market, "EUR")[0].roi, null);
});
test("armazenamento versionado valida conteúdo antes de usar", () => {
  const p = {
    id: "p1",
    name: "Teste",
    currency: "EUR" as const,
    orders: [buy(2, 10)],
  };
  assert.deepEqual(decodeStorage(encodeStorage([p])), [p]);
  for (const raw of [
    "null",
    "{}",
    '{"version":2,"portfolios":[]}',
    encodeStorage([{ ...p, orders: [sell(2, 10)] }]),
  ])
    assert.throws(() => decodeStorage(raw));
});
test("frações pequenas persistem, não criam ganhos fictícios e não desaparecem", () => {
  const fraction = validateOrder({ ...buy(1, 10), shares: "0,0000001" });
  const p = {
    id: "small",
    name: "Frações",
    currency: "EUR" as const,
    orders: [fraction],
  };
  assert.equal(decodeStorage(encodeStorage([p]))[0].orders[0].shares, 1e-7);
  assert.throws(
    () => validateOrder({ ...sell(1, 1e12), shares: "0.000000001" }),
    /8 casas/,
  );
  assert.throws(() => validateOrders([sell(1e-8, 1e12)]), /superior/);
  almost(
    calculatePortfolio([buy(2e-8, 100), sell(1e-8, 120)], quote(140), "EUR")
      .positions[0].shares,
    1e-8,
  );
  const exact = calculatePortfolio(
    [buy(0.1, 10), buy(0.2, 10), sell(0.3, 10)],
    {},
    "EUR",
  );
  assert.equal(exact.positions[0].shares, 0);
});
test("datas da bolsa preservam sessão local e transições de hora", async () => {
  const { tradingDate } = await import("../src/lib/market-date");
  assert.equal(
    tradingDate(new Date("2024-01-07T23:00:00Z"), "Australia/Sydney"),
    "2024-01-08",
  );
  assert.equal(
    tradingDate(new Date("2024-03-11T13:30:00Z"), "America/New_York"),
    "2024-03-11",
  );
  assert.equal(
    tradingDate(new Date("2024-01-02T00:00:00Z"), "America/New_York"),
    "2024-01-01",
  );
  assert.equal(tradingDate(new Date("invalid"), "UTC"), null);
  assert.equal(tradingDate(new Date(), "invalid-zone"), null);
});

test("FIFO atravessa lotes e separa os dois retornos sem alterar o ganho total", () => {
  const p = calculatePortfolio([buy(2, 100), buy(3, 200), sell(4, 250)], quote(220), "EUR");
  almost(p.positions[0].costBasis, 200);
  almost(p.positions[0].average, 200);
  almost(p.realized, 400);
  almost(p.unrealized, 20);
  almost(p.gain, 420);
  almost(p.roi, 52.5);
  almost(p.openRoi, 10);
  almost(p.gain, p.value! + p.received - p.invested);
});

test("FIFO preserva ordem de registo no mesmo dia e separa lotes por ticker", () => {
  const orders = [buy(1, 100), buy(1, 200), sell(1, 300, "2024-01-01")];
  const a = calculatePortfolio(orders, quote(250), "EUR");
  const b = calculatePortfolio([orders[1], orders[0], orders[2]], quote(250), "EUR");
  almost(a.realized, 200);
  almost(a.positions[0].costBasis, 200);
  almost(b.realized, 100);
  almost(b.positions[0].costBasis, 100);
  almost(a.gain, b.gain!);
  const other = { ...buy(2, 50), ticker: "OTHER" };
  const mixed = calculatePortfolio([...orders, other], { ...quote(250), OTHER: { ...quote(60).TEST } }, "EUR");
  almost(mixed.openCost, 300);
  almost(mixed.unrealized, 70);
  almost(mixed.openRoi, 70 / 300 * 100);
});

test("FIFO mantém custo exato das frações restantes após consumir um lote grande", () => {
  const p = calculatePortfolio([buy(1, 1e12), buy(1e-8, 1), sell(1, 1e12)], quote(2), "EUR");
  almost(p.positions[0].shares, 1e-8);
  assert.equal(p.positions[0].costBasis, 1e-8);
  almost(p.positions[0].average, 1);
  almost(p.openRoi, 100);
  almost(p.realized, 0);
});

test("histórico FIFO distingue venda parcial, fecho e recompra sem antecipar preços", () => {
  const orders = [buy(2, 100), buy(3, 200), sell(4, 250, "2024-01-08"), sell(1, 220, "2024-01-15"), buy(1, 50, "2024-01-22")];
  const market = quote(60);
  market.TEST.history = [{ date: "2024-01-05", close: 160 }, { date: "2024-01-12", close: 220 }, { date: "2024-01-26", close: 60 }];
  market["^GSPC"] = { ...quote(4000).TEST, history: ["2024-01-05", "2024-01-12", "2024-01-19", "2024-01-26"].map(date => ({ date, close: 4000 })) };
  const history = calculateHistory(orders, market, "EUR");
  almost(history[0].roi, 0);
  almost(history[0].openRoi, 0);
  almost(history[1].roi, 52.5);
  almost(history[1].openRoi, 10);
  almost(history[2].roi, 52.5);
  assert.equal(history[2].openRoi, null);
  almost(history[3].roi, 430 / 850 * 100);
  almost(history[3].openRoi, 20);
  market.TEST.history = [{ date: "2024-01-26", close: 60 }];
  const missing = calculateHistory(orders, market, "EUR");
  assert.equal(missing[0].openRoi, null);
  assert.equal(missing[1].openRoi, null);
  almost(missing[2].roi, 52.5);
});
