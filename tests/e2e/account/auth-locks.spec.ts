import { test, expect, type Page } from "@playwright/test";
import { selectedPortfolio } from "../../helpers/sidebar-helpers";
import {
  authKey,
  localPortfolio,
  userA,
  session,
  setup,
  type MockAuthState,
} from "../../helpers/account/mock-backend";
import {
  openAccountSettings,
  accountAction,
  authSurface,
  login,
  waitForPortfolioOverviewRoute,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

// The app requests its auth lock synchronously before any refresh fetch, so an
// idle lock manager means every refresh triggered earlier has finished.
async function waitForAuthLocksIdle(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const locks = await navigator.locks.query();
        return (locks.held?.length ?? 0) + (locks.pending?.length ?? 0);
      }),
    )
    .toBe(0);
}

// Leaves /logout pending and writes an expired session while it is in flight,
// as a late write that the logout must not let survive.
async function startLogoutAndStoreExpiredSession(
  page: Page,
  state: MockAuthState,
) {
  state.delayAuthPath = "/logout";
  await accountAction(page, "Sair da conta");
  await expect
    .poll(() =>
      state.authRequests.some((request) => request.path.endsWith("/logout")),
    )
    .toBe(true);
  const storedSession = JSON.stringify(session(userA, -3600));
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: authKey,
    value: storedSession,
  });
  return storedSession;
}

async function expectNoRenewalAfterLogout(page: Page, state: MockAuthState) {
  await page.clock.fastForward(60_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitForAuthLocksIdle(page);
  expect(
    state.authRequests.filter((request) => request.grant === "refresh_token"),
  ).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Sair da conta", exact: true }),
  ).toHaveCount(0);
}

test(
  "login pendente bloqueia fecho, Escape e reentrada até concluir",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page);
    await page.goto("/");
    state.delayAuthPath = "/token";
    await login(page, "ana@example.test", false);
    await expect.poll(() => state.authRequests.length).toBe(1);
    const dialog = authSurface(page, "Iniciar sessão");
    await expect(
      dialog.locator(".auth-inline-back, .dialog-heading button"),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Email", { exact: true })).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "A aguardar…", exact: true }),
    ).toBeDisabled();
    state.releaseAuth();
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    await accountAction(page, "Sair da conta");
    await login(page, "bruno@example.test");
    await expect(
      selectedPortfolio(page).getByText("Carteira do Bruno", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "pedidos Auth noutro separador não ultrapassam um login pendente",
  { tag: "@desktop-only" },
  async ({ page, context }) => {
    const first = await setup(page);
    await page.goto("/");
    const secondPage = await context.newPage();
    const second = await setup(secondPage);
    await secondPage.goto("/");
    first.delayAuthPath = "/token";
    await login(page, "ana@example.test", false);
    await expect.poll(() => first.authRequests.length).toBe(1);
    await login(secondPage, "bruno@example.test", false);
    await expect(
      secondPage.getByText(/Há um pedido de conta em curso/),
    ).toBeVisible();
    expect(second.authRequests).toHaveLength(0);
    first.releaseAuth();
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    await secondPage.close();
  },
);

test(
  "recuperar, alterar palavra-passe e sair mantêm os pedidos pendentes protegidos",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page);
    await page.goto("/");
    state.delayAuthPath = "/recover";
    await page
      .getByRole("button", { name: "Iniciar sessão", exact: true })
      .click();
    await authSurface(page)
      .getByRole("button", { name: "Esqueci a palavra-passe", exact: true })
      .click();
    let dialog = authSurface(page);
    await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
    await dialog
      .getByRole("button", { name: "Enviar ligação", exact: true })
      .click();
    await expect.poll(() => state.authRequests.length).toBe(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator(".auth-inline-back, .dialog-heading button"),
    ).toBeDisabled();
    state.releaseAuth();
    await expect(
      dialog.getByText(/Se existir uma conta com este email/),
    ).toBeVisible();
    await page.goto("/?code=recovery-test-code&recovery=1");
    dialog = authSurface(page, "Definir nova palavra-passe");
    await expect(dialog).toBeVisible();
    await waitForPortfolioOverviewRoute(page);
    state.delayAuthPath = "/user";
    await dialog
      .getByLabel("Nova palavra-passe", { exact: true })
      .fill("new-password-test");
    await dialog
      .getByRole("button", { name: "Guardar palavra-passe", exact: true })
      .click();
    await expect
      .poll(() =>
        state.authRequests.some(
          (request) => request.body.password === "new-password-test",
        ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator(".auth-inline-back, .dialog-heading button"),
    ).toBeDisabled();
    state.releaseAuth();
    await expect(
      page.getByText("Palavra-passe atualizada.", { exact: true }),
    ).toBeVisible();
    state.delayAuthPath = "/logout";
    await accountAction(page, "Sair da conta");
    await expect
      .poll(() =>
        state.authRequests.some((request) => request.path.endsWith("/logout")),
      )
      .toBe(true);
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Iniciar sessão", exact: true }),
    ).toBeDisabled();
    state.releaseAuth();
    await expect(
      page.getByRole("button", { name: "Iniciar sessão", exact: true }),
    ).toBeEnabled();
  },
);

for (const storedSession of [false, true, "expired"] as const) {
  test(
    `sem Web Locks não enviar credenciais, incluindo renovação: ${storedSession}`,
    { tag: "@desktop-only" },
    async ({ page }) => {
      const state = await setup(page, storedSession);
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "locks", { value: undefined }),
      );
      await page.goto("/");
      await login(page, "ana@example.test", false);
      await expect(
        page.getByText(
          /Este navegador não permite proteger os pedidos da conta/,
        ),
      ).toBeVisible();
      expect(state.authRequests).toHaveLength(0);
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Continuar sem sessão", exact: true })
        .click();
      await expect(
        selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
      ).toBeVisible();
    },
  );
}

test(
  "sessão expirada não renova com o lock ocupado e permite tentar novamente",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, "expired");
    await page.addInitScript(() => {
      const observed = window as unknown as { releaseAuthAudit: () => void };
      void navigator.locks.request("rendimentos.auth.mutation.v1", async () => {
        await new Promise<void>((resolve) => {
          observed.releaseAuthAudit = resolve;
        });
      });
    });
    await page.goto("/");
    await expect(
      page.getByText(/Há um pedido de conta em curso/),
    ).toBeVisible();
    expect(state.authRequests).toHaveLength(0);
    expect(state.accountReads).toBe(0);
    await page.evaluate(() =>
      (
        window as unknown as { releaseAuthAudit: () => void }
      ).releaseAuthAudit(),
    );
    await login(page);
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    expect(
      state.authRequests.filter((request) => request.grant === "refresh_token"),
    ).toHaveLength(1);
  },
);

test(
  "renovação por temporizador e foco respeita um lock noutro separador",
  { tag: "@desktop-only" },
  async ({ page, context }) => {
    const state = await setup(page, true);
    await page.clock.install();
    await page.goto("/");
    await expect(selectedPortfolio(page)).toBeVisible();
    const other = await context.newPage();
    await other.goto("/icon.svg");
    await other.evaluate(
      () =>
        new Promise<void>((ready) => {
          void navigator.locks.request(
            "rendimentos.auth.mutation.v1",
            async () => {
              await new Promise<void>((resolve) => {
                (
                  window as unknown as { releaseAuthAudit: () => void }
                ).releaseAuthAudit = resolve;
                ready();
              });
            },
          );
        }),
    );
    await page.evaluate(
      ({ key, expired }) => localStorage.setItem(key, JSON.stringify(expired)),
      { key: authKey, expired: session(userA, -3600) },
    );
    await page.clock.fastForward(30_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.authRequests).toHaveLength(0);
    await other.evaluate(() =>
      (
        window as unknown as { releaseAuthAudit: () => void }
      ).releaseAuthAudit(),
    );
    await other.close();
    await page.clock.fastForward(30_000);
    await expect
      .poll(
        () =>
          state.authRequests.filter(
            (request) => request.grant === "refresh_token",
          ).length,
      )
      .toBe(1);
    await openAccountSettings(page);
    await expect(
      page
        .locator(".account-actions")
        .getByRole("button", { name: "Sair da conta", exact: true }),
    ).toBeEnabled();
  },
);

test(
  "temporizador não renova durante logout nem restaura a sessão depois",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.clock.install();
    await page.goto("/");
    await expect(selectedPortfolio(page)).toBeVisible();
    await startLogoutAndStoreExpiredSession(page, state);
    await page.clock.fastForward(30_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(
      state.authRequests.filter((request) => request.grant === "refresh_token"),
    ).toHaveLength(0);
    state.releaseAuth();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), authKey))
      .toBeNull();
    await expect(
      page.getByRole("button", { name: "Iniciar sessão", exact: true }),
    ).toBeEnabled();
    await expectNoRenewalAfterLogout(page, state);
  },
);

test(
  "logout com erro limpa uma sessão gravada durante o pedido",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.clock.install();
    await page.goto("/");
    await expect(selectedPortfolio(page)).toBeVisible();
    state.failNextLogout = true;
    const storedSession = await startLogoutAndStoreExpiredSession(page, state);
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), authKey))
      .toBe(storedSession);
    state.releaseAuth();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), authKey))
      .toBeNull();
    await expect(
      page.getByRole("button", { name: "Iniciar sessão", exact: true }),
    ).toBeEnabled();
    // Prove the mocked 500 was served, so this covers the error path.
    expect(state.failNextLogout).toBe(false);
    await expectNoRenewalAfterLogout(page, state);
  },
);

test(
  "renovação pendente mantém o lock até persistir e bloqueia logout concorrente",
  { tag: "@desktop-only" },
  async ({ page, context }) => {
    const state = await setup(page, true);
    await page.clock.install();
    await page.goto("/");
    await expect(selectedPortfolio(page)).toBeVisible();
    const other = await context.newPage();
    await other.goto("/icon.svg");
    state.delayRefresh = true;
    await page.evaluate(
      ({ key, expired }) => localStorage.setItem(key, JSON.stringify(expired)),
      { key: authKey, expired: session(userA, -3600) },
    );
    await page.clock.fastForward(30_000);
    await expect
      .poll(() =>
        state.authRequests.some((request) => request.grant === "refresh_token"),
      )
      .toBe(true);
    expect(
      await other.evaluate(() =>
        navigator.locks.request(
          "rendimentos.auth.mutation.v1",
          { ifAvailable: true },
          (lock) => !!lock,
        ),
      ),
    ).toBe(false);
    await accountAction(page, "Sair da conta");
    await expect(
      page.getByText(/não foi possível terminar a sessão/),
    ).toBeVisible();
    expect(
      state.authRequests.some((request) => request.path.endsWith("/logout")),
    ).toBe(false);
    state.releaseRefresh();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).expires_at >
            Date.now() / 1000,
          authKey,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        other.evaluate(() =>
          navigator.locks.request(
            "rendimentos.auth.mutation.v1",
            { ifAvailable: true },
            (lock) => !!lock,
          ),
        ),
      )
      .toBe(true);
    await accountAction(page, "Sair da conta");
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), authKey))
      .toBeNull();
    await page.clock.fastForward(60_000);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), authKey),
    ).toBeNull();
    await other.close();
  },
);
