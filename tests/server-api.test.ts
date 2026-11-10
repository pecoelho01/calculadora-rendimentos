import test from "node:test";
import assert from "node:assert/strict";
import { createMarketHandler } from "../src/server/market/market.controller";
import { createMarketService } from "../src/server/market/market.service";
import { createGeographyHandler } from "../src/server/geography/geography.controller";
import { createGeographyService } from "../src/server/geography/geography.service";
import { createAccountService } from "../src/server/account/account.service";
import { AccountError } from "../src/server/account/account.errors";
import { createSupabaseClient } from "../src/server/shared/supabase/create-client";
import { authenticate } from "../src/server/shared/auth/authenticate";
import type { Geography, MarketAsset } from "../src/lib/types";

const asset: MarketAsset = {
  price: 0, previousClose: 0, currency: "EUR", name: "Teste",
  asOf: "2024-01-02T12:00:00Z", history: [{ date: "2024-01-02", close: 0 }], intraday: [],
};
const query = (path: string) => new Request(`http://localhost/api/${path}`);

test("mercado mantém deduplicação, preços zero e falhas isoladas por ticker", async () => {
  const calls: unknown[] = [];
  const handler = createMarketHandler(createMarketService(async (ticker, start) => {
    calls.push([ticker, start]);
    if (ticker === "FAIL") throw new Error("private provider detail");
    return asset;
  }));
  const response = await handler(query("market?tickers=ZERO,FAIL,ZERO,,&start=2024-01-01"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls, [["ZERO", "2024-01-01"], ["FAIL", "2024-01-01"]]);
  assert.deepEqual(await response.json(), { assets: {
    ZERO: asset,
    FAIL: { price: null, previousClose: null, currency: null, name: "FAIL", asOf: null,
      history: [], intraday: [], error: "Dados indisponíveis. Tenta novamente mais tarde." },
  } });
});

test("mercado e geografia rejeitam pedidos inválidos sem consultar fornecedores", async () => {
  let calls = 0;
  const market = createMarketHandler(createMarketService(async () => { calls++; return asset; }));
  const geography = createGeographyHandler(createGeographyService(async () => { calls++; return null; }));
  const tooMany = Array.from({ length: 21 }, (_, i) => `T${i}`).join(",");
  for (const tickers of ["", "abc", "A/B", tooMany]) {
    for (const [path, handler, message] of [
      ["market", market, "Pedido inválido: até 20 tickers e data ISO desde 2000."],
      ["geography", geography, "Pedido inválido: indicar entre 1 e 20 tickers."],
    ] as const) {
      const response = await handler(query(`${path}?tickers=${encodeURIComponent(tickers)}&start=2024-01-01`));
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), null);
      assert.deepEqual(await response.json(), { error: message });
    }
  }
  for (const start of ["", "1999-12-31", "2024-02-30", "2099-01-01"]) {
    assert.equal((await market(query(`market?tickers=TEST&start=${start}`))).status, 400);
  }
  assert.equal(calls, 0);
});

test("geografia preserva null, resultados e deduplicação, sem ocultar falhas inesperadas", async () => {
  const data: Geography = { allocations: [{ country: "Portugal", weight: 100 }], asOf: "2024-01-01", source: "https://example.com" };
  const calls: string[] = [];
  const handler = createGeographyHandler(createGeographyService(async (ticker) => {
    calls.push(ticker);
    if (ticker === "FAIL") throw new RangeError("unexpected provider failure");
    return ticker === "NONE" ? null : data;
  }));
  const response = await handler(query("geography?tickers=TEST,NONE,TEST,,"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { geographies: { TEST: data, NONE: null } });
  assert.deepEqual(calls, ["TEST", "NONE"]);
  await assert.rejects(handler(query("geography?tickers=FAIL")), /unexpected provider failure/);
});

test("services de conta validam antes de escrever e devolvem apenas snapshots validados", async () => {
  let writes = 0;
  const service = createAccountService({
    async snapshot() { return { version: 1, portfolios: [] }; },
    async apply(write) { writes++; assert.deepEqual(write, { changes: [] }); return { version: 1, portfolios: [] }; },
  });
  await assert.rejects(service.apply({ changes: [], user_id: "other" }), (error) => error instanceof AccountError && error.kind === "invalid-write");
  assert.equal(writes, 0);
  assert.deepEqual(await service.snapshot(), { version: 1, portfolios: [] });
  assert.deepEqual(await service.apply({ changes: [] }), { version: 1, portfolios: [] });
  assert.equal(writes, 1);
  const broken = createAccountService({ async snapshot() { return {}; }, async apply() { return {}; } });
  await assert.rejects(broken.snapshot());
  await assert.rejects(broken.apply({ changes: [] }));
});

test("cliente Supabase é isolado por pedido e usa JWT, no-store e timeout em Auth/RPC", async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const calls: { url: string; token: string | null }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const token = new Headers(init?.headers).get("authorization");
    calls.push({ url, token });
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({ id: token === "Bearer user-one" ? "one" : "two" });
    }
    return Response.json({ version: 1, portfolios: [] });
  });
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
    const one = createSupabaseClient("user-one")!;
    const two = createSupabaseClient("user-two")!;
    assert.notEqual(one, two);
    assert.deepEqual(await authenticate(one, "user-one"), { id: "one" });
    assert.deepEqual(await authenticate(two, "user-two"), { id: "two" });
    await one.rpc("account_snapshot");
    await two.rpc("account_snapshot");
    assert.deepEqual(calls.map((call) => call.token), ["Bearer user-one", "Bearer user-two", "Bearer user-one", "Bearer user-two"]);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
