import { test } from "node:test";
import assert from "node:assert/strict";
import { csvDuplicateKey, parseCsv, parseCsvDraft } from "../src/lib/csv";
import { MAX_ORDERS, validateOrder } from "../src/lib/validation";

const header = "date,ticker,name,pricebuy,shares,type\n";
test("revisão CSV preserva campos inválidos para correção sem relaxar parseCsv", () => {
  const text = header + "data-inválida,TEST,Teste,0,1,unknown";
  const [draft] = parseCsvDraft(text);
  assert.equal(draft.date, "data-inválida");
  assert.equal(draft.pricebuy, "0");
  assert.equal(draft.type, "unknown");
  assert.throws(() => parseCsv(text), /Linha 2: Data inválida/);
  assert.equal(validateOrder({ ...draft, date: "2024-01-01", pricebuy: "12,50", type: "buy" }).pricebuy, 12.5);
});
test("revisão CSV conserva a ordem e os campos opcionais com IDs distintos", () => {
  const drafts = parseCsvDraft('date;ticker;pricebuy;shares;type\n2024-01-01;TEST;10,5;2;\n2024-01-01;TEST;11;1;sell');
  assert.equal(drafts[0].name, "");
  assert.equal(drafts[0].type, "buy");
  assert.equal(drafts[0].pricebuy, "10,5");
  assert.equal(drafts[1].type, "sell");
  assert.notEqual(drafts[0].id, drafts[1].id);
});
test("revisão CSV rejeita estrutura inválida e ficheiros acima do limite", () => {
  assert.throws(() => parseCsvDraft('date,ticker,pricebuy,shares\n2024-01-01,TEST,"10,2'), /Aspas por fechar/);
  assert.throws(() => parseCsvDraft('date,ticker,pricebuy,pricebuy,shares\n'), /Cabeçalhos duplicados/);
  assert.throws(() => parseCsvDraft(header + "2024-01-01,TEST,T,1,1,buy\n".repeat(MAX_ORDERS + 1)), /Máximo de 5000/);
});
test("possíveis duplicados comparam valores normalizados ignorando nome e ID", () => {
  const a = validateOrder({ date: "2024-01-01", ticker: " test ", name: "Original", pricebuy: "10,50", shares: "2.0" });
  const b = validateOrder({ date: "2024-01-01", ticker: "TEST", name: "Outro nome", pricebuy: 10.5, shares: 2 });
  assert.equal(csvDuplicateKey(a), csvDuplicateKey(b));
  for (const changed of [{ date: "2024-01-02" }, { ticker: "OTHER" }, { type: "sell" as const }, { pricebuy: 11 }, { shares: 1 }]) {
    assert.notEqual(csvDuplicateKey(a), csvDuplicateKey({ ...b, ...changed }));
  }
});
