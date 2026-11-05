import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import nextTesting from "next/experimental/testing/server";
import { contentSecurityPolicy } from "../src/lib/content-security-policy";
import { config, proxy } from "../src/proxy";

test("CSP de produção restringe scripts e ligações às origens configuradas", () => {
  const policy = contentSecurityPolicy("random-nonce", {
    supabaseUrl: "https://project.supabase.co/path", captcha: true, development: false,
  });
  assert.match(policy, /script-src 'self' 'nonce-random-nonce' 'strict-dynamic' https:\/\/challenges.cloudflare.com;/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /connect-src 'self' https:\/\/project.supabase.co https:\/\/challenges.cloudflare.com;/);
  assert.match(policy, /frame-src https:\/\/challenges.cloudflare.com;/);
  assert.doesNotMatch(policy, /unsafe-eval|https:\/\/project.supabase.co\/path/);
});

test("configuração ausente ou inválida não alarga CSP; exceções de desenvolvimento são explícitas", () => {
  for (const supabaseUrl of [undefined, "https://user:password@example.com", "inválida"]) {
    const policy = contentSecurityPolicy("nonce", { supabaseUrl, captcha: false, development: false });
    assert.match(policy, /connect-src 'self';/);
    assert.match(policy, /frame-src 'none';/);
    assert.doesNotMatch(policy, /cloudflare|unsafe-eval|ws:/);
  }
  assert.match(contentSecurityPolicy("nonce", { captcha: false, development: true }), /'unsafe-eval'/);
});

test("proxy gera nonces por pedido e substitui CSP e nonce enviados pelo cliente", () => {
  const request = () => new NextRequest("https://example.test/", {
    headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src 'unsafe-inline'" },
  });
  const first = proxy(request());
  const second = proxy(request());
  const policy = first.headers.get("content-security-policy")!;
  const nonce = policy.match(/'nonce-([^']+)'/)![1];
  assert.notEqual(policy, second.headers.get("content-security-policy"));
  assert.equal(first.headers.get("x-middleware-request-x-nonce"), nonce);
  assert.equal(first.headers.get("x-middleware-request-content-security-policy"), policy);
  assert.doesNotMatch(policy, /attacker|unsafe-inline.*script-src/);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  assert.equal(first.headers.get("cdn-cache-control"), "no-store");
});

test("CSP cobre também documentos 404 sem interferir nas APIs e nos modelos CSV", () => {
  for (const url of ["/", "/conta", "/apiculture", "/missing.csv", "/nested/icon.svg"]) {
    assert.equal(nextTesting.unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url);
  }
  for (const url of ["/api", "/api/account", "/_next/static/chunk.js", "/_next/image", "/icon.svg", "/modelo_site_ativos.csv", "/sample_combo.csv"]) {
    assert.equal(nextTesting.unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url);
  }
});
