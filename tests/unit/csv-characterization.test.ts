import assert from "node:assert/strict";
import { test } from "node:test";
import { exportCsv, parseCsv, parseCsvDraft } from "../../src/lib/csv/csv";
import type { Order } from "../../src/lib/types";

function assertGeneratedIds(orders: Order[]): void {
  const ids = orders.map((order) => order.id);

  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length);
}

test("importa BOM, CRLF, separador ponto e vírgula e decimais entre aspas", () => {
  const csv =
    "\uFEFFdate;ticker;name;pricebuy;shares;type\r\n" +
    '2024-01-01;AAPL;Empresa;"12,5";"0,5";buy\r\n' +
    "2024-01-02;MSFT;Outra;20;2;sell";

  const drafts = parseCsvDraft(csv);
  const orders = parseCsv(csv);

  assert.deepEqual(
    drafts.map(({ date, ticker, name, pricebuy, shares, type }) => ({
      date,
      ticker,
      name,
      pricebuy,
      shares,
      type,
    })),
    [
      {
        date: "2024-01-01",
        ticker: "AAPL",
        name: "Empresa",
        pricebuy: "12,5",
        shares: "0,5",
        type: "buy",
      },
      {
        date: "2024-01-02",
        ticker: "MSFT",
        name: "Outra",
        pricebuy: "20",
        shares: "2",
        type: "sell",
      },
    ],
  );
  assert.deepEqual(
    orders.map(({ date, ticker, name, pricebuy, shares, type }) => ({
      date,
      ticker,
      name,
      pricebuy,
      shares,
      type,
    })),
    [
      {
        date: "2024-01-01",
        ticker: "AAPL",
        name: "Empresa",
        pricebuy: 12.5,
        shares: 0.5,
        type: "buy",
      },
      {
        date: "2024-01-02",
        ticker: "MSFT",
        name: "Outra",
        pricebuy: 20,
        shares: 2,
        type: "sell",
      },
    ],
  );
  assertGeneratedIds(orders);
});

test("interpreta aspas escapadas e mantém os dados numa ida e volta CSV", () => {
  const input =
    "date,ticker,name,pricebuy,shares,type\n" +
    '2024-01-01,AAPL,"Empresa ""X"" S.A.",12.5,2,buy';
  const [parsedOrder] = parseCsv(input);

  assert.equal(parsedOrder.name, 'Empresa "X" S.A.');

  const exportedCsv = exportCsv([parsedOrder]);
  const [roundTrippedOrder] = parseCsv(exportedCsv);

  assert.deepEqual(
    {
      date: roundTrippedOrder.date,
      ticker: roundTrippedOrder.ticker,
      name: roundTrippedOrder.name,
      pricebuy: roundTrippedOrder.pricebuy,
      shares: roundTrippedOrder.shares,
      type: roundTrippedOrder.type,
    },
    {
      date: "2024-01-01",
      ticker: "AAPL",
      name: 'Empresa "X" S.A.',
      pricebuy: 12.5,
      shares: 2,
      type: "buy",
    },
  );
  assertGeneratedIds([parsedOrder, roundTrippedOrder]);
  assert.notEqual(parsedOrder.id, roundTrippedOrder.id);
});

test("rejeita espaço antes da aspa de abertura com mensagem exata", () => {
  const csv = 'date,ticker,pricebuy,shares\n2024-01-01, "AAPL",10,1';

  assert.throws(() => parseCsv(csv), {
    message: "Aspas inválidas no CSV.",
  });
});

test("aceita retorno de carro isolado como separador de linhas", () => {
  const csv =
    "date,ticker,pricebuy,shares\r" +
    "2024-01-01,AAPL,10,1\r" +
    "2024-01-02,MSFT,20,2";

  assert.deepEqual(
    parseCsv(csv).map(({ date, ticker, pricebuy, shares }) => ({
      date,
      ticker,
      pricebuy,
      shares,
    })),
    [
      { date: "2024-01-01", ticker: "AAPL", pricebuy: 10, shares: 1 },
      { date: "2024-01-02", ticker: "MSFT", pricebuy: 20, shares: 2 },
    ],
  );
});

test("mantém mensagens estáveis para erros estruturais CSV", () => {
  assert.throws(
    () => parseCsvDraft('date,ticker,pricebuy,shares\n2024-01-01,AAPL,"10'),
    { message: "Aspas por fechar no CSV." },
  );
  assert.throws(() => parseCsvDraft("date,ticker,shares\n2024-01-01,AAPL,1"), {
    message: "Colunas necessárias: date, ticker, pricebuy, shares.",
  });
  assert.throws(() => parseCsvDraft("date,ticker,pricebuy,pricebuy,shares\n"), {
    message: "Cabeçalhos duplicados.",
  });
  assert.throws(() => parseCsvDraft("date,ticker,pricebuy,shares\n"), {
    message: "O CSV não contém transações.",
  });
  assert.throws(
    () =>
      parseCsvDraft("date,ticker,pricebuy,shares\n2024-01-01,AAPL,10,1,extra"),
    {
      message:
        "Linha 2: Número de colunas inválido; coloca decimais com vírgula entre aspas.",
    },
  );
});
