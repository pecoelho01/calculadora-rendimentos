import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildAccountChanges, validateAccountSnapshot, validateAccountWrite, type AccountSnapshot } from "../src/lib/account";
import { createAccountHandler, type AccountBackendFactory } from "./helpers/account-handler";
import { encodeStorage } from "../src/lib/storage";
import type { Portfolio } from "../src/lib/types";
import { validatePortfolio } from "../src/lib/validation";

const p: Portfolio = validatePortfolio({
  id: "local-1", name: "Exemplo", currency: "EUR", orders: [
    { id: "buy", date: "2024-01-01", ticker: "TEST", name: "Teste", type: "buy", shares: 2, pricebuy: 20 },
    { id: "sell", date: "2024-01-01", ticker: "TEST", name: "Teste", type: "sell", shares: 1, pricebuy: 30 },
  ],
});
const snapshot: AccountSnapshot = { version: 1, portfolios: [{ portfolio: p, revision: 5 }] };
const change = { id: p.id, portfolio: p, expectedRevision: null };
function request(body?: unknown, token = "valid") {
  return new Request("http://localhost/api/account", {
    method: body === undefined ? "GET" : "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
test("conta permite vazio, exige revisão e IDs estáveis sem gerar transações", () => {
  assert.deepEqual(validateAccountSnapshot({ version: 1, portfolios: [] }).portfolios, []);
  assert.deepEqual(validateAccountSnapshot(snapshot), snapshot);
  for (const revision of [null, 0, -1, 1.5, "5", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validateAccountSnapshot({ ...snapshot, portfolios: [{ portfolio: p, revision }] }));
  assert.throws(() => validateAccountWrite({ changes: [{ ...change, portfolio: { ...p, orders: [{ ...p.orders[0], id: "" }] } }] }));
  assert.throws(() => validateAccountWrite({ changes: [{ ...change, portfolio: { ...p, orders: [p.orders[1], p.orders[0]] } }] }));
  assert.throws(() => validateAccountWrite({ changes: [{ ...change, portfolio: { ...p, orders: [p.orders[0], p.orders[0]] } }] }));
});
test("diff por carteira não envia carteiras intactas e preserva revisões", () => {
  assert.deepEqual(buildAccountChanges(snapshot, [p]), []);
  const renamed = { ...p, name: "Novo nome" };
  const added = { ...p, id: "new" };
  assert.deepEqual(buildAccountChanges(snapshot, [renamed, added]), [
    { id: p.id, portfolio: renamed, expectedRevision: 5 },
    { id: added.id, portfolio: added, expectedRevision: null },
  ]);
  assert.deepEqual(buildAccountChanges(snapshot, []), [{ id: p.id, portfolio: null, expectedRevision: 5 }]);
});
test("write valida lote, limites, migração exclusiva e evita identidade indicada pelo cliente", () => {
  assert.deepEqual(validateAccountWrite({ changes: [change] }), { changes: [change] });
  assert.throws(() => validateAccountWrite({ changes: [change, change] }));
  assert.throws(() => validateAccountWrite({ changes: [{ ...change, id: "different" }] }));
  assert.throws(() => validateAccountWrite({ changes: [{ ...change, portfolio: null }] }));
  assert.throws(() => validateAccountWrite({ changes: [], user_id: "other" }));
  assert.throws(() => validateAccountWrite({ changes: [change], migration: { key: "a".repeat(64), portfolios: [p] } }));
  assert.throws(() => validateAccountWrite({ changes: [], migration: { key: "invalid", portfolios: [p] } }));
  assert.throws(() => buildAccountChanges({ version: 1, portfolios: [] }, Array.from({ length: 31 }, (_, i) => ({ ...p, id: String(i) }))));
});
test("API rejeita ausência/sessão inválida antes de executar DB e sinaliza configuração ausente", async () => {
  let calls = 0;
  const backend: AccountBackendFactory = () => ({
    async getUser(token) { return { data: { user: token === "valid" ? { id: "u1" } : null }, error: null }; },
    async rpc() { calls++; return { data: snapshot, error: null }; },
  });
  const handle = createAccountHandler(backend);
  assert.equal((await handle(request(undefined, ""))).status, 401);
  assert.equal((await handle(request(undefined, "expired"))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await createAccountHandler(() => null)(request())).status, 503);
});
test("API usa token autenticado no backend, devolve snapshot confirmado e nunca permite cache", async () => {
  const called: unknown[] = [];
  const handle = createAccountHandler((token) => {
    called.push(token);
    return {
      async getUser(actual) { called.push(actual); return { data: { user: { id: "session-user" } }, error: null }; },
      async rpc(name, args) { called.push({ name, args }); return { data: snapshot, error: null }; },
    };
  });
  const response = await handle(request({ changes: [{ ...change, expectedRevision: 5 }] }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), snapshot);
  assert.deepEqual(called, ["valid", "valid", { name: "account_apply", args: { p_changes: [{ ...change, expectedRevision: 5 }], p_migration: null } }]);
});
test("API verifica hash do snapshot migrado e preserva original e ordem de registo", async () => {
  const original = encodeStorage([p]);
  const key = createHash("sha256").update(original).digest("hex");
  let calls = 0;
  const handle = createAccountHandler(() => ({
    async getUser() { return { data: { user: { id: "u" } }, error: null }; },
    async rpc(_name, args) {
      calls++;
      assert.deepEqual(args?.p_migration, { key, portfolios: [p] });
      return { data: snapshot, error: null };
    },
  }));
  assert.equal((await handle(request({ changes: [], migration: { key: "a".repeat(64), portfolios: [p] } }))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handle(request({ changes: [], migration: { key, portfolios: [p] } }))).status, 200);
  assert.equal(encodeStorage([p]), original);
});
test("API não executa lote inválido, mapeia conflito e oculta erros internos", async () => {
  let calls = 0;
  let code = "PT409";
  const handle = createAccountHandler(() => ({
    async getUser() { return { data: { user: { id: "u" } }, error: null }; },
    async rpc() { calls++; return { data: null, error: { code, message: "private DB detail" } }; },
  }));
  assert.equal((await handle(request({ changes: [change], user_id: "victim" }))).status, 400);
  assert.equal(calls, 0);
  const conflict = await handle(request({ changes: [change] }));
  assert.equal(conflict.status, 409);
  code = "40001";
  assert.equal((await handle(request({ changes: [change] }))).status, 409);
  code = "22023";
  assert.equal((await handle(request({ changes: [change] }))).status, 400);
  code = "PT429";
  const limited = await handle(request({ changes: [change] }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(limited.headers.get("cache-control"), "private, no-store");
  code = "unavailable";
  const unavailable = await handle(request());
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private DB detail/);
});
test("API rejeita corpo demasiado grande antes de JSON parse e falha segura com snapshot externo inválido", async () => {
  let calls = 0;
  const handle = createAccountHandler(() => ({
    async getUser() { return { data: { user: { id: "u" } }, error: null }; },
    async rpc() { calls++; return { data: { version: 1, portfolios: [{ portfolio: p, revision: 0 }] }, error: null }; },
  }));
  const large = new Request("http://localhost/api/account", { method: "POST", headers: { Authorization: "Bearer valid", "Content-Length": "3100001" }, body: "{}" });
  assert.equal((await handle(large)).status, 413);
  assert.equal(calls, 0);
  assert.equal((await handle(request())).status, 503);
});

test("API preserva mensagens, headers e mapeamento de todos os erros SQL", async () => {
  const failures = [
    ["PT429", 429, "Demasiadas gravações. Aguarda um minuto antes de tentar novamente."],
    ["PT409", 409, "Esta carteira foi alterada noutro dispositivo. Recarrega os dados antes de repetir a operação."],
    ["40001", 409, "Esta carteira foi alterada noutro dispositivo. Recarrega os dados antes de repetir a operação."],
    ["22023", 400, "Dados inválidos ou limites excedidos. Nenhuma alteração foi guardada."],
    ["23514", 400, "Dados inválidos ou limites excedidos. Nenhuma alteração foi guardada."],
    ["42501", 401, "A sessão expirou. Inicia sessão novamente."],
    [undefined, 503, "Não foi possível aceder à conta. Tenta novamente."],
  ] as const;
  for (const [code, status, message] of failures) {
    const handle = createAccountHandler(() => ({
      async getUser() { return { data: { user: { id: "u" } }, error: null }; },
      async rpc() { return { data: null, error: { code } }; },
    }));
    for (const req of [request(), request({ changes: [] })]) {
      const response = await handle(req);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: message });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "Authorization");
      assert.equal(response.headers.get("retry-after"), code === "PT429" ? "60" : null);
    }
  }
});

test("API autentica antes de ler corpo ou rejeitar método e rejeita Bearer malformado", async () => {
  let factories = 0;
  let reads = 0;
  let rpcs = 0;
  const handle = createAccountHandler(() => {
    factories++;
    return {
      async getUser() { return { data: { user: { id: "u" } }, error: { message: "auth failure" } }; },
      async rpc() { rpcs++; return { data: snapshot, error: null }; },
    };
  });
  for (const authorization of ["Basic value", "Bearer", "Bearer a b", "Bearer  value"]) {
    const response = await handle(new Request("http://localhost/api/account", { headers: { authorization } }));
    assert.equal(response.status, 401);
  }
  assert.equal(factories, 0);
  const unauthorized = request({ changes: [] });
  Object.defineProperty(unauthorized, "body", { get() { reads++; throw new Error("should not read"); } });
  assert.equal((await handle(unauthorized)).status, 401);
  const unsupported = new Request("http://localhost/api/account", { method: "DELETE", headers: { Authorization: "Bearer valid" } });
  assert.equal((await handle(unsupported)).status, 401);
  assert.equal(reads, 0);
  assert.equal(rpcs, 0);
  const valid = createAccountHandler(() => ({
    async getUser() { return { data: { user: { id: "u" } }, error: null }; },
    async rpc() { rpcs++; return { data: snapshot, error: null }; },
  }));
  const response = await valid(unsupported);
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "Método não permitido." });
  assert.equal(rpcs, 0);
});

test("API limita corpo em streaming sem content-length e sanitiza JSON inválido", async () => {
  let calls = 0;
  let cancelled = false;
  const handle = createAccountHandler(() => ({
    async getUser() { return { data: { user: { id: "u" } }, error: null }; },
    async rpc() { calls++; return { data: snapshot, error: null }; },
  }));
  let chunks = 0;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(chunks++ === 0 ? 3_100_000 : 1));
    },
    cancel() { cancelled = true; },
  });
  const streaming = new Request("http://localhost/api/account", {
    method: "POST", headers: { Authorization: "Bearer valid" }, body: stream, duplex: "half",
  } as RequestInit & { duplex: "half" });
  const large = await handle(streaming);
  assert.equal(large.status, 413);
  assert.equal(cancelled, true);
  assert.deepEqual(await large.json(), { error: "O pedido excede o tamanho permitido." });
  for (const body of ["", "{private-json", "null"]) {
    const response = await handle(new Request("http://localhost/api/account", {
      method: "POST", headers: { Authorization: "Bearer valid" }, body,
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Dados inválidos. Nenhuma alteração foi guardada." });
    assert.equal(response.headers.get("vary"), "Authorization");
  }
  assert.equal(calls, 0);
});
