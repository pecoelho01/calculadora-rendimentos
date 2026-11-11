import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewCsvOrders, type CsvReviewRow } from "../src/lib/csv-review";
import { validateOrder } from "../src/lib/validation";

function draft(overrides: Partial<CsvReviewRow> = {}): CsvReviewRow {
  return {
    id: "buy",
    date: "2024-01-01",
    ticker: "TEST",
    name: "Teste",
    pricebuy: "10",
    shares: "2",
    type: "buy",
    include: true,
    ...overrides,
  };
}

test("revisão ignora linhas excluídas sem alterar campos ou ordens existentes", () => {
  const rows = [
    draft({ ticker: " test ", pricebuy: "10,50" }),
    draft({ id: "excluded", date: "inválida", include: false }),
  ];
  const existing = [validateOrder(draft({ id: "existing", ticker: "OTHER" }))];
  const before = structuredClone({ rows, existing });
  const review = reviewCsvOrders(rows, existing);

  assert.equal(review.error, "");
  assert.equal(review.errors.size, 0);
  assert.equal(review.duplicates.size, 0);
  assert.deepEqual(
    review.orders.map(({ id, ticker, pricebuy }) => ({ id, ticker, pricebuy })),
    [{ id: "buy", ticker: "TEST", pricebuy: 10.5 }],
  );
  assert.deepEqual({ rows, existing }, before);
});

test("revisão distingue ausência de seleção e linhas inválidas selecionadas", () => {
  const empty = reviewCsvOrders([draft({ include: false })], []);
  assert.equal(
    empty.error,
    "Seleciona pelo menos uma transação para importar.",
  );

  const invalid = reviewCsvOrders([draft({ pricebuy: "0" })], []);
  assert.equal(invalid.orders.length, 0);
  assert.equal(invalid.errors.size, 1);
  assert.match(invalid.errors.get("buy")!, /positivo/i);
  assert.equal(
    invalid.error,
    "Corrige os campos de 1 transação inválida ou desmarca essas linhas.",
  );
});

test("revisão distingue duplicados na carteira, no ficheiro e em ambos", () => {
  const existing = [validateOrder(draft())];
  const portfolioOnly = reviewCsvOrders([draft({ id: "copy" })], existing);
  assert.equal(portfolioOnly.duplicates.get("copy"), "Já existe na carteira.");

  const repeatedRows = [
    draft({ id: "first" }),
    draft({ id: "second", name: "Outro nome" }),
  ];
  const fileOnly = reviewCsvOrders(repeatedRows, []);
  assert.equal(fileOnly.duplicates.size, 2);
  for (const message of fileOnly.duplicates.values()) {
    assert.equal(message, "Repete-se no ficheiro.");
  }
  const both = reviewCsvOrders(repeatedRows, existing);
  assert.equal(both.duplicates.size, 2);
  assert.equal(
    both.duplicates.get("second"),
    "Já existe na carteira e repete-se no ficheiro.",
  );
  assert.equal(
    reviewCsvOrders(
      [repeatedRows[0], { ...repeatedRows[1], include: false }],
      [],
    ).duplicates.size,
    0,
  );
});

test("revisão valida o lote completo preservando a ordem de registo no mesmo dia", () => {
  const buy = draft();
  const sell = draft({ id: "sell", type: "sell", shares: "1", pricebuy: "12" });
  const valid = reviewCsvOrders([buy, sell], []);
  assert.equal(valid.error, "");
  assert.deepEqual(
    valid.orders.map((order) => order.id),
    ["buy", "sell"],
  );
  assert.match(reviewCsvOrders([sell, buy], []).error, /venda superior/i);
  assert.match(
    reviewCsvOrders([buy, { ...sell, shares: "3" }], []).error,
    /venda superior/i,
  );

  const againstExisting = reviewCsvOrders([sell], [validateOrder(buy)]);
  assert.equal(againstExisting.error, "");
  assert.deepEqual(
    againstExisting.orders.map((order) => order.id),
    ["sell"],
  );
});
