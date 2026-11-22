import assert from "node:assert/strict";
import test from "node:test";
import { parseChartPeriod } from "../../src/lib/chart-period";

test("parseChartPeriod aceita os períodos disponíveis", () => {
  assert.equal(parseChartPeriod("1A"), "1A");
  assert.equal(parseChartPeriod("1D"), "1D");
  assert.equal(parseChartPeriod("Máximo"), "Máximo");
});

test("parseChartPeriod usa Máximo para valores ausentes ou inválidos", () => {
  assert.equal(parseChartPeriod(null), "Máximo");
  assert.equal(parseChartPeriod(undefined), "Máximo");
  assert.equal(parseChartPeriod("inválido"), "Máximo");
  assert.equal(parseChartPeriod("max"), "Máximo");
});
