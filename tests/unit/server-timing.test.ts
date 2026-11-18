import test from "node:test";
import assert from "node:assert/strict";
import { createServerTiming } from "../../src/server/shared/http/server-timing";

test("Server-Timing usa milissegundos monotónicos e preserva resposta e headers", (t) => {
  let now = 10;
  t.mock.method(performance, "now", () => now);
  const timing = createServerTiming();
  now = 12.5;
  const response = timing.response(
    new Response("ok", {
      status: 202,
      statusText: "Accepted",
      headers: { "Cache-Control": "private, no-store" },
    }),
  );

  assert.equal(response.status, 202);
  assert.equal(response.statusText, "Accepted");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(
    response.headers.get("server-timing") ?? "",
    /^total;dur=2\.50$/,
  );
});

test("medições falhadas são registadas e instâncias concorrentes ficam isoladas", async (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const first = createServerTiming();
  const second = createServerTiming();
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstOperation = first.measure(
    "auth",
    () =>
      new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }),
  );
  const secondOperation = second.measure(
    "service",
    () =>
      new Promise<void>((resolve) => {
        releaseSecond = resolve;
      }),
  );
  now = 2;
  releaseSecond();
  await secondOperation;
  now = 3;
  releaseFirst();
  await firstOperation;

  await assert.rejects(
    first.measure("account_read", async () => {
      now = 4;
      throw new Error("detalhe sensível");
    }),
    /detalhe sensível/,
  );
  const secondResponse = second.response(Response.json({ ok: true }));
  const firstResponse = first.response(Response.json({ ok: true }));
  const secondHeader = secondResponse.headers.get("server-timing") ?? "";
  const firstHeader = firstResponse.headers.get("server-timing") ?? "";

  assert.match(firstHeader, /auth;dur=3\.00/);
  assert.match(firstHeader, /account_read;dur=1\.00/);
  assert.match(secondHeader, /service;dur=2\.00/);
  assert.doesNotMatch(secondHeader, /auth|account_read/);
  assert.doesNotMatch(firstHeader, /sensível|token|ticker/i);
  assert.match(secondHeader, /total;dur=4\.00/);
});
