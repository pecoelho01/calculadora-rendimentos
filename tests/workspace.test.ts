import test from "node:test";
import assert from "node:assert/strict";
import { appendLocalPortfolios, validateSnapshot } from "../src/lib/workspace";
import type { Portfolio } from "../src/lib/types";
const portfolio: Portfolio = {
  id: "p1",
  name: "Local",
  currency: "EUR",
  orders: [
    {
      id: "o1",
      ticker: "TEST",
      name: "Teste",
      date: "2024-01-01",
      pricebuy: 100,
      shares: 2,
      type: "buy",
    },
  ],
};
const remote = {
  version: 1 as const,
  revision: 7,
  portfolios: [{ ...portfolio, name: "Remota" }],
};
test("snapshot partilhado valida revisão, esquema e identificadores", () => {
  assert.deepEqual(validateSnapshot(remote), remote);
  for (const revision of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, "7", null])
    assert.throws(() => validateSnapshot({ ...remote, revision }));
  assert.throws(() => validateSnapshot({ ...remote, version: 2 }));
  assert.throws(() => validateSnapshot({ ...remote, portfolios: [] }));
  assert.throws(() =>
    validateSnapshot({ ...remote, portfolios: [portfolio, portfolio] }),
  );
});
test("migração local acrescenta sem substituir e mantém os originais", () => {
  const original = JSON.stringify(portfolio);
  let id = 0;
  const imported = appendLocalPortfolios(
    remote,
    [portfolio],
    () => `new-${++id}`,
  );
  assert.equal(imported.revision, 7);
  assert.equal(imported.portfolios.length, 2);
  assert.equal(imported.portfolios[0].name, "Remota");
  assert.equal(imported.portfolios[1].id, "new-1");
  assert.equal(imported.portfolios[1].orders[0].id, "new-2");
  assert.equal(imported.portfolios[1].orders[0].shares, 2);
  assert.equal(JSON.stringify(portfolio), original);
  assert.equal(remote.portfolios.length, 1);
});
test("migração é atómica perante uma carteira inválida ou limite excedido", () => {
  assert.throws(() =>
    appendLocalPortfolios(remote, [
      { ...portfolio, orders: [{ ...portfolio.orders[0], type: "sell" }] },
    ]),
  );
  const full = {
    ...remote,
    portfolios: Array.from({ length: 30 }, (_, i) => ({
      ...portfolio,
      id: `p${i}`,
    })),
  };
  assert.throws(() => appendLocalPortfolios(full, [portfolio]), /30/);
  assert.equal(full.portfolios.length, 30);
});
