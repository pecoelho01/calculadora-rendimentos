import { test, expect } from "@playwright/test";
import { selectedPortfolio } from "../../helpers/sidebar-helpers";
import {
  storageKey,
  entryKey,
  localPortfolio,
  localJson,
  userA,
  setup,
} from "../../helpers/account/mock-backend";
import {
  accountAction,
  login,
  rename,
  assertNoOverflow,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test("iniciar sessão, alternar modo, sair e trocar utilizador preserva isolamento local", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await login(page);
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await expect(
    selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
  ).toHaveCount(0);
  await accountAction(page, "Usar modo local");
  await expect(
    selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
  ).toBeVisible();
  await accountAction(page, "Abrir carteiras da conta");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await accountAction(page, "Sair da conta");
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), entryKey),
  ).toBeNull();
  await login(page, "bruno@example.test");
  await expect(
    selectedPortfolio(page).getByText("Carteira do Bruno", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Carteira da Ana", { exact: true })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

test(
  "resposta pendente da conta não volta a apresentar dados depois de sair",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.goto("/");
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    state.delayNextWrite = true;
    await rename(page, "Carteira da Ana", "Resposta antiga");
    await expect.poll(() => state.requests.length).toBe(1);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await accountAction(page, "Sair da conta");
    await expect(
      page.getByRole("heading", {
        name: "Bem-vindo ao Rendimentos",
        exact: true,
      }),
    ).toBeVisible();
    state.releaseWrite();
    await expect
      .poll(() => state.accounts[userA].portfolios[0].portfolio.name)
      .toBe("Resposta antiga");
    await expect(
      page.getByRole("heading", {
        name: "Bem-vindo ao Rendimentos",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(
      page.getByText("Resposta antiga", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
  },
);

test(
  "respostas incluem proteção contra enquadramento e fuga de referrer",
  { tag: "@desktop-only" },
  async ({ request }) => {
    for (const path of ["/", "/api/account"]) {
      const response = await request.get(path);
      const policy = response.headers()["content-security-policy"];
      for (const directive of [
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "object-src 'none'",
      ])
        expect(policy).toContain(directive);
      if (path === "/") {
        expect(policy).toMatch(
          /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
        );
        expect(policy).toContain("script-src-attr 'none'");
        expect(policy).not.toContain("unsafe-eval");
      }
      expect(response.headers()["x-frame-options"]).toBe("DENY");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      if (path === "/api/account") {
        expect(response.status()).toBe(401);
        expect(response.headers()["cache-control"]).toBe("private, no-store");
      }
    }
  },
);

test(
  "restaurar uma sessão válida aguarda Auth sem abrir carteiras locais",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, "expired");
    state.delayRefresh = true;
    await page.addInitScript(() => {
      const observed = window as unknown as Window & { portfolioReads: number };
      observed.portfolioReads = 0;
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (this === localStorage && key === "rendimentos.portfolios.v1")
          observed.portfolioReads++;
        return original.call(this, key);
      };
    });
    await page.goto("/");
    await expect
      .poll(() =>
        state.authRequests.some((request) => request.path.endsWith("/token")),
      )
      .toBe(true);
    await expect(
      page.getByText("A verificar sessão…", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continuar sem sessão", exact: true }),
    ).toHaveCount(0);
    expect(state.accountReads).toBe(0);
    state.delayRefresh = false;
    state.releaseRefresh();
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    await expect(
      selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as Window & { portfolioReads: number })
            .portfolioReads,
      ),
    ).toBe(0);
    await accountAction(page, "Usar modo local");
    await expect(
      selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "sessão expirada e refresh inválido devolvem a escolha sem montar carteiras",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, "expired");
    state.failRefresh = true;
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Bem-vindo ao Rendimentos",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Não foi possível recuperar a sessão/),
    ).toBeVisible();
    await expect(page.locator(".metrics")).toHaveCount(0);
    expect(state.accountReads).toBe(0);
    expect(state.requests).toHaveLength(0);
    expect(state.marketRequests).toBe(0);
    await page
      .getByRole("button", { name: "Continuar sem sessão", exact: true })
      .click();
    await expect(
      selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
  },
);

test(
  "login pode ser repetido após falhar a recuperação da sessão expirada",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, "expired");
    state.failRefresh = true;
    await page.goto("/");
    await expect(
      page.getByText(/Não foi possível recuperar a sessão/),
    ).toBeVisible();
    state.failRefresh = false;
    await login(page, "bruno@example.test");
    await expect(
      selectedPortfolio(page).getByText("Carteira do Bruno", { exact: true }),
    ).toBeVisible();
  },
);
