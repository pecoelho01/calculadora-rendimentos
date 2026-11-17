import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCsv, parseCsvDraft } from "../../src/lib/csv/csv";

test("deteta ponto e vírgula com cabeçalhos em maiúsculas e vírgula decimal", () => {
  const standard = parseCsvDraft(
    "Date;Ticker;PriceBuy;Shares\n2024-01-01;TEST;10,5;2",
  );
  const typed = parseCsvDraft(
    "DATE;TICKER;PRICEBUY;SHARES;TYPE\n2024-01-01;TEST;10,5;2;buy",
  );

  assert.equal(standard[0].pricebuy, "10,5");
  assert.equal(typed[0].type, "buy");
  assert.equal(
    parseCsv("Date;Ticker;PriceBuy;Shares\n2024-01-01;TEST;10,5;2")[0].pricebuy,
    10.5,
  );
});

test("aceita delimitador após retorno isolado dentro do cabeçalho entre aspas", () => {
  const drafts = parseCsvDraft(
    '"pricebuy\rmetadata";date;ticker;pricebuy;shares\r' +
      "ignored;2024-01-01;TEST;10;1",
  );

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].ticker, "TEST");
});

test("preserva números de linha física com linhas vazias, aspas multilinha e terminadores mistos", () => {
  const text =
    "date,ticker,name,pricebuy,shares\r\n" +
    "\r\n" +
    '2024-01-01,TEST,"nome\ncom quebra",10,1\r' +
    "\r\n" +
    "data-inválida,TEST,Nome,10,1";

  const drafts = parseCsvDraft(text);
  assert.deepEqual(
    drafts.map((draft) => draft.line),
    [3, 6],
  );
  assert.equal(drafts[1].date, "data-inválida");
  assert.throws(() => parseCsv(text), /Linha 6: Data inválida/);
  assert.throws(
    () =>
      parseCsvDraft(
        text.replace(
          "data-inválida,TEST,Nome,10,1",
          "data-inválida,TEST,Nome,10,1,extra",
        ),
      ),
    /Linha 6: Número de colunas inválido/,
  );
});

test("usa a linha física do fixture e comunica erros na primeira transação", () => {
  const fixture = readFileSync("tests/fixtures/csv/sample_combo.csv", "utf8");
  assert.equal(parseCsv(fixture).length, 9);
  assert.equal(parseCsvDraft(fixture)[0].line, 3);

  const invalidFixture = fixture.replace(
    ",,2024-01-10,SXR8.DE,iShares Core S&P 500,60,5,buy",
    ",,2024-01-10,SXR8.DE,iShares Core S&P 500,inválido,5,buy",
  );
  assert.throws(() => parseCsv(invalidFixture), /Linha 3: Introduz um número/);
  assert.equal(parseCsvDraft(invalidFixture)[0].line, 3);
});
