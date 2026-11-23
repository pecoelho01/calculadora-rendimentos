import assert from "node:assert/strict";
import test from "node:test";
import {
  hasUnsupportedAccountPreferencesVersion,
  parseAccountPreferences,
} from "../../src/lib/account/preferences";

test("preferências Auth ausentes ou com versão desconhecida usam valores predefinidos", () => {
  assert.deepEqual(parseAccountPreferences({}), {
    version: 1,
    theme: "system",
    chartPeriod: "Máximo",
    positionsPeriod: "Máximo",
  });
  assert.deepEqual(
    parseAccountPreferences({
      rendimentosPreferences: { version: 2, theme: "dark", chartPeriod: "1A" },
    }),
    {
      version: 1,
      theme: "system",
      chartPeriod: "Máximo",
      positionsPeriod: "Máximo",
    },
  );
});

test("só uma versão inteira superior à atual fica em modo só de leitura", () => {
  for (const preferences of [
    {},
    { version: "1" },
    { version: 1.5 },
    { version: 0 },
    null,
  ]) {
    const metadata = { rendimentosPreferences: preferences };
    assert.equal(hasUnsupportedAccountPreferencesVersion(metadata), false);
    assert.deepEqual(parseAccountPreferences(metadata), {
      version: 1,
      theme: "system",
      chartPeriod: "Máximo",
      positionsPeriod: "Máximo",
    });
  }

  assert.equal(
    hasUnsupportedAccountPreferencesVersion({
      rendimentosPreferences: { version: 2 },
    }),
    true,
  );
});

test("valida cada campo independentemente", () => {
  assert.deepEqual(
    parseAccountPreferences({
      rendimentosPreferences: {
        version: 1,
        theme: "dark",
        chartPeriod: "1A",
      },
    }),
    {
      version: 1,
      theme: "dark",
      chartPeriod: "1A",
      positionsPeriod: "Máximo",
    },
  );

  assert.deepEqual(
    parseAccountPreferences({
      rendimentosPreferences: {
        version: 1,
        theme: "dark",
        chartPeriod: "bad",
        positionsPeriod: "1A",
      },
    }),
    {
      version: 1,
      theme: "dark",
      chartPeriod: "Máximo",
      positionsPeriod: "1A",
    },
  );
  assert.deepEqual(
    parseAccountPreferences({
      rendimentosPreferences: {
        version: 1,
        theme: "bad",
        chartPeriod: "1A",
        positionsPeriod: "bad",
      },
    }),
    {
      version: 1,
      theme: "system",
      chartPeriod: "1A",
      positionsPeriod: "Máximo",
    },
  );
});
