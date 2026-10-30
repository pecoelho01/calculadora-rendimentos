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
test("compras múltiplas, venda parcial e ROI conhecido", () => {
  const p = calculatePortfolio(
    [buy(10, 100), buy(10, 120), sell(5, 130)],
    quote(140),
    "EUR",
  );
  almost(p.positions[0].average, 110);
  almost(p.positions[0].shares, 15);
  almost(p.invested, 2200);
  almost(p.received, 650);
  almost(p.realized, 100);
  almost(p.value, 2100);
  almost(p.unrealized, 450);
  almost(p.gain, 550);
  almost(p.roi, 25);
});
test("venda total não exige cotação e recompra reinicia custo médio", () => {
  const orders = [buy(10, 100), buy(10, 120), sell(5, 130), sell(15, 140)];
  const p = calculatePortfolio(orders, {}, "EUR");
  almost(p.realized, 550);
  almost(p.value, 0);
  almost(p.roi, 25);
  const reopened = calculatePortfolio(
    [...orders, buy(2, 50, "2024-01-03")],
    quote(60),
    "EUR",
  );
  almost(reopened.positions[0].average, 50);
  almost(reopened.unrealized, 20);
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
    almost(p.realized, 20);
  }
  const zero = calculatePortfolio([buy(2, 100)], quote(0), "EUR");
  almost(zero.value, 0);
  almost(zero.roi, -100);
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
  almost(points[1].roi, (60 / 220) * 100);
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
