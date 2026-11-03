import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("rejeitar cada campo de token antes de servir a página, incluindo valores vazios", () => {
  for (const field of ["access_token", "refresh_token", "token_type", "expires_in", "expires_at", "provider_token", "provider_refresh_token"]) {
    for (const value of ["", "synthetic-secret"]) {
      const url = new URL("https://example.test/?preservar=1&preservar=2&code=valid-code&recovery=1&type=recovery&sb_flow_id=flow&error=secret&error_code=secret&error_description=secret#access_token=fragment-secret");
      url.searchParams.append(field, value);
      url.searchParams.append(field, value);
      const response = proxy(new NextRequest(url));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "https://example.test/?preservar=1&preservar=2#error=invalid_callback");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("cdn-cache-control"), "no-store");
      assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("set-cookie"), null);
    }
  }
});

test("reconhecer nomes percent-encoded sem alterar parâmetros normais", () => {
  const response = proxy(new NextRequest("https://example.test/?%61ccess_token=secret&%72efresh_token=secret&nome=Jo%C3%A3o&nome=Ana"));
  const target = new URL(response.headers.get("location")!);
  assert.equal(response.status, 303);
  assert.deepEqual(target.searchParams.getAll("nome"), ["João", "Ana"]);
  assert.equal(target.searchParams.has("access_token"), false);
  assert.equal(target.searchParams.has("refresh_token"), false);
});

test("preservar callbacks PKCE, parâmetros normais e fragmentos para o navegador", () => {
  for (const suffix of ["", "?preservar=1", "?code=valid-code&recovery=1&sb_flow_id=flow", "#access_token=fragment-secret", "?error=invalid_callback"]) {
    const response = proxy(new NextRequest(`https://example.test/${suffix}`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});
