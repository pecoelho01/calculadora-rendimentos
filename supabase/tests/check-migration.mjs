// Optional deterministic PostgreSQL verification using PGlite outside project dependencies.
// npm install --prefix /tmp/rendimentos-sql-check @electric-sql/pglite
// node supabase/tests/check-migration.mjs /tmp/rendimentos-sql-check/node_modules/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (!modulePath) throw new Error("Indica o caminho para o módulo PGlite instalado separadamente.");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const u1 = "11111111-1111-4111-8111-111111111111";
const u2 = "22222222-2222-4222-8222-222222222222";
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  insert into auth.users values ('${u1}'),('${u2}');
`);
const migrations = new URL("../migrations/", import.meta.url);
for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
  await db.exec(await readFile(new URL(file, migrations), "utf8"));
}
// Check binary rounding matches the existing JavaScript shareUnits contract.
for (const value of [1e-8, 0.12345678, 1, 1e12, 999999999999.1234, 999999999999.1233, 0.00011, 1234567890.1234567]) {
  const result = await db.query("select private.account_units($1::numeric)::text as units", [String(value)]);
  assert.equal(BigInt(result.rows[0].units), BigInt(value.toFixed(8).replace(".", "")));
}
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${u1}',false)`);
const p = { id: "p1", name: "Exemplo", currency: "EUR", orders: [
  { id: "buy", date: "2024-01-01", ticker: "TEST", name: "Teste", type: "buy", shares: 2, pricebuy: 20 },
  { id: "sell", date: "2024-01-01", ticker: "TEST", name: "Teste", type: "sell", shares: 1, pricebuy: 30 },
] };
const snap = async () => (await db.query("select public.account_snapshot() as value")).rows[0].value;
const apply = async (changes, migration = null) => (await db.query("select public.account_apply($1::jsonb,$2::jsonb) as value", [JSON.stringify(changes), migration === null ? null : JSON.stringify(migration)])).rows[0].value;
const change = (portfolio, expectedRevision = null) => ({ id: portfolio.id, portfolio, expectedRevision });
const rejectsCode = async (fn, code) => assert.rejects(fn, (error) => error.code === code);
assert.deepEqual(await snap(), { version: 1, portfolios: [] });
let current = await apply([change(p)]);
assert.equal(current.portfolios[0].revision, 1);
assert.deepEqual(current.portfolios[0].portfolio.orders.map((o) => o.id), ["buy", "sell"]);
await rejectsCode(() => apply([change({ ...p, name: "Stale" }, 2)]), "PT409");
// Any later conflict rolls back an earlier valid operation in the same batch.
await rejectsCode(() => apply([change({ ...p, id: "p2" }), change({ ...p, name: "Stale" }, 2)]), "PT409");
assert.equal((await snap()).portfolios.length, 1);
// A transaction's array ordinality must break ties on equal dates.
await rejectsCode(() => apply([change({ ...p, id: "invalid", orders: [p.orders[1], p.orders[0]] })]), "22023");
await rejectsCode(() => apply([change({ ...p, id: "invalid", orders: [{ ...p.orders[0], shares: 0.123456789 }] })]), "22023");
await rejectsCode(() => apply([change({ ...p, id: "invalid", orders: [{ ...p.orders[0], date: "2024-02-30" }] })]), "22008");
await rejectsCode(() => apply([change({ ...p, id: "invalid", orders: [{ ...p.orders[0], pricebuy: -1 }] })]), "22023");
await rejectsCode(() => apply([change({ ...p, id: "invalid", orders: [p.orders[0], p.orders[0]] })]), "22023");
// Values accepted over direct Data API must remain representable by JavaScript numbers.
const tooSmall = JSON.stringify([change({ ...p, id: "underflow" })]).replace('"pricebuy":20', '"pricebuy":1e-400');
await assert.rejects(() => db.query("select public.account_apply($1::jsonb,null)", [tooSmall]), (error) => error.code.startsWith("22"));
const tooPrecise = JSON.stringify([change({ ...p, id: "precision" })]).replace('"shares":2', '"shares":100000000000.00000001');
await rejectsCode(() => db.query("select public.account_apply($1::jsonb,null)", [tooPrecise]), "22023");
await rejectsCode(() => apply([change({ ...p, id: "unicode-name", name: "😀".repeat(31) })]), "22023");
await rejectsCode(() => apply([change({ ...p, id: "😀".repeat(101) })]), "22023");
await rejectsCode(() => apply([change({ ...p, id: "blank-name", name: "\u00a0\ufeff" })]), "22023");
const largeQuantity = { ...p, id: "large-quantity", orders: [
  { ...p.orders[0], shares: 999999999999.1234 },
  { ...p.orders[1], shares: 999999999999.1233 },
  { ...p.orders[1], id: "sell2", shares: 0.00011 },
] };
const largeSaved = await apply([change(largeQuantity)]);
assert.ok(largeSaved.portfolios.some((item) => item.portfolio.id === largeQuantity.id));
await apply([{ id: largeQuantity.id, portfolio: null, expectedRevision: 1 }]);
await rejectsCode(() => db.query("update public.account_portfolios set revision=999"), "42501");
await rejectsCode(() => db.query("insert into public.account_portfolios(user_id,id,revision,portfolio) values($1,'x',1,$2)", [u1, JSON.stringify(p)]), "42501");
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u2]);
assert.deepEqual(await snap(), { version: 1, portfolios: [] });
assert.equal((await db.query("select * from public.account_portfolios")).rows.length, 0);
await apply([change({ ...p, name: "Segundo utilizador" })]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
assert.equal((await snap()).portfolios[0].portfolio.name, "Exemplo");
// Idempotency is scoped to a user and a payload; imports only create new IDs.
const migration = { key: "a".repeat(64), portfolios: [p] };
current = await apply([], migration);
assert.equal(current.portfolios.length, 2);
const imported = current.portfolios.find((item) => item.portfolio.id.startsWith("import-"));
assert.ok(imported);
assert.deepEqual(imported.portfolio.orders, p.orders);
assert.deepEqual(await apply([], migration), current);
await rejectsCode(() => apply([], { ...migration, portfolios: [{ ...p, name: "Different" }] }), "22023");
// Deleted IDs keep their revision so stale device writes fail after recreation.
await apply([{ id: p.id, portfolio: null, expectedRevision: 1 }]);
current = await apply([change(p)]);
assert.equal(current.portfolios.find((item) => item.portfolio.id === p.id).revision, 3);
await rejectsCode(() => apply([change({ ...p, name: "stale" }, 1)]), "PT409");
const beforeFull = await snap();
await rejectsCode(() => apply(Array.from({ length: 29 }, (_, i) => change({ ...p, id: `many-${i}` }))), "22023");
assert.deepEqual(await snap(), beforeFull);
// Capacity failure also rolls back migration receipts, so a later retry can succeed.
await apply(Array.from({ length: 28 }, (_, i) => change({ ...p, id: `capacity-${i}` })));
const full = await snap();
const retriable = { key: "b".repeat(64), portfolios: [p] };
await rejectsCode(() => apply([], retriable), "22023");
assert.deepEqual(await snap(), full);
assert.equal((await db.query("select * from public.account_migrations where key=$1", [retriable.key])).rows.length, 0);
await apply([{ id: "capacity-0", portfolio: null, expectedRevision: 1 }]);
assert.equal((await apply([], retriable)).portfolios.length, 30);
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
await rejectsCode(() => snap(), "42501");
await rejectsCode(() => apply([change(p)]), "42501");
await db.close();
console.log("SQL/PGlite: migration aplicada; CAS, rollback, ordem original, validação financeira, RLS entre utilizadores, grants, idempotência e ABA verificados.");
