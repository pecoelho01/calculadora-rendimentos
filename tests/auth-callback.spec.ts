import { test, expect } from "@playwright/test";

const secret = "synthetic-callback-secret";
const callback = `/?preservar=1&access_token=${secret}&refresh_token=${secret}&code=discarded-code&recovery=1#access_token=fragment-secret`;

test("rejeitar tokens por HTTP sem servir a página e preservar códigos PKCE", async ({ request }) => {
  const response = await request.get(callback, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const target = new URL(response.headers().location, response.url());
  expect(target.pathname + target.search + target.hash).toBe("/?preservar=1#error=invalid_callback");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(await response.text()).not.toContain(secret);
  const pkce = await request.get("/?code=valid-code&recovery=1", { maxRedirects: 0 });
  expect(pkce.status()).toBe(200);
  expect(pkce.headers().location).toBeUndefined();
  const api = await request.get("/api/account?access_token=synthetic", { maxRedirects: 0 });
  expect(api.status()).toBe(401);
  expect(api.headers().location).toBeUndefined();
});

test("limpar a query mesmo sem JavaScript e substituir o fragmento original", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto(`http://127.0.0.1:3100${callback}`);
    expect(response?.status()).toBe(200);
    const url = new URL(page.url());
    expect(url.search).toBe("?preservar=1");
    expect(url.hash).toBe("#error=invalid_callback");
    expect(await page.content()).not.toContain(secret);
  } finally { await context.close(); }
});

test("limpar antes da hidratação e rejeitar sem pedidos Auth", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let authRequests = 0;
  await page.route("**/auth/v1/**", (route) => { authRequests++; return route.abort(); });
  await page.route("**/_next/**/*.js*", async (route) => { await gate; await route.continue(); });
  try {
    await page.goto(callback, { waitUntil: "commit" });
    expect(new URL(page.url()).search).toBe("?preservar=1");
    expect(new URL(page.url()).hash).toBe("#error=invalid_callback");
    release();
    await expect(page.getByText(/Não foi possível validar esta ligação/)).toBeVisible();
    expect(new URL(page.url()).search).toBe("?preservar=1");
    expect(new URL(page.url()).hash).toBe("");
    expect(authRequests).toBe(0);
    await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
  } finally { release(); }
});
