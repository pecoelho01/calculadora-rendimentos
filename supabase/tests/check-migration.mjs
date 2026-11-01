// Optional deterministic PostgreSQL verification using PGlite outside project dependencies.
// npm install --prefix /tmp/rendimentos-sql-check @electric-sql/pglite
// npm run test:sql -- /tmp/rendimentos-sql-check/node_modules/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createAccountHandler } from "../../src/lib/account-server.ts";

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
const grandfatherUser = "44444444-4444-4444-8444-444444444444";
const historicalPortfolio = { id: "historical-active", name: "Histórico preservado", currency: "EUR", orders: [] };
const historicalKey = "8".repeat(64);
const migrations = new URL("../migrations/", import.meta.url);
for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
  if (file.startsWith("202610300003")) {
    // A receipt created by migration 002 must prevent duplicates after upgrading.
    const legacy = { id: "legacy", name: "Antes da atualização", currency: "EUR", orders: [] };
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
    await db.query("select public.account_apply('[]'::jsonb,$1::jsonb)", [JSON.stringify({ key: "d".repeat(64), portfolios: [legacy] })]);
    const legacyNumeric = { ...legacy, id: "legacy-numeric", orders: [{ id: "order", date: "2024-01-01", ticker: "TEST", name: "", type: "buy", shares: 2, pricebuy: 20 }] };
    const oldNumericPayload = JSON.stringify({ key: "6".repeat(64), portfolios: [legacyNumeric] }).replace('"shares":2', '"shares":2.0');
    const original = (await db.query("select public.account_apply('[]'::jsonb,$1::jsonb) as value", [oldNumericPayload])).rows[0].value;
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
    const replay = (await db.query("select public.account_apply('[]'::jsonb,$1::jsonb) as value", [JSON.stringify({ key: "e".repeat(64), portfolios: [legacy] })])).rows[0].value;
    assert.deepEqual(replay, original);
    // A retry with the original legacy key upgrades its noncanonical numeric hash.
    assert.deepEqual((await db.query("select public.account_apply('[]'::jsonb,$1::jsonb) as value", [oldNumericPayload])).rows[0].value, original);
    assert.deepEqual((await db.query("select public.account_apply('[]'::jsonb,$1::jsonb) as value", [JSON.stringify({ key: "7".repeat(64), portfolios: [legacyNumeric] })])).rows[0].value, original);
    await db.exec("delete from public.account_portfolios; delete from public.account_migrations");
  } else if (file.startsWith("202610310004")) {
    // Seed an over-quota account BEFORE upgrading: migration must not delete history.
    await db.query("insert into auth.users values ($1)", [grandfatherUser]);
    await db.query(`insert into public.account_portfolios(user_id,id,revision,portfolio)
      select $1::uuid,'old-'||i,2,null from generate_series(1,1000) i`, [grandfatherUser]);
    await db.query("insert into public.account_portfolios(user_id,id,revision,portfolio) values($1,$2,1,$3::jsonb)",
      [grandfatherUser, historicalPortfolio.id, JSON.stringify(historicalPortfolio)]);
    await db.query(`insert into public.account_migrations(user_id,key,payload_hash)
      select $1::uuid,lpad(to_hex(i),64,'0'),'historical-fixture-'||i from generate_series(1,1000) i`, [grandfatherUser]);
    await db.query(`insert into public.account_migrations(user_id,key,payload_hash)
      values($1,$2,encode(sha256(convert_to(private.account_canonical_json($3::jsonb)::text,'UTF8')),'hex'))`,
      [grandfatherUser, historicalKey, JSON.stringify([historicalPortfolio])]);
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  } else await db.exec(await readFile(new URL(file, migrations), "utf8"));
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
await rejectsCode(() => db.query("select private.account_canonical_json('[]'::jsonb)"), "42501");
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
const alternate = { ...migration, key: "c".repeat(64) };
assert.deepEqual(await apply([], alternate), current);
await rejectsCode(() => apply([], { ...alternate, portfolios: [{ ...p, name: "Changed alias" }] }), "22023");
// Different JSON property order and numeric scales still represent the same snapshot.
const reordered = { ...Object.fromEntries(Object.entries(p).reverse()), orders: p.orders.map((order) => Object.fromEntries(Object.entries(order).reverse())) };
assert.deepEqual(await apply([], { key: "4".repeat(64), portfolios: [reordered] }), current);
const numericReplay = JSON.stringify({ ...migration, key: "f".repeat(64) }).replace('"shares":2', '"shares":2.000').replace('"pricebuy":20', '"pricebuy":20.0');
assert.deepEqual((await db.query("select public.account_apply('[]'::jsonb,$1::jsonb) as value", [numericReplay])).rows[0].value, current);
// Receipts survive edits and deletion; retry must never resurrect an imported portfolio.
await apply([change({ ...imported.portfolio, name: "Edited import" }, imported.revision)]);
const edited = await snap();
assert.deepEqual(await apply([], { ...migration, key: "1".repeat(64) }), edited);
await apply([{ id: imported.portfolio.id, portfolio: null, expectedRevision: imported.revision + 1 }]);
const deleted = await snap();
assert.deepEqual(await apply([], { ...migration, key: "2".repeat(64) }), deleted);
// Recreate only through an explicit revision-aware write for later capacity assertions.
await apply([change(imported.portfolio)]);
// Content receipts are scoped to the authenticated owner.
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u2]);
const other = await apply([], migration);
assert.equal(other.portfolios.length, 2);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
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
assert.deepEqual(await apply([], { ...migration, key: "3".repeat(64) }), full);
const retriable = { key: "b".repeat(64), portfolios: [{ ...p, name: "New import after capacity" }] };
await rejectsCode(() => apply([], retriable), "22023");
assert.deepEqual(await snap(), full);
assert.equal((await db.query("select * from public.account_migrations where key=$1", [retriable.key])).rows.length, 0);
await apply([{ id: "capacity-0", portfolio: null, expectedRevision: 1 }]);
assert.equal((await apply([], retriable)).portfolios.length, 30);
// At the SQL byte limit, compact JSON array punctuation must not break reads.
await db.exec("reset role; insert into auth.users values ('33333333-3333-4333-8333-333333333333'); set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false)");
const boundary = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: "N".repeat(60), currency: "EUR", orders: [] }));
const boundaryOrder = (i) => ({ id: String(i).padEnd(200, "x"), date: "2024-01-01", ticker: "TEST", name: "N".repeat(100), type: "buy", shares: 1, pricebuy: 1 });
const sqlBytes = async (portfolios) => (await db.query("select sum(octet_length(value::text))::int as size from jsonb_array_elements($1::jsonb)", [JSON.stringify(portfolios)])).rows[0].size;
const baseBytes = await sqlBytes(boundary);
const perOrder = await sqlBytes([{ ...boundary[0], orders: [boundaryOrder(0)] }]) - await sqlBytes([boundary[0]]);
let orderCount = Math.floor((3_000_000 - baseBytes + 60) / (perOrder + 2));
for (let i = 0; i < orderCount; i++) boundary[i % 30].orders.push(boundaryOrder(i));
while (await sqlBytes(boundary) > 3_000_000) {
  orderCount--;
  boundary[orderCount % 30].orders.pop();
}
boundary[orderCount % 30].orders.push(boundaryOrder(orderCount));
orderCount++;
let excess = await sqlBytes(boundary) - 3_000_000;
for (const portfolio of boundary) for (const order of portfolio.orders) {
  if (excess <= 0) break;
  const trim = Math.min(excess, order.id.length - 10);
  if (trim) order.id = order.id.slice(0, -trim);
  excess -= trim;
}
assert.equal(await sqlBytes(boundary), 3_000_000);
// Use the production handler and validators, with only Auth and the transport injected.
// RPC calls execute the real SQL under the authenticated role above.
const rpcCalls = [];
let rejectedSqlCode = null;
const handle = createAccountHandler(() => ({
  async getUser(token) {
    return token === "boundary-test-token" ? { id: "33333333-3333-4333-8333-333333333333" } : null;
  },
  async rpc(name, args) {
    rpcCalls.push(name);
    try {
      const data = name === "account_apply"
        ? await apply(args.p_changes, args.p_migration)
        : await snap();
      return { data, error: null };
    } catch (error) {
      rejectedSqlCode = error.code;
      return { data: null, error: { code: error.code } };
    }
  },
}));
const apiRequest = (body) => new Request("http://localhost/api/account", {
  method: body === undefined ? "GET" : "POST",
  headers: { Authorization: "Bearer boundary-test-token", "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const writeAtLimit = await handle(apiRequest({ changes: boundary.map((portfolio) => change(portfolio)) }));
assert.equal(writeAtLimit.status, 200, "POST no limite SQL deve confirmar a escrita e devolver um snapshot válido.");
assert.equal(writeAtLimit.headers.get("cache-control"), "private, no-store");
assert.deepEqual(rpcCalls, ["account_apply"]);
const atLimit = await writeAtLimit.json();
const readAtLimit = await handle(apiRequest());
assert.equal(readAtLimit.status, 200, "GET após a escrita no limite deve continuar legível pela API.");
assert.deepEqual(await readAtLimit.json(), atLimit);
const compactBytes = Buffer.byteLength(JSON.stringify(atLimit.portfolios.map((record) => record.portfolio)));
assert.ok(compactBytes <= 3_000_000);
const enlarged = structuredClone(atLimit.portfolios.find((record) => record.portfolio.orders.some((order) => order.id.length < 200)));
enlarged.portfolio.orders.find((order) => order.id.length < 200).id += "y";
const overflowingPortfolios = atLimit.portfolios.map((record) => record.portfolio.id === enlarged.portfolio.id ? enlarged.portfolio : record.portfolio);
assert.equal(await sqlBytes(overflowingPortfolios), 3_000_001);
const oversizedWrite = await handle(apiRequest({ changes: [change(enlarged.portfolio, enlarged.revision)] }));
assert.equal(oversizedWrite.status, 400, "POST um byte acima do limite SQL deve ser rejeitado, sem confirmação seguida de 503.");
assert.equal(rejectedSqlCode, "22023", "A rejeição deve vir do PostgreSQL, não apenas da validação de entrada.");
assert.deepEqual(rpcCalls, ["account_apply", "account_snapshot", "account_apply"]);
const afterRejectedWrite = await handle(apiRequest());
assert.equal(afterRejectedWrite.status, 200);
assert.equal(afterRejectedWrite.headers.get("cache-control"), "private, no-store");
assert.deepEqual(await afterRejectedWrite.json(), atLimit);
assert.deepEqual(await snap(), atLimit);
console.log(`API + PostgreSQL: SQL bytes=3000000; compact array bytes=${compactBytes}; orders=${orderCount}; POST/GET=200; overflow POST=400; GET remains unchanged.`);
// Resource-limit fixtures run only in this isolated database, never in the service.
const resourceUser = "55555555-5555-4555-8555-555555555555";
const rateUser = "66666666-6666-4666-8666-666666666666";
await db.exec("reset role");
for (const role of ["anon", "authenticated"]) {
  const privileges = (await db.query(`select
    has_table_privilege($1,'private.account_write_limits','SELECT,INSERT,UPDATE,DELETE') as table_access,
    has_function_privilege($1,'private.account_check_write_rate(uuid)','EXECUTE') as helper_access`, [role])).rows[0];
  assert.deepEqual(privileges, { table_access: false, helper_access: false });
}
await db.query("insert into auth.users values ($1),($2)", [resourceUser, rateUser]);
const setOwner = async (id) => {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
};
const resourceCounts = async (id) => {
  await db.exec("reset role");
  const result = (await db.query(`select
    (select count(*)::int from public.account_portfolios where user_id=$1) as ids,
    (select count(*)::int from public.account_migrations where user_id=$1) as receipts,
    (select calls from private.account_write_limits where user_id=$1) as calls`, [id])).rows[0];
  await setOwner(id);
  return result;
};
const resetRateWindow = async (id) => {
  await db.exec("reset role");
  // Move the clock fixture, rather than sleep or weaken the production function.
  await db.query("update private.account_write_limits set window_started=clock_timestamp()-interval '2 minutes' where user_id=$1", [id]);
  await setOwner(id);
};
await setOwner(grandfatherUser);
assert.deepEqual(await snap(), { version: 1, portfolios: [{ portfolio: historicalPortfolio, revision: 1 }] });
assert.deepEqual(await resourceCounts(grandfatherUser), { ids: 1001, receipts: 1001, calls: null });
const historicalImport = { key: historicalKey, portfolios: [historicalPortfolio] };
await apply([], historicalImport);
await apply([change({ ...historicalPortfolio, name: "Atualização permitida" }, 1)]);
await apply([{ id: historicalPortfolio.id, portfolio: null, expectedRevision: 2 }]);
await apply([change(historicalPortfolio)]);
assert.equal((await snap()).portfolios[0].revision, 4);
const historicalBefore = await snap();
const grandfatherBefore = await resourceCounts(grandfatherUser);
await rejectsCode(() => apply([change({ ...historicalPortfolio, id: "blocked-new-id" })]), "22023");
await rejectsCode(() => apply([], { ...historicalImport, key: "9".repeat(64) }), "22023");
await rejectsCode(() => apply([], { key: "a".repeat(64), portfolios: [{ ...historicalPortfolio, name: "Novo conteúdo" }] }), "22023");
assert.deepEqual(await snap(), historicalBefore);
assert.deepEqual(await resourceCounts(grandfatherUser), grandfatherBefore);
// Existing receipt stays idempotent even after edits/deletion/recreation and above quota.
await apply([], historicalImport);
assert.deepEqual(await snap(), historicalBefore);

await setOwner(resourceUser);
const source = { id: "resource-source", name: "Limites", currency: "EUR", orders: [] };
const sourceImport = { key: "a".repeat(64), portfolios: [source] };
const resourceSnapshot = await apply([], sourceImport);
await db.exec("reset role");
// Leave ONE slot for a new alias, then enforce the real function at the boundary.
await db.query(`insert into public.account_migrations(user_id,key,payload_hash)
  select $1::uuid,lpad(to_hex(i),64,'0'),'fixture-'||i from generate_series(1,998) i`, [resourceUser]);
await setOwner(resourceUser);
assert.deepEqual(await apply([], { ...sourceImport, key: "b".repeat(64) }), resourceSnapshot);
assert.equal((await resourceCounts(resourceUser)).receipts, 1000);
const aliasesBefore = await resourceCounts(resourceUser);
await rejectsCode(() => apply([], { ...sourceImport, key: "c".repeat(64) }), "22023");
await rejectsCode(() => apply([], { key: "d".repeat(64), portfolios: [{ ...source, name: "Mais conteúdo" }] }), "22023");
assert.deepEqual(await resourceCounts(resourceUser), aliasesBefore);
assert.deepEqual(await snap(), resourceSnapshot);
assert.deepEqual(await apply([], sourceImport), resourceSnapshot);
// Quotas are per owner: the same source/key remains valid for a separate user.
await setOwner(rateUser);
assert.equal((await apply([], sourceImport)).portfolios.length, 1);
await setOwner(resourceUser);
await db.exec("reset role");
await db.query(`insert into public.account_portfolios(user_id,id,revision,portfolio)
  select $1::uuid,'tomb-'||i,2,null from generate_series(1,998) i`, [resourceUser]);
await setOwner(resourceUser);
const finalSlot = { ...source, id: "last-slot" };
await apply([change(finalSlot)]);
await apply([{ id: finalSlot.id, portfolio: null, expectedRevision: 1 }]);
assert.equal((await resourceCounts(resourceUser)).ids, 1000);
const identifiersBefore = await resourceCounts(resourceUser);
// An earlier valid edit must roll back if a later new identifier exceeds capacity.
await rejectsCode(() => apply([change({ ...resourceSnapshot.portfolios[0].portfolio, name: "Must roll back" }, 1), change({ ...source, id: "overflow-id" })]), "22023");
assert.deepEqual(await resourceCounts(resourceUser), identifiersBefore);
assert.deepEqual(await snap(), resourceSnapshot);
await apply([change(finalSlot)]);
assert.equal((await snap()).portfolios.find((item) => item.portfolio.id === finalSlot.id).revision, 3);
await rejectsCode(() => apply([change({ ...finalSlot, name: "stale" }, 1)]), "PT409");
await apply([{ id: finalSlot.id, portfolio: null, expectedRevision: 3 }]);
assert.equal((await resourceCounts(resourceUser)).ids, 1000);
// Portfolio ID capacity must also be enforced on an import, below receipt capacity.
await db.exec("reset role");
await db.query("delete from public.account_migrations where user_id=$1 and key=$2", [resourceUser, "b".repeat(64)]);
await setOwner(resourceUser);
const beforeImportCapacity = await resourceCounts(resourceUser);
await rejectsCode(() => apply([], { key: "e".repeat(64), portfolios: [{ ...source, name: "New at ID capacity" }] }), "22023");
assert.deepEqual(await resourceCounts(resourceUser), beforeImportCapacity);
// Existing data and receipts cannot expose or directly alter the private limiter.
await rejectsCode(() => db.query("select * from private.account_write_limits"), "42501");
await rejectsCode(() => db.query("update private.account_write_limits set calls=1"), "42501");
await rejectsCode(() => db.query("select private.account_check_write_rate($1)", [rateUser]), "42501");

await resetRateWindow(rateUser);
const rateBefore = await snap();
for (let i = 0; i < 60; i++) await apply([], sourceImport);
assert.equal((await resourceCounts(rateUser)).calls, 60);
await rejectsCode(() => apply([], sourceImport), "PT429");
assert.equal((await resourceCounts(rateUser)).calls, 60);
assert.deepEqual(await snap(), rateBefore); // Reads remain available after the write limit.
await setOwner(resourceUser);
await apply([], sourceImport); // Another owner's limiter is independent.
await resetRateWindow(rateUser);
await apply([], sourceImport);
assert.equal((await resourceCounts(rateUser)).calls, 1);
const beforeFailedWrite = await resourceCounts(rateUser);
await rejectsCode(() => apply([change({ ...source, id: "invalid-rate", orders: [{ ...p.orders[0], shares: -1 }] })]), "22023");
assert.deepEqual(await resourceCounts(rateUser), beforeFailedWrite);
// Deleting the Auth fixture cascades its private rate row as well as all account data.
await db.exec("reset role");
await db.query("delete from auth.users where id=$1", [rateUser]);
assert.equal((await db.query("select count(*)::int as total from private.account_write_limits where user_id=$1", [rateUser])).rows[0].total, 0);
console.log("SQL/PGlite: quotas de IDs/recibos, upgrade sem perda, rollback, isolamento e 60 escritas/minuto verificados.");
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
await rejectsCode(() => snap(), "42501");
await rejectsCode(() => apply([change(p)]), "42501");
await db.close();
console.log("SQL/PGlite: migration aplicada; CAS, rollback, ordem original, validação financeira, RLS entre utilizadores, grants, idempotência e ABA verificados.");
