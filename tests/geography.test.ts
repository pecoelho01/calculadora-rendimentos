import test from "node:test";
import assert from "node:assert/strict";
import { loadGeography, parseGeography } from "../src/lib/geography-source";
import { calculatePortfolio, geographicAllocation } from "../src/lib/portfolio";
import type { Geography, MarketData, Order } from "../src/lib/types";

const isin = "IE00B4L5Y983";
const source = `https://www.justetf.com/en/etf-profile.html?isin=${isin}`;
// Minimal provider contract, matching the public HTML checked during implementation.
const row = (country: string, weight: string) =>
  `<tr><td data-testid="tl_etf-holdings_countries_value_name">${country}</td><td><span data-testid="tl_etf-holdings_countries_value_percentage">${weight}%</span></td></tr>`;
const profile = `<a href="?isin=${isin}"></a><td data-testid="etf-trade-data-panel_row-xetr_ticker">EUNL</td><table data-testid="etf-holdings_countries_table"><tbody>${row("United States", "70")}${row("Japan", "20")}${row("Other", "10")}</tbody></table><div data-testid="tl_etf-holdings_reference-date">As of 30/09/2026</div>`;
const composition: Geography = {
  allocations: [
    { country: "US", weight: 0.6 },
    { country: "JP", weight: 0.3 },
  ],
  asOf: "2026-09-30",
  source,
};
const order = (
  ticker: string,
  type: "buy" | "sell" = "buy",
  shares = 1,
): Order => ({
  id: crypto.randomUUID(),
  ticker,
  name: ticker,
  date: "2024-01-01",
  pricebuy: 100,
  shares,
  type,
});
const quote = (price: number, geography?: Geography, currency = "EUR") => ({
  price,
  currency,
  geography,
  previousClose: null,
  name: "ETF",
  asOf: null,
  history: [],
});
function allocation(orders: Order[], market: MarketData) {
  return geographicAllocation(
    calculatePortfolio(orders, market, "EUR").positions,
    market,
  );
}

test("validar identidade, listagem, países, data e pesos da fonte", () => {
  const data = parseGeography(profile, "EUNL.DE", isin)!;
  assert.deepEqual(data.allocations, [
    { country: "US", weight: 0.7 },
    { country: "JP", weight: 0.2 },
    { country: "OTHER", weight: 0.1 },
  ]);
  assert.equal(data.asOf, "2026-09-30");
  assert.equal(data.source, source);
  for (const html of [
    profile.replace("EUNL<", "OTHER<"),
    profile.replace("70%", "170%"),
    profile.replace("30/09/2026", "31/02/2026"),
    profile.replace("Japan", "Unknown place"),
    profile.replace("20%", "NaN%"),
  ]) {
    assert.equal(parseGeography(html, "EUNL.DE", isin), null);
  }
  assert.equal(parseGeography(profile, "EUNL.AS", isin), null);
  assert.equal(parseGeography(profile, "EUNL.DE", "IE0000000000"), null);
});

test("resolver automaticamente o ticker com sessão pública e confirmar o ETF", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (calls.length === 1)
      return new Response(
        JSON.stringify({
          fetchCallbackUrl: "/en/search.html?callback=1",
          etfsParams: "query=EUNL&ls=any",
        }),
        { headers: { "Set-Cookie": "session=public; Path=/; HttpOnly" } },
      );
    if (calls.length === 2)
      return Response.json({ recordsFiltered: 1, data: [{ isin }] });
    return new Response(profile);
  };
  assert.equal(
    (await loadGeography("EUNL.DE", fake))?.allocations[0].weight,
    0.7,
  );
  assert.equal(calls.length, 3);
  assert.equal(
    new Headers(calls[1].init?.headers).get("Cookie"),
    "session=public",
  );
  assert.equal(
    new URLSearchParams(String(calls[1].init?.body)).get("etfsParams"),
    "query=EUNL&ls=any",
  );
  assert.equal(await loadGeography("AAPL", fake), null);
  assert.equal(calls.length, 3);
});

test("falhas externas e pesquisas ambíguas ficam indisponíveis", async () => {
  assert.equal(
    await loadGeography("EUNL.DE", async () => {
      throw new Error("offline");
    }),
    null,
  );
  assert.equal(
    await loadGeography(
      "EUNL.DE",
      async () => new Response("blocked", { status: 403 }),
    ),
    null,
  );
  let count = 0;
  const ambiguous: typeof fetch = async () =>
    ++count === 1
      ? new Response(
          '{"fetchCallbackUrl":"/en/search.html?callback=1","etfsParams":"query=EUNL"}',
        )
      : Response.json({
          recordsFiltered: 2,
          data: [{ isin }, { isin: "IE00BK5BQT80" }],
        });
  assert.equal(await loadGeography("EUNL.DE", ambiguous), null);
  assert.equal(count, 2);
});

test("ponderar posições por valor atual e conservar cobertura parcial", () => {
  const data = allocation([order("A"), order("B")], {
    A: quote(100, composition),
    B: quote(300, {
      ...composition,
      allocations: [
        { country: "US", weight: 0.2 },
        { country: "OTHER", weight: 0.8 },
      ],
    }),
  })!;
  const values = Object.fromEntries(
    data.allocations.map((a) => [a.continent, a.value]),
  );
  assert.equal(data.total, 400);
  assert.equal(values.NA, 120);
  assert.equal(values.AS, 30);
  assert.ok(Math.abs(values.UNKNOWN - 250) < 1e-10);
  assert.equal(data.coverage, 37.5);
  assert.ok(
    Math.abs(data.allocations.reduce((n, a) => n + a.percent, 0) - 100) < 1e-10,
  );
});

test("excluir vendas totais, refletir vendas parciais e distinguir zero, ausência e moeda", () => {
  const market = { A: quote(100, composition), B: quote(100) };
  const data = allocation(
    [order("A", "buy", 2), order("A", "sell"), order("B")],
    market,
  )!;
  assert.equal(data.total, 200);
  assert.ok(Math.abs(data.coverage - 45) < 1e-10);
  assert.equal(allocation([order("A"), order("A", "sell")], {})?.total, 0);
  assert.equal(allocation([], {})?.total, 0);
  assert.equal(
    allocation([order("A")], { A: quote(0, composition) })?.total,
    0,
  );
  assert.equal(allocation([order("A")], {}), null);
  assert.equal(
    allocation([order("A")], { A: quote(100, composition, "USD") }),
    null,
  );
  assert.equal(allocation([order("B")], market)?.coverage, 0);
  assert.equal(
    allocation([order("A")], {
      A: quote(100, {
        ...composition,
        allocations: [{ country: "US", weight: 1.5 }],
      }),
    })?.coverage,
    0,
  );
});

test("preferir composição direta após confirmar identidade e preservar alternativa perante falha", async () => {
  const provider = {
    ...composition,
    sourceName: "iShares",
    method: "holdings" as const,
    holdingsCount: 1200,
  };
  function fakeFetcher(profileBody = profile): typeof fetch {
    let count = 0;
    return async () => {
      count++;
      if (count === 1)
        return new Response(
          '{"fetchCallbackUrl":"/en/search.html?callback=1","etfsParams":"query=EUNL"}',
        );
      if (count === 2)
        return Response.json({ recordsFiltered: 1, data: [{ isin }] });
      return new Response(profileBody);
    };
  }
  assert.deepEqual(
    await loadGeography("EUNL.DE", fakeFetcher(), async (id) => {
      assert.equal(id, isin);
      return provider;
    }),
    provider,
  );
  assert.equal(
    (
      await loadGeography("EUNL.DE", fakeFetcher(), async () => {
        throw new Error("offline");
      })
    )?.source,
    source,
  );
  const withoutCountries = profile.replace(/<table[\s\S]*?<\/table>/, "");
  assert.deepEqual(
    await loadGeography(
      "EUNL.DE",
      fakeFetcher(withoutCountries),
      async () => provider,
    ),
    provider,
  );
  let called = false;
  assert.equal(
    await loadGeography(
      "EUNL.DE",
      fakeFetcher(profile.replace("EUNL<", "WRONG<")),
      async () => {
        called = true;
        return provider;
      },
    ),
    null,
  );
  assert.equal(called, false);
});

test("somar vários países e ETFs num único continente sem alterar o denominador", () => {
  const data = allocation([order("A"), order("B")], {
    A: quote(100, {
      ...composition,
      allocations: [
        { country: "US", weight: 0.6 },
        { country: "CA", weight: 0.2 },
        { country: "PT", weight: 0.2 },
      ],
    }),
    B: quote(300, {
      ...composition,
      allocations: [
        { country: "US", weight: 0.5 },
        { country: "FR", weight: 0.3 },
        { country: "OTHER", weight: 0.1 },
      ],
    }),
  })!;
  const values = Object.fromEntries(
    data.allocations.map((a) => [a.continent, a.value]),
  );
  assert.equal(values.NA, 230);
  assert.equal(values.EU, 110);
  assert.ok(Math.abs(values.UNKNOWN - 60) < 1e-10);
  assert.equal(data.coverage, 85);
  assert.equal(data.allocations.length, 3);
  assert.equal(
    data.allocations.reduce((n, a) => n + a.percent, 0),
    100,
  );
});

test("país sem mapeamento e grupo residual não inventam exposição continental", () => {
  const data = allocation([order("A")], {
    A: quote(100, {
      ...composition,
      allocations: [
        { country: "ZZ", weight: 0.4 },
        { country: "OTHER", weight: 0.6 },
      ],
    }),
  })!;
  assert.deepEqual(data.allocations, [
    { continent: "UNKNOWN", value: 100, percent: 100 },
  ]);
  assert.equal(data.coverage, 0);
});
