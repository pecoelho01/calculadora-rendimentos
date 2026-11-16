import assert from "node:assert/strict";
import test from "node:test";
import {
  numberValue,
  validDate,
  validateOrder,
} from "../../src/lib/validation";

const orderBase = {
  date: "2024-01-01",
  ticker: "AAPL",
  shares: 1,
  pricebuy: 10,
};

test("validateOrder apresenta mensagens exatas para data, ticker e tipo inválidos", () => {
  assert.throws(() => validateOrder({ ...orderBase, date: "2024-13-01" }), {
    message: "Data inválida: usa YYYY-MM-DD, entre 2000-01-01 e hoje.",
  });
  assert.throws(() => validateOrder({ ...orderBase, ticker: "AAPL!" }), {
    message: "Ticker inválido. Exemplo: AAPL ou SXR8.DE.",
  });
  assert.throws(() => validateOrder({ ...orderBase, type: "hold" }), {
    message: "O tipo deve ser buy ou sell.",
  });
});

test("validateOrder valida quantidades numéricas e respetivo formato", () => {
  const invalidNumber = Number.NaN;
  assert.throws(() => validateOrder({ ...orderBase, shares: invalidNumber }), {
    message: "Número inválido.",
  });
  assert.throws(() => validateOrder({ ...orderBase, shares: "1e-8" }), {
    message: "Introduz um número positivo, com ponto ou vírgula decimal.",
  });
  assert.throws(() => validateOrder({ ...orderBase, shares: 0.000000001 }), {
    message: "A quantidade aceita até 8 casas decimais (mínimo 0,00000001).",
  });
  assert.throws(() => validateOrder({ ...orderBase, shares: 1.123456789 }), {
    message: "A quantidade aceita até 8 casas decimais (mínimo 0,00000001).",
  });
  assert.equal(validateOrder({ ...orderBase, shares: 1e-8 }).shares, 1e-8);
  assert.equal(validateOrder({ ...orderBase, shares: 1e12 }).shares, 1e12);
  assert.equal(
    validateOrder({ ...orderBase, shares: "1000000000000" }).shares,
    1e12,
  );
  assert.throws(() => validateOrder({ ...orderBase, shares: 1e12 + 1 }), {
    message: "Número inválido.",
  });
  assert.throws(
    () => validateOrder({ ...orderBase, shares: "1000000000001" }),
    { message: "O número deve ser positivo e inferior ou igual a 10¹²." },
  );
});

test("numberValue troca apenas a primeira vírgula decimal", () => {
  assert.equal(numberValue("1,5"), 1.5);
  assert.throws(() => numberValue("1,2,3"), {
    message: "Introduz um número positivo, com ponto ou vírgula decimal.",
  });
  assert.throws(() => numberValue("1.000,5"), {
    message: "Introduz um número positivo, com ponto ou vírgula decimal.",
  });
});

test("validateOrder valida o preço e aceita mais de oito casas decimais", () => {
  assert.throws(() => validateOrder({ ...orderBase, pricebuy: 0 }), {
    message: "Número inválido.",
  });
  assert.throws(() => validateOrder({ ...orderBase, pricebuy: "inválido" }), {
    message: "Introduz um número positivo, com ponto ou vírgula decimal.",
  });
  assert.throws(() => validateOrder({ ...orderBase, pricebuy: 1e12 + 1 }), {
    message: "Número inválido.",
  });
  assert.equal(
    validateOrder({ ...orderBase, pricebuy: "1.123456789123" }).pricebuy,
    1.123456789123,
  );
});

test("validateOrder aplica os valores por omissão e normaliza os campos", () => {
  const preservedId = "  identificador  ";
  const longName = `  ${"a".repeat(101)}  `;
  const normalizedOrder = validateOrder({
    ...orderBase,
    id: preservedId,
    date: " 2024-01-01 ",
    ticker: " aapl ",
    type: " SELL ",
    name: longName,
  });

  assert.equal(normalizedOrder.id, preservedId);
  assert.equal(normalizedOrder.date, "2024-01-01");
  assert.equal(normalizedOrder.ticker, "AAPL");
  assert.equal(normalizedOrder.type, "sell");
  assert.equal(normalizedOrder.name, "a".repeat(100));

  const defaultTypeOrder = validateOrder(orderBase);
  assert.equal(defaultTypeOrder.type, "buy");
  assert.equal(typeof defaultTypeOrder.id, "string");
  assert.ok(defaultTypeOrder.id.length > 0);

  const emptyIdOrder = validateOrder({ ...orderBase, id: "" });
  assert.notEqual(emptyIdOrder.id, "");
});

test("validDate rejeita datas impossíveis, anteriores ao limite e formatos errados", () => {
  assert.equal(validDate("2024-13-01"), false);
  assert.equal(validDate("2024-02-30"), false);
  assert.equal(validDate("1999-12-31"), false);
  assert.equal(validDate("2000-01-01"), true);
  assert.equal(validDate("2024-1-1"), false);
  assert.equal(validDate(""), false);
  assert.equal(validDate("2024-01-01T00:00:00Z"), false);

  const todayUtc = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(`${todayUtc}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.equal(validDate(todayUtc), true);
  assert.equal(validDate(tomorrow.toISOString().slice(0, 10)), false);
});
