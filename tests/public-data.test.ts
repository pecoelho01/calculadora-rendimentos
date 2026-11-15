import test from "node:test";
import assert from "node:assert/strict";
import { readPublicText } from "../src/lib/public-data";

test("ler UTF-8 repartido entre chunks e aceitar exatamente o limite em bytes", async () => {
  const encoded = new TextEncoder().encode("A€😀");
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.slice(0, 2));
        controller.enqueue(encoded.slice(2, 5));
        controller.enqueue(encoded.slice(5));
        controller.close();
      },
    }),
  );

  assert.equal(await readPublicText(response, 8), "A€😀");
  assert.equal(response.body?.locked, false);
});

test("limitar bytes e cancelar mesmo quando a quantidade de caracteres caberia", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("€€"));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );

  await assert.rejects(
    readPublicText(response, 5),
    /Resposta demasiado grande/,
  );
  assert.equal(cancelled, true);
  assert.equal(response.body?.locked, false);
});
