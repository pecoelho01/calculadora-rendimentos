import assert from "node:assert/strict";
import test from "node:test";
import { normalizeIntraday } from "../src/lib/market-intraday";

const start = new Date("2026-10-30T00:00:00Z");
const end = new Date("2026-10-30T15:00:00Z");

test("intradiário mantém horas UTC, ordena e remove duplicados sem aceitar observações futuras", () => {
  const points = normalizeIntraday([
    { date: new Date("2026-10-30T14:35:00Z"), close: 103 },
    { date: new Date("2026-10-30T14:30:00Z"), close: 100 },
    { date: new Date("2026-10-30T14:35:00Z"), close: 102 },
    { date: new Date("2026-10-30T09:30:00-04:00"), close: 99 },
    { date: new Date("2026-10-30T15:05:00Z"), close: 999 },
    { date: new Date("2026-10-29T23:55:00Z"), close: 999 },
    { date: new Date(NaN), close: 999 },
  ], start, end);
  assert.deepEqual(points, [
    { date: "2026-10-30T13:30:00.000Z", close: 99 },
    { date: "2026-10-30T14:30:00.000Z", close: 100 },
    { date: "2026-10-30T14:35:00.000Z", close: 102 },
  ]);
});

test("intradiário preserva preço zero e lacunas em vez de inventar preços", () => {
  const points = normalizeIntraday([
    { date: new Date("2026-10-30T10:00:00Z"), close: 0 },
    { date: new Date("2026-10-30T10:05:00Z"), close: null },
    { date: new Date("2026-10-30T10:10:00Z"), close: -1 },
    { date: new Date("2026-10-30T10:15:00Z"), close: Infinity },
    { date: new Date("2026-10-30T10:20:00Z") },
  ], start, end);
  assert.deepEqual(points.map(point => point.close), [0, null, null, null, null]);
  assert.deepEqual(normalizeIntraday([], start, end), []);
  assert.deepEqual(normalizeIntraday([], end, start), []);
});
