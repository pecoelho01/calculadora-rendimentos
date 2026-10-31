import { test, expect, type Page } from "@playwright/test";
import type { Portfolio } from "../src/lib/types";
import type { AccountSnapshot, AccountWrite } from "../src/lib/account";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(!process.env.TEST_ACCOUNT_AUTH, "Requer build com configuração Supabase fictícia para mocks de Auth.");

const storageKey = "rendimentos.portfolios.v1";
const entryKey = "rendimentos.entry.local.v1";
const authKey = "sb-rendimentos-test-auth-token";
const localPortfolio: Portfolio = { id: "local-original", name: "Carteira do navegador", currency: "EUR", orders: [] };
const localJson = JSON.stringify({ version: 1, portfolios: [localPortfolio] });
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
function user(id = userA) {
  return {
    id, email: id === userA ? "ana@example.test" : "bruno@example.test",
    aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {}, identities: [], created_at: "2024-01-01T00:00:00Z", email_confirmed_at: "2024-01-01T00:00:00Z",
  };
}
function session(id = userA, lifetime = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetime;
  const base64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${base64({ alg: "HS256", typ: "JWT" })}.${base64({ sub: id, aud: "authenticated", role: "authenticated", exp: expiresAt })}.test-signature`,
    refresh_token: `mock-refresh-${id}`, token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user: user(id),
  };
}
function remote(name = "Carteira da Ana", id = "remote-a"): AccountSnapshot {
  return { version: 1, portfolios: [{ portfolio: { id, name, currency: "EUR", orders: [] }, revision: 3 }] };
}
async function setup(page: Page, signedIn: boolean | "expired" = false) {
  const accounts: Record<string, AccountSnapshot> = { [userA]: remote(), [userB]: remote("Carteira do Bruno", "remote-b") };
  const requests: AccountWrite[] = [];
  const authRequests: { path: string; body: Record<string, unknown> }[] = [];
  const receipts = new Set<string>();
  const state = { failNextWrite: 0, delayNextWrite: false, releaseWrite: () => {}, delayRefresh: false, releaseRefresh: () => {}, failRefresh: false, accountReads: 0, marketRequests: 0, accounts, requests, authRequests };
  await page.addInitScript(({ key, json, authKey, authSession }) => {
    localStorage.setItem(key, json);
    if (authSession) localStorage.setItem(authKey, JSON.stringify(authSession));
  }, { key: storageKey, json: localJson, authKey, authSession: signedIn ? session(userA, signedIn === "expired" ? -3600 : 3600) : null });
  await page.route("**/api/market?*", (route) => {
    state.marketRequests++;
    return route.fulfill({ json: { assets: {} } });
  });
  await page.route("https://rendimentos-test.supabase.co/auth/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" } });
      return;
    }
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as Record<string, unknown> | null;
    authRequests.push({ path, body: body ?? {} });
    if (path.endsWith("/token") && new URL(request.url()).searchParams.get("grant_type") === "refresh_token") {
      if (state.delayRefresh) await new Promise<void>((resolve) => { state.releaseRefresh = resolve; });
      if (state.failRefresh) {
        await route.fulfill({ status: 400, json: { code: "refresh_token_not_found", message: "Invalid Refresh Token" }, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
    }
    let json: unknown = {};
    if (path.endsWith("/token")) json = session(body?.email === "bruno@example.test" ? userB : userA);
    else if (path.endsWith("/signup")) json = user();
    else if (path.endsWith("/user")) json = user();
    await route.fulfill({ json, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.route("**/api/account", async (route) => {
    const request = route.request();
    const jwt = request.headers().authorization?.slice(7).split(".")[1];
    const id: string = jwt ? JSON.parse(Buffer.from(jwt, "base64url").toString()).sub : "";
    if (!accounts[id]) { await route.fulfill({ status: 401, json: { error: "Sessão inválida" } }); return; }
    if (request.method() === "GET") state.accountReads++;
    if (request.method() === "POST") {
      const write = request.postDataJSON() as AccountWrite;
      requests.push(write);
      if (state.delayNextWrite) {
        state.delayNextWrite = false;
        await new Promise<void>((resolve) => { state.releaseWrite = resolve; });
      }
      if (state.failNextWrite) {
        const status = state.failNextWrite;
        state.failNextWrite = 0;
        await route.fulfill({ status, json: { error: "Falha controlada" } });
        return;
      }
      const snapshot = structuredClone(accounts[id]);
      if (write.migration) {
        const receipt = `${id}:${write.migration.key}`;
        if (!receipts.has(receipt)) {
          snapshot.portfolios.push(...write.migration.portfolios.map((portfolio) => ({ portfolio: { ...portfolio, id: `import-${portfolio.id}` }, revision: 1 })));
          receipts.add(receipt);
        }
      } else {
        for (const change of write.changes) {
          const existing = snapshot.portfolios.find((record) => record.portfolio.id === change.id);
          if ((existing?.revision ?? null) !== change.expectedRevision) {
            await route.fulfill({ status: 409, json: { error: "Conflito" } }); return;
          }
        }
        for (const change of write.changes) {
          const index = snapshot.portfolios.findIndex((record) => record.portfolio.id === change.id);
          if (!change.portfolio) snapshot.portfolios.splice(index, 1);
          else if (index >= 0) snapshot.portfolios[index] = { portfolio: change.portfolio, revision: snapshot.portfolios[index].revision + 1 };
          else snapshot.portfolios.push({ portfolio: change.portfolio, revision: 1 });
        }
      }
      accounts[id] = snapshot;
    }
    await route.fulfill({ json: accounts[id], headers: { "Cache-Control": "no-store" } });
  });
  return state;
}
async function login(page: Page, email = "ana@example.test") {
  await page.getByRole("button", { name: "Iniciar sessão", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Iniciar sessão", exact: true });
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Palavra-passe", { exact: true }).fill("password-test");
  await dialog.getByRole("button", { name: "Iniciar sessão", exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function rename(page: Page, oldName: string, nextName: string) {
  await page.getByRole("button", { name: `Renomear carteira ${oldName}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Renomear carteira", exact: true });
  await dialog.getByLabel("Nome da carteira").fill(nextName);
  await dialog.getByRole("button", { name: "Guardar nome", exact: true }).click();
}
async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("iniciar sessão, alternar modo, sair e trocar utilizador preserva isolamento local", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await login(page);
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Usar modo local", exact: true }).click();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir carteiras da conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), entryKey)).toBeNull();
  await login(page, "bruno@example.test");
  await expect(page.getByRole("heading", { name: "Carteira do Bruno", exact: true })).toBeVisible();
  await expect(page.getByText("Carteira da Ana", { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

test("gravar espera pela confirmação da conta, incrementa revisão e não grava localmente", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  state.delayNextWrite = true;
  await rename(page, "Carteira da Ana", "Conta atualizada");
  await expect(page.getByText("A guardar…", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Renomear carteira" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].changes[0].expectedRevision).toBe(3);
  state.releaseWrite();
  await expect(page.getByRole("dialog", { name: "Renomear carteira" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Conta atualizada", exact: true })).toBeVisible();
  expect(state.accounts[userA].portfolios[0].revision).toBe(4);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Conta atualizada", exact: true })).toBeVisible();
  await assertNoOverflow(page);
});

test("conflito entre dispositivos preserva dados e exige recarga explícita", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  state.accounts[userA].portfolios[0] = { portfolio: { ...state.accounts[userA].portfolios[0].portfolio, name: "Alterada noutro dispositivo" }, revision: 4 };
  await rename(page, "Carteira da Ana", "Alteração antiga");
  await expect(page.getByText(/Esta carteira foi alterada noutro dispositivo/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Renomear carteira" })).toBeVisible();
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe("Alterada noutro dispositivo");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Recarregar dados da conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alterada noutro dispositivo", exact: true })).toBeVisible();
  await rename(page, "Alterada noutro dispositivo", "Nova tentativa");
  await expect(page.getByRole("heading", { name: "Nova tentativa", exact: true })).toBeVisible();
  expect(state.requests[1].changes[0].expectedRevision).toBe(4);
});

test("falha de gravação mantém diálogo e valores confirmados", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  state.failNextWrite = 503;
  await rename(page, "Carteira da Ana", "Não guardada");
  await expect(page.getByText("Erro ao guardar ou carregar", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Nome da carteira")).toHaveValue("Não guardada");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  expect(state.accounts[userA].portfolios[0].revision).toBe(3);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
});

test("migração local explícita é repetível e conserva dados dos dois modos", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Copiar carteiras locais para a conta", exact: true }).click();
  expect(state.requests).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Copiar carteiras locais para a conta", exact: true }).click();
  await expect(page.locator(".portfolio-row")).toHaveCount(2);
  expect(state.requests[0].changes).toEqual([]);
  expect(state.requests[0].migration?.key).toMatch(/^[a-f0-9]{64}$/);
  expect(state.requests[0].migration?.portfolios).toEqual([localPortfolio]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Copiar carteiras locais para a conta", exact: true }).click();
  await expect.poll(() => state.requests.length).toBe(2);
  await expect(page.getByText(/Carteiras locais copiadas para a conta/)).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(2);
  expect(state.requests[1].migration?.key).toBe(state.requests[0].migration?.key);
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe("Carteira da Ana");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
  await assertNoOverflow(page);
});

test("registo pede confirmação por email e recuperação envia ligação", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Criar conta", exact: true });
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog.getByLabel("Palavra-passe", { exact: true }).fill("password-test");
  await dialog.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByText(/Consulta o teu email para confirmar a conta/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "Iniciar sessão", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Esqueci a palavra-passe", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Recuperar acesso", exact: true });
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog.getByRole("button", { name: "Enviar ligação", exact: true }).click();
  await expect(dialog.getByText(/Se existir uma conta com este email/)).toBeVisible();
  expect(state.authRequests.some((request) => request.path.endsWith("/recover") && request.body.email === "ana@example.test")).toBe(true);
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

test("sessão de recuperação permite definir palavra-passe após abrir a ligação", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/?recovery=1");
  const dialog = page.getByRole("dialog", { name: "Definir nova palavra-passe", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nova palavra-passe", { exact: true }).fill("new-password-test");
  await dialog.getByRole("button", { name: "Guardar palavra-passe", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Palavra-passe atualizada.", { exact: true })).toBeVisible();
  expect(state.authRequests.some((request) => request.path.endsWith("/user") && request.body.password === "new-password-test")).toBe(true);
  expect(new URL(page.url()).searchParams.has("recovery")).toBe(false);
});

test("resposta pendente da conta não volta a apresentar dados depois de sair", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  state.delayNextWrite = true;
  await rename(page, "Carteira da Ana", "Resposta antiga");
  await expect.poll(() => state.requests.length).toBe(1);
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  state.releaseWrite();
  await expect.poll(() => state.accounts[userA].portfolios[0].portfolio.name).toBe("Resposta antiga");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await expect(page.getByText("Resposta antiga", { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
});

test("ligação de recuperação Auth abre o formulário de palavra-passe", async ({ page }) => {
  const state = await setup(page);
  const authSession = session();
  const hash = new URLSearchParams({
    access_token: authSession.access_token,
    refresh_token: authSession.refresh_token,
    expires_in: "3600",
    token_type: "bearer",
    type: "recovery",
  });
  await page.goto(`/?recovery=1#${hash}`);
  const dialog = page.getByRole("dialog", { name: "Definir nova palavra-passe", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nova palavra-passe", { exact: true }).fill("recovered-password-test");
  await dialog.getByRole("button", { name: "Guardar palavra-passe", exact: true }).click();
  await expect(page.getByText("Palavra-passe atualizada.", { exact: true })).toBeVisible();
  expect(state.authRequests.some((request) => request.path.endsWith("/user") && request.body.password === "recovered-password-test")).toBe(true);
});

test("conta vazia permite criar a primeira carteira sem copiar dados locais", async ({ page }, testInfo) => {
  const state = await setup(page, true);
  state.accounts[userA] = { version: 1, portfolios: [] };
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Copiar carteiras locais para a conta", exact: true })).toBeEnabled();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar transação", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova transação", exact: true })).toBeDisabled();
  await assertNoOverflow(page);
  const noticeText = await page.locator(".account-empty-notice > span").boundingBox();
  const noticeButton = await page.locator(".account-empty-notice .button").boundingBox();
  expect(noticeText && noticeButton).toBeTruthy();
  expect(noticeText!.x + noticeText!.width <= noticeButton!.x || noticeText!.y + noticeText!.height <= noticeButton!.y).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("conta-vazia.png"), fullPage: true });
  await page.locator(".empty-state").getByRole("button", { name: "Criar carteira", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nova transação", exact: true })).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Criar carteira", exact: true });
  await dialog.getByLabel("Nome da carteira").fill("Primeira carteira na conta");
  await dialog.getByRole("button", { name: "Criar carteira", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Primeira carteira na conta", exact: true })).toBeVisible();
  expect(state.requests[0].changes).toHaveLength(1);
  expect(state.requests[0].changes[0].expectedRevision).toBe(null);
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  await page.getByRole("button", { name: "Adicionar transação", exact: true }).click();
  const orderDialog = page.getByRole("dialog", { name: "Nova transação", exact: true });
  await expect(orderDialog).toBeVisible();
  await orderDialog.getByLabel("Ticker Yahoo").fill("TEST");
  await orderDialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await orderDialog.getByLabel("Preço por unidade").fill("100");
  await orderDialog.getByRole("button", { name: "Guardar transação", exact: true }).click();
  await expect(orderDialog).toBeHidden();
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(1);
  expect(state.accounts[userA].portfolios[0].revision).toBe(2);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
  await assertNoOverflow(page);
});

test("eliminar a última carteira da conta mantém a conta vazia após confirmação e recarga", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  state.delayNextWrite = true;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar carteira", exact: true }).click();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].changes).toEqual([
    { id: "remote-a", portfolio: null, expectedRevision: 3 },
  ]);
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  state.releaseWrite();
  await expect(page.getByText("A tua conta ainda não tem carteiras.", { exact: false })).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  expect(state.accounts[userA].portfolios).toEqual([]);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
  await page.reload();
  await expect(page.getByRole("button", { name: "Criar a primeira carteira", exact: true })).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar transação", exact: true })).toHaveCount(0);
  await page.locator(".empty-state").getByRole("button", { name: "Criar carteira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Criar carteira", exact: true });
  await dialog.getByLabel("Nome da carteira").fill("Nova carteira após eliminação");
  await dialog.getByRole("button", { name: "Criar carteira", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Nova carteira após eliminação", exact: true })).toBeVisible();
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  await assertNoOverflow(page);
});

test("CSV remoto é atómico, conserva ordem no mesmo dia e só envia tickers/data ao mercado", async ({ page }) => {
  const state = await setup(page, true);
  const marketRequests: URL[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/market?")) marketRequests.push(new URL(request.url())); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  const csv = "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-01,TEST,Teste,120,3,sell";
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "ordens.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect.poll(() => state.accounts[userA].portfolios[0].portfolio.orders.length).toBe(2);
  expect(state.accounts[userA].portfolios[0].portfolio.orders.map((order) => order.type)).toEqual(["buy", "sell"]);
  expect(state.requests[0].changes[0].expectedRevision).toBe(3);
  await expect.poll(() => marketRequests.length).toBeGreaterThan(0);
  expect([...marketRequests[0].searchParams.keys()].sort()).toEqual(["start", "tickers"]);
  expect(marketRequests[0].searchParams.get("tickers")).toBe("TEST");
  const invalid = "date,ticker,name,pricebuy,shares,type\n2024-01-02,TEST,Teste,120,8,sell\n2024-01-03,TEST,Teste,120,1,buy";
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "venda-invalida.csv", mimeType: "text/csv", buffer: Buffer.from(invalid) });
  await expect(page.getByText(/venda superior à posição disponível/)).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(2);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
});

test("restauro JSON na conta valida todas as carteiras antes do lote com revisões", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  const restored: Portfolio = { id: "backup-one", name: "Carteira restaurada", currency: "USD", orders: [] };
  const invalid = JSON.stringify({ version: 1, portfolios: [restored, { ...restored, id: "backup-two", currency: "INVALID" }] });
  await page.getByLabel("Restaurar cópia de segurança", { exact: true }).setInputFiles({ name: "invalido.json", mimeType: "application/json", buffer: Buffer.from(invalid) });
  await expect(page.getByText("Carteira inválida.", { exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(0);
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe("Carteira da Ana");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Restaurar cópia de segurança", { exact: true }).setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 1, portfolios: [restored] })) });
  await expect(page.getByRole("heading", { name: restored.name, exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0].changes).toEqual(expect.arrayContaining([
    { id: "remote-a", portfolio: null, expectedRevision: 3 },
    { id: restored.id, portfolio: restored, expectedRevision: null },
  ]));
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
});

test("entrada exige escolha, permite teclado e conserva o modo local só na mesma aba", async ({ page, context }, testInfo) => {
  const state = await setup(page);
  await page.addInitScript(() => {
    const observed = window as unknown as Window & { portfolioReads: number };
    observed.portfolioReads = 0;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === "rendimentos.portfolios.v1") observed.portfolioReads++;
      return original.call(this, key);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sessão", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar conta", exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Window & { portfolioReads: number }).portfolioReads)).toBe(0);
  expect(state.accountReads).toBe(0);
  expect(state.marketRequests).toBe(0);
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("entrada.png"), fullPage: true });
  const continueLocal = page.getByRole("button", { name: "Continuar sem sessão", exact: true });
  await continueLocal.focus();
  await expect(continueLocal).toBeFocused();
  await continueLocal.press("Enter");
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), entryKey)).toBe("1");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
  await page.reload();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(other.locator(".metrics")).toHaveCount(0);
  await other.close();
});

test("restaurar uma sessão válida aguarda Auth sem abrir carteiras locais", async ({ page }) => {
  const state = await setup(page, "expired");
  state.delayRefresh = true;
  await page.addInitScript(() => {
    const observed = window as unknown as Window & { portfolioReads: number };
    observed.portfolioReads = 0;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (this === localStorage && key === "rendimentos.portfolios.v1") observed.portfolioReads++;
      return original.call(this, key);
    };
  });
  await page.goto("/");
  await expect.poll(() => state.authRequests.some((request) => request.path.endsWith("/token"))).toBe(true);
  await expect(page.getByText("A verificar sessão…", { exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continuar sem sessão", exact: true })).toHaveCount(0);
  expect(state.accountReads).toBe(0);
  state.delayRefresh = false;
  state.releaseRefresh();
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Window & { portfolioReads: number }).portfolioReads)).toBe(0);
  await page.getByRole("button", { name: "Usar modo local", exact: true }).click();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Carteira da Ana", exact: true })).toBeVisible();
});

test("sessão expirada e refresh inválido devolvem a escolha sem montar carteiras", async ({ page }) => {
  const state = await setup(page, "expired");
  state.failRefresh = true;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  expect(state.accountReads).toBe(0);
  expect(state.requests).toHaveLength(0);
  expect(state.marketRequests).toBe(0);
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(localJson);
});

test("modo local continua utilizável se o navegador bloquear sessionStorage", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === sessionStorage) throw new DOMException("Blocked", "SecurityError");
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage) throw new DOMException("Blocked", "SecurityError");
      return originalSet.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { name: localPortfolio.name, exact: true })).toBeVisible();
});
