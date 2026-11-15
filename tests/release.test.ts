import assert from "node:assert/strict";
import test from "node:test";
import { checkAccountSchema } from "../src/server/release/schema-contract";
import configureNext from "../next.config";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const environment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const contract = { version: 8, accountRpcVersion: 1, legacyRpcAliases: true };

test("o build Vercel de produção bloqueia configuração inválida e o preview não consulta a BD", async () => {
  const previous = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://remote.example";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.VERCEL_ENV = "production";
    await assert.rejects(
      () => configureNext(PHASE_PRODUCTION_BUILD),
      /Configuração pública Supabase/,
    );
    process.env.VERCEL_ENV = "preview";
    await configureNext(PHASE_PRODUCTION_BUILD);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("o preflight não consulta a BD no modo local sem configuração", async () => {
  assert.equal(
    await checkAccountSchema({}, async () => {
      throw new Error("Não deve fazer pedidos.");
    }),
    "disabled",
  );
});

test("o preflight consulta só metadados com chave pública e sem redirects", async () => {
  const result = await checkAccountSchema(
    environment,
    async (input, options) => {
      assert.equal(
        String(input),
        "https://example.supabase.co/rest/v1/rpc/get_account_schema_contract",
      );
      assert.equal(options?.redirect, "error");
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.body, "{}");
      assert.ok(options?.signal);
      assert.deepEqual(options?.headers, {
        apikey: "sb_publishable_test",
        "Content-Type": "application/json",
      });
      return Response.json(contract);
    },
  );
  assert.equal(result, "enabled");
});

test("configuração parcial, URL inválida e chaves administrativas falham antes do pedido", async () => {
  const privileged = `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  for (const invalid of [
    { ...environment, NEXT_PUBLIC_SUPABASE_URL: "" },
    { ...environment, NEXT_PUBLIC_SUPABASE_URL: "http://remote.example" },
    { ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    {
      ...environment,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private",
    },
    { ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: privileged },
  ]) {
    let called = false;
    await assert.rejects(() =>
      checkAccountSchema(invalid, async () => {
        called = true;
        return Response.json(contract);
      }),
    );
    assert.equal(called, false);
  }
});

test("contrato ausente, versão incompatível e respostas inválidas bloqueiam publicação", async () => {
  for (const response of [
    new Response("missing", { status: 404 }),
    new Response("invalid JSON"),
    Response.json(null),
    Response.json({ ...contract, version: 7 }),
    Response.json({ ...contract, accountRpcVersion: 2 }),
    Response.json({ ...contract, legacyRpcAliases: false }),
  ]) {
    await assert.rejects(
      () => checkAccountSchema(environment, async () => response),
      /Preflight da conta falhou/,
    );
  }
});

test("timeout e falhas de rede não expõem dados remotos nos erros", async () => {
  for (const name of ["TimeoutError", "TypeError"]) {
    await assert.rejects(
      () =>
        checkAccountSchema(environment, async () => {
          const error = new Error("private response and credentials");
          error.name = name;
          throw error;
        }),
      (error: Error) => {
        assert.doesNotMatch(error.message, /private|credentials/);
        return /Preflight da conta falhou/.test(error.message);
      },
    );
  }
});
