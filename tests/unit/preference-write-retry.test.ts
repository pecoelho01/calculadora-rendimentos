import assert from "node:assert/strict";
import test from "node:test";
import { retryBusyPreferenceWrite } from "../../src/lib/account/preference-write-retry";

test("para o retry busy se a conta ou o modo deixam de estar ativos", async () => {
  let active = true;
  let attempts = 0;
  const delays: number[] = [];
  const busyError = new Error("busy");

  const result = await retryBusyPreferenceWrite({
    attempt: async () => {
      attempts++;
      throw busyError;
    },
    isActive: () => active,
    isBusy: (error) => error === busyError,
    wait: async (delay) => {
      delays.push(delay);
      active = false;
    },
    delays: [40, 100, 200],
  });

  assert.equal(result, null);
  assert.equal(attempts, 1);
  assert.deepEqual(delays, [40]);
});

test("repete apenas erros busy e não repete falhas reais", async () => {
  let attempts = 0;
  let waits = 0;
  const failure = new Error("falha real");

  await assert.rejects(
    retryBusyPreferenceWrite({
      attempt: async () => {
        attempts++;
        throw failure;
      },
      isActive: () => true,
      isBusy: (error) => error instanceof Error && error.message === "busy",
      wait: async () => {
        waits++;
      },
      delays: [40, 100, 200],
    }),
    failure,
  );

  assert.equal(attempts, 1);
  assert.equal(waits, 0);
});
