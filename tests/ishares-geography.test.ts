import test from "node:test";
import assert from "node:assert/strict";
import {
  isharesProductPath,
  compactIsharesCatalog,
  loadIsharesGeography,
  parseIsharesHoldings,
} from "../src/lib/ishares-geography";
import { publicText } from "../src/lib/public-data";
const url =
  "https://www.ishares.com/us/products/123/example/latest-holdings.csv";
const header =
  "Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Location";
const rows = [
  'A,"Company, A",Technology,Equity,500,50,United States',
  "B,Company B,Technology,Equity,250,25,Japan",
  "C,Company C,Technology,Equity,200,20,-",
  "USD,USD cash,Cash,Cash,50,5,United States",
];
const csv = (items = rows) =>
  ['Fund Holdings as of,"30/Oct/2026"', "", header, ...items, ""].join("\n");
test("agregar ficheiro completo por localização e deixar caixa/país ausente sem classificação", () => {
  const data = parseIsharesHoldings(csv(), url)!;
  assert.deepEqual(data.allocations, [
    { country: "US", weight: 0.5 },
    { country: "JP", weight: 0.25 },
  ]);
  assert.equal(data.holdingsCount, 4);
  assert.equal(data.sourceName, "iShares");
  assert.equal(data.method, "holdings");
  assert.equal(data.asOf, "2026-10-30");
  const duplicate = parseIsharesHoldings(
    csv(rows.map((r) => r.replace("Japan", "United States"))),
    url,
  )!;
  assert.deepEqual(duplicate.allocations, [{ country: "US", weight: 0.75 }]);
  const nested = parseIsharesHoldings(
    csv(rows.map((r) => r.replace("Company B", "Another ETF"))),
    url,
  )!;
  assert.deepEqual(nested.allocations, [{ country: "US", weight: 0.5 }]);
});
test("validar denominador comum contra pesos e rejeitar subset, misturas, alavancagem e dados inválidos", () => {
  for (const content of [
    csv(rows.slice(0, 2)),
    csv().replace("500,50", "500,90"),
    csv().replace("500,50", "500,-50"),
    csv().replace("500,50", "NaN,50"),
    csv().replace("Company B", "Index SWAP"),
    csv().replace("30/Oct/2026", "31/Feb/2026"),
    csv().replace("Location", "Currency"),
    csv().replace("Company B", '"unfinished'),
  ])
    assert.equal(parseIsharesHoldings(content, url), null);
  // Rounded published weights need no rescaling: use exact reporting values.
  const fractional = csv().replace("500,50", "500.01,50");
  assert.ok(parseIsharesHoldings(fractional, url)!.allocations[0].weight > 0.5);
  assert.ok(parseIsharesHoldings(csv().replace("250,25", "250,-"), url));
  assert.equal(
    parseIsharesHoldings(csv(rows.map((r) => r.replace("50,5", "-50,0"))), url),
    null,
  );
});
test("associar ISIN europeu e ticker americano a um único produto oficial", () => {
  const catalog = JSON.stringify({
    "123": {
      isin: "IE00B4L5Y983",
      productView: ["etf"],
      productPageUrl: "/uk/individual/en/products/123/example",
    },
  });
  assert.equal(
    isharesProductPath({ isin: "IE00B4L5Y983" }, catalog),
    "/uk/individual/en/products/123/example",
  );
  assert.equal(isharesProductPath({ isin: "IE0000000000" }, catalog), null);
  assert.equal(
    isharesProductPath(
      { isin: "IE00B4L5Y983" },
      catalog.replace(
        "/uk/individual/en/products/123/example",
        "https://other.test/file",
      ),
    ),
    null,
  );
  const html =
    '<a href="/us/products/123/example">IVV</a><a href="/us/products/124/example">IWM</a>';
  assert.equal(
    isharesProductPath({ ticker: "IVV" }, html),
    "/us/products/123/example",
  );
  assert.equal(isharesProductPath({ ticker: "AAPL" }, html), null);
  assert.equal(
    isharesProductPath(
      { ticker: "IVV" },
      html + '<a href="/us/products/456/example">IVV</a>',
    ),
    null,
  );
});
test("descarregar composição apenas no host oficial e tolerar falhas", async () => {
  const calls: string[] = [];
  const fake: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response(
      calls.length === 1 ? '<a href="/us/products/123/example">IVV</a>' : csv(),
    );
  };
  const data = await loadIsharesGeography({ ticker: "IVV" }, fake);
  assert.equal(data?.holdingsCount, 4);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], url);
  assert.equal(
    await loadIsharesGeography(
      { ticker: "IVV" },
      async () => new Response("blocked", { status: 403 }),
    ),
    null,
  );
});
test("limitar bytes durante a leitura do ficheiro", async () => {
  let cancelled = false;
  const fake: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(20));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  await assert.rejects(
    publicText(new URL(url), fake, AbortSignal.timeout(1000), 10),
    /demasiado grande/,
  );
  assert.equal(cancelled, true);
});

test("validar formato americano, data, pesos e fundos subjacentes", () => {
  const american = [
    "iShares Example ETF",
    'Fund Holdings as of,"Oct 30, 2026"',
    "Ticker,Name,Type,Asset Class,Market Value,Location,Market Weight",
    "A,Company A,EQUITY,Equity,500,United States,50",
    "B,Company B,EQUITY,Equity,250,Japan,25",
    "F,Portfolio F,FUND,Equity,200,United States,20",
    "USD,Cash,CASH,Cash,50,United States,5",
  ].join("\n");
  const data = parseIsharesHoldings(american, url)!;
  assert.deepEqual(data.allocations, [
    { country: "US", weight: 0.5 },
    { country: "JP", weight: 0.25 },
  ]);
  assert.equal(data.asOf, "2026-10-30");
  assert.equal(data.holdingsCount, 4);
});

test("compactar catálogos preserva identidade e rejeita entradas vazias", () => {
  const request = { isin: "IE00B4L5Y983" };
  const original = JSON.stringify({
    "123": {
      isin: request.isin,
      productView: ["all", "etf"],
      productPageUrl: "/uk/individual/en/products/123/example",
      irrelevant: "X".repeat(10000),
    },
  });
  const compact = compactIsharesCatalog("uk", original);
  assert.ok(compact.length < 300);
  assert.equal(
    isharesProductPath(request, compact),
    isharesProductPath(request, original),
  );
  const html =
    '<div>irrelevant</div><a href="/us/products/123/example">IVV</a>';
  assert.equal(
    isharesProductPath({ ticker: "IVV" }, compactIsharesCatalog("us", html)),
    "/us/products/123/example",
  );
  assert.throws(() => compactIsharesCatalog("uk", "{}"));
  assert.throws(() => compactIsharesCatalog("uk", "not JSON"));
  assert.throws(() => compactIsharesCatalog("us", "<html>blocked</html>"));
});

test("não confundir colateral com exposição de futuros", () => {
  const derivatives = [
    'Fund Holdings as of,"30/Oct/2026"',
    "Ticker,Name,Asset Class,Market Value,Weight (%),Location,Notional Value",
    "A,Treasury,Fixed Income,900,90,United States,900",
    "USD,Cash,Cash,100,10,United States,100",
    "F,Index future,Futures,0,0,-,500",
  ].join("\n");
  assert.equal(parseIsharesHoldings(derivatives, url), null);
  assert.ok(
    parseIsharesHoldings(derivatives.replace("0,0,-,500", "0,0,-,50"), url),
  );
  assert.equal(
    parseIsharesHoldings(
      derivatives
        .replace(",Notional Value", "")
        .replace(",900\n", "\n")
        .replace(",100\n", "\n")
        .replace(",500", ""),
      url,
    ),
    null,
  );
});
