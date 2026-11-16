import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDeployment,
  waitForPublishedRevision,
} from "../../scripts/deployment-smoke.mjs";

const revision = "a".repeat(40);

test("smoke aguarda a promoção sem aceitar uma versão anterior no domínio", async () => {
  let requests = 0;
  let pauses = 0;
  await waitForPublishedRevision("https://example.vercel.app", revision, {
    attempts: 3,
    request: async () =>
      Response.json({ revision: ++requests === 3 ? revision : "b".repeat(40) }),
    pause: async () => {
      pauses += 1;
    },
  });
  assert.equal(pauses, 2);
  await assert.rejects(
    () =>
      waitForPublishedRevision("https://example.vercel.app", revision, {
        attempts: 2,
        request: async () => Response.json({ revision: "b".repeat(40) }),
        pause: async () => {},
      }),
    /não chegou ao domínio/,
  );
});
function responses(overrides = {}) {
  return async function request(input, options) {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    const path = new URL(input).pathname;
    if (overrides[path]) return overrides[path];
    if (path === "/")
      return new Response("<html><body>Aplicação</body></html>", {
        headers: { "content-type": "text/html" },
      });
    if (path === "/api/account")
      return Response.json(
        { error: "Inicia sessão." },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      );
    if (path === "/api/health")
      return Response.json({ status: "ok", account: "enabled", revision });
    throw new Error("Pedido inesperado.");
  };
}

test("smoke confirma página, proteção da API, contrato e revisão", async () => {
  await checkDeployment("https://example.vercel.app", revision, responses());
});

test("smoke rejeita revisão anterior, página inválida, API aberta e BD indisponível", async () => {
  for (const overrides of [
    { "/": new Response("login", { status: 401 }) },
    { "/api/account": Response.json({ portfolios: [] }) },
    {
      "/api/health": Response.json({ status: "unavailable" }, { status: 503 }),
    },
    {
      "/api/health": Response.json({
        status: "ok",
        account: "enabled",
        revision: "b".repeat(40),
      }),
    },
  ]) {
    await assert.rejects(() =>
      checkDeployment(
        "https://example.vercel.app",
        revision,
        responses(overrides),
      ),
    );
  }
});

test("smoke não aceita origens com credenciais, query, path ou HTTP remoto", async () => {
  for (const origin of [
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?x=1",
    "http://example.com",
  ]) {
    await assert.rejects(() => checkDeployment(origin, revision, responses()));
  }
});
