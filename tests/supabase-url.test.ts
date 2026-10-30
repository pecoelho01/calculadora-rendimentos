import test from "node:test";
import assert from "node:assert/strict";
import { validateSupabaseUrl } from "../src/lib/supabase-url";
import { supabaseAccountBackend, createAccountHandler } from "../src/lib/account-server";

test("Supabase exige HTTPS remoto e permite HTTP apenas em loopback", () => {
  for (const url of [
    "https://example.supabase.co", "https://custom.example:8443",
    "http://localhost:54321", "http://127.0.0.1:54321",
    "http://127.0.0.2:54321", "http://[::1]:54321",
  ]) assert.equal(validateSupabaseUrl(url), new URL(url).href, url);

  for (const url of [
    undefined, "", "inválida", "//example.supabase.co",
    "http://example.supabase.co", "http://192.168.1.2:54321",
    "http://localhost.example", "http://127.0.0.1.example",
    "http://localhost@example.com", "http://[::2]:54321",
    "https://user:password@example.com", "ftp://localhost",
    "javascript:alert(1)", "file:///etc/hosts",
  ]) assert.equal(validateSupabaseUrl(url), null, url);
});

test("API rejeita URL insegura antes de transmitir o Bearer", async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Não deve contactar a rede.");
  });
  try {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
    for (const url of ["http://remote.example", "inválida", "ftp://localhost"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.equal(supabaseAccountBackend("test-token"), null);
      const response = await createAccountHandler()(new Request("http://localhost/api/account", {
        headers: { Authorization: "Bearer test-token" },
      }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(fetchMock.mock.callCount(), 0);
    for (const url of ["https://example.supabase.co", "http://127.0.0.1:54321"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.ok(supabaseAccountBackend("test-token"));
    }
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
