import { test, expect } from "@playwright/test";
import { skipUnlessEnv } from "../../helpers/require-test-env";
import { openSidebar, selectedPortfolio } from "../../helpers/sidebar-helpers";
import {
  storageKey,
  entryKey,
  authKey,
  localPortfolio,
  localJson,
  setup,
} from "../../helpers/account/mock-backend";
import {
  openAccountSettings,
  accountAction,
  authSurface,
  login,
  assertNoOverflow,
  waitForPortfolioOverviewRoute,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
skipUnlessEnv(
  "TEST_ACCOUNT_AUTH",
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test("entrada exige escolha, permite teclado e conserva o modo local só na mesma aba", async ({
  page,
  context,
}, testInfo) => {
  const state = await setup(page);
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
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar sessão", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
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
  expect(state.accountReads).toBe(0);
  expect(state.marketRequests).toBe(0);
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("entrada.png"),
    fullPage: true,
  });
  const continueLocal = page.getByRole("button", {
    name: "Continuar sem sessão",
    exact: true,
  });
  await continueLocal.focus();
  await expect(continueLocal).toBeFocused();
  await continueLocal.press("Enter");
  await expect(
    selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), entryKey),
  ).toBe("1");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await page.reload();
  await expect(
    selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(other.locator(".metrics")).toHaveCount(0);
  await other.close();
});

test("modo local continua utilizável se o navegador bloquear sessionStorage", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (this === sessionStorage)
        throw new DOMException("Blocked", "SecurityError");
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage)
        throw new DOMException("Blocked", "SecurityError");
      return originalSet.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await expect(
    selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
  ).toBeVisible();
});

test("sidebar local permite registo e login sem duplicar controlos no dashboard", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await openSidebar(page);
  const sidebar = page.locator("#workspace-sidebar");
  await expect(
    sidebar.getByRole("button", { name: "Iniciar sessão", exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main .account-controls")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("sidebar-conta-local.png"),
    fullPage: true,
  });
  await sidebar
    .getByRole("button", { name: "Criar conta", exact: true })
    .click();
  const dialog = authSurface(page, "Criar conta");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await login(page);
  await openAccountSettings(page);
  await expect(page).toHaveURL(/\/definicoes$/);
  await expect(
    page.getByText("ana@example.test", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("definicoes-conta.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Usar modo local", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ana@example.test", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Voltar às carteiras", exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/carteira(\/[^/?]+\/(geral|posicoes|transacoes))?$/,
  );
  await expect(
    selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
  ).toBeVisible();
  await openAccountSettings(page);
  await expect(
    page.getByRole("button", { name: "Abrir carteiras da conta", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  expect(state.requests).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ana@example.test", { exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
});

for (const localMode of [false, true]) {
  test(`terminar sessão diretamente na sidebar preserva carteiras locais: modo local ${localMode}`, async ({
    page,
  }) => {
    const state = await setup(page, true);
    await page.goto("/");
    await waitForPortfolioOverviewRoute(page);
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    if (localMode) await accountAction(page, "Usar modo local");
    await openSidebar(page);
    const sidebar = page.locator("#workspace-sidebar");
    await expect(
      sidebar.getByRole("link", { name: "Definições da conta", exact: true }),
    ).toBeVisible();
    const logout = sidebar.getByRole("button", {
      name: "Sair da conta",
      exact: true,
    });
    await expect(logout).toBeVisible();
    await assertNoOverflow(page);
    await logout.click();
    await expect(
      page.getByRole("heading", {
        name: "Bem-vindo ao Rendimentos",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect
      .poll(() =>
        state.authRequests.some((request) => request.path.endsWith("/logout")),
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), authKey))
      .toBeNull();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
    await page
      .getByRole("button", { name: "Continuar sem sessão", exact: true })
      .click();
    await expect(
      selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
    ).toBeVisible();
    await openSidebar(page);
    await expect(
      sidebar.getByRole("button", { name: "Sair da conta", exact: true }),
    ).toHaveCount(0);
    await expect(
      sidebar.getByRole("button", { name: "Iniciar sessão", exact: true }),
    ).toBeVisible();
    await assertNoOverflow(page);
  });
}

test("recuperação local permite iniciar sessão sem repor dados corrompidos", async ({
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
  await page.evaluate(
    (key) => localStorage.setItem(key, "original-corrompido"),
    storageKey,
  );
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recuperar carteiras", exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
  await page.getByRole("link", { name: "Aceder à conta", exact: true }).click();
  await expect(page).toHaveURL(/\/definicoes$/);
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
  await openSidebar(page);
  await expect(
    page
      .locator("#workspace-sidebar")
      .getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeVisible();
  await login(page);
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("original-corrompido");
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

test("ignorar resposta pendente depois de mudar para modo local", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.addInitScript(() =>
    localStorage.setItem("rendimentos-theme-v1", "light"),
  );
  await page.goto("/conta");
  await expect(
    page.getByRole("heading", { name: "Definições da conta" }),
  ).toBeVisible();
  state.delayAuthPath = "/user";
  await page.getByRole("radio", { name: "Escuro" }).click();
  await expect.poll(() => state.authBlocked).toBe(true);
  await page
    .locator(".account-actions")
    .getByRole("button", { name: "Usar modo local", exact: true })
    .click();
  await expect(page.locator(".local-badge")).toContainText("Modo local");
  state.releaseAuth();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("rendimentos-account-theme-v1")),
    )
    .toBeNull();
  await expect.poll(() => state.completedUserUpdates).toBe(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    state.authRequests.filter((request) => request.path.endsWith("/user")),
  ).toHaveLength(1);
});
