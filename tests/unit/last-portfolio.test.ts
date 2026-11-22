import test from "node:test";
import assert from "node:assert/strict";
import {
  LAST_PORTFOLIO_KEY,
  readLastPortfolioIds,
  writeLastPortfolioId,
} from "../../src/lib/storage";

function createStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(LAST_PORTFOLIO_KEY, initial);
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  } as Storage;
}

test("memoriza a última carteira por modo", () => {
  const storage = createStorage();
  assert.equal(writeLastPortfolioId("local", "local-id", storage), true);
  assert.equal(writeLastPortfolioId("account", "account-id", storage), true);
  assert.deepEqual(readLastPortfolioIds(storage), {
    local: "local-id",
    account: "account-id",
  });
});

test("ignora valores inválidos e armazenamento bloqueado", () => {
  assert.equal(readLastPortfolioIds(createStorage("{")), null);
  assert.equal(
    readLastPortfolioIds(createStorage(JSON.stringify({ local: " " }))),
    null,
  );
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
  assert.equal(readLastPortfolioIds(blocked), null);
  assert.equal(writeLastPortfolioId("local", "id", blocked), false);
  assert.equal(
    writeLastPortfolioId("local", "x".repeat(201), createStorage()),
    false,
  );
});
