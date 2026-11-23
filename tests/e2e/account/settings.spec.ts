import { test, expect } from "@playwright/test";
import {
  openSidebar,
  navigateTo,
  selectedPortfolio,
} from "../../helpers/sidebar-helpers";
import {
  storageKey,
  authKey,
  localJson,
  userA,
  setup,
} from "../../helpers/account/mock-backend";
import {
  openAccountSettings,
  accountAction,
  authSurface,
  login,
  assertNoOverflow,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test(
  "abrir definições aguarda o restauro inicial da sessão",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    state.accounts[userA] = { version: 1, portfolios: [] };
    await page.addInitScript(() => {
      const originalRequest = navigator.locks.request.bind(navigator.locks);
      const audit = { blocked: false, release: () => {} };
      let pending = true;
      const gate = new Promise<void>((resolve) => {
        audit.release = () => {
          pending = false;
          resolve();
        };
      });
      (
        window as unknown as { sessionRestoreAudit: typeof audit }
      ).sessionRestoreAudit = audit;
      Object.defineProperty(navigator.locks, "request", {
        configurable: true,
        value: async (
          name: string,
          options: LockOptions,
          callback: LockGrantedCallback<unknown>,
        ) => {
          if (name === "rendimentos.auth.mutation.v1" && pending) {
            audit.blocked = true;
            await gate;
          }
          return originalRequest(name, options, callback);
        },
      });
    });
    await page.goto("/");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { sessionRestoreAudit: { blocked: boolean } })
              .sessionRestoreAudit.blocked,
        ),
      )
      .toBe(true);

    const navigation = openAccountSettings(page);
    await expect(page.locator('.entry-page[aria-busy="true"]')).toBeVisible();
    await page.evaluate(() =>
      (
        window as unknown as { sessionRestoreAudit: { release: () => void } }
      ).sessionRestoreAudit.release(),
    );
    await navigation;
    await expect(page).toHaveURL(/\/definicoes$/);
    await expect(
      page.getByRole("button", {
        name: "Copiar carteiras locais para a conta",
        exact: true,
      }),
    ).toBeEnabled();
    expect(state.requests).toHaveLength(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
  },
);

test("preservar tema entre entrada, conta, modo local e saída", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  state.userMetadata = {
    rendimentosPreferences: {
      version: 1,
      theme: "dark",
      chartPeriod: "Máximo",
      positionsPeriod: "Máximo",
    },
  };
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ativar tema escuro", exact: true })
    .click();
  await expect(page.locator(".entry-card .entry-option").first()).toHaveCSS(
    "background-color",
    "rgb(19, 32, 45)",
  );
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("entrada-tema-escuro.png"),
    fullPage: true,
  });
  await login(page);
  await expect(page.locator(".local-badge")).toContainText("Modo conta");
  await openAccountSettings(page);
  await expect(page.locator(".account-controls")).toHaveCSS(
    "background-color",
    "rgb(19, 32, 45)",
  );
  await expect(
    page.getByRole("radio", { name: "Escuro", exact: true }),
  ).toBeChecked();
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("conta-tema-escuro.png"),
    fullPage: true,
  });
  await accountAction(page, "Usar modo local");
  await expect(page.locator(".local-badge")).toContainText("Modo local");
  await openAccountSettings(page);
  await expect(
    page.getByRole("radio", { name: "Escuro", exact: true }),
  ).toBeChecked();
  await accountAction(page, "Sair da conta");
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ativar tema claro", exact: true })
    .click();
  await expect(page.locator(".entry-card .entry-option").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  state.userMetadata = {
    rendimentosPreferences: {
      version: 1,
      theme: "light",
      chartPeriod: "Máximo",
      positionsPeriod: "Máximo",
    },
  };
  await login(page);
  await openAccountSettings(page);
  await expect(page.locator(".account-controls")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".local-badge")).toContainText("Modo conta");
  await assertNoOverflow(page);
});

test("acesso direto às definições sem sessão permite continuar local e voltar às carteiras", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/conta");
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
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
  await openSidebar(page);
  await expect(
    page.getByRole("button", { name: "Iniciar sessão", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sair da conta", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  const registration = authSurface(page, "Criar conta");
  await registration
    .getByLabel("Email", { exact: true })
    .fill("ana@example.test");
  await registration
    .getByLabel("Palavra-passe", { exact: true })
    .fill("password-test");
  await registration
    .getByRole("button", { name: "Criar conta", exact: true })
    .click();
  await expect(
    page.getByText(/Consulta o teu email para confirmar a conta/),
  ).toBeVisible();
  await navigateTo(page, "Posições");
  await expect(page).toHaveURL(/\/carteira\/[^/?]+\/posicoes$/);
  await expect(
    page.getByRole("heading", { name: "Posições", exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
});

test("definições mantêm acesso à conta e bloqueiam carteiras locais corrompidas", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (key) => localStorage.setItem(key, "original-corrompido"),
    storageKey,
  );
  await openAccountSettings(page);
  await page
    .locator(".account-actions")
    .getByRole("button", { name: "Usar modo local", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ana@example.test", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Recupera os dados",
  );
  await assertNoOverflow(page);
  await openSidebar(page);
  await expect(
    page
      .locator("#workspace-sidebar")
      .getByRole("button", { name: "Criar carteira", exact: true }),
  ).toBeDisabled();
  if ((page.viewportSize()?.width ?? 1440) <= 800)
    await page
      .getByRole("button", { name: "Fechar menu", exact: true })
      .click();
  await expect(
    page
      .locator(".account-actions")
      .getByRole("button", { name: "Sair da conta", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("original-corrompido");
  await page
    .getByRole("link", { name: "Recuperar carteiras", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recuperar carteiras", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Repor armazenamento", exact: true })
    .click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("original-corrompido");
  expect(state.requests).toHaveLength(0);
});

test(
  "definições mostram falhas de recarga e confirmação de cópia local",
  { tag: "@desktop-only" },
  async ({ page }) => {
    await setup(page, true);
    await page.goto("/");
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    await openAccountSettings(page);
    let failReload = true;
    await page.route("**/api/account", (route) =>
      failReload && route.request().method() === "GET"
        ? route.fulfill({ status: 503, json: { error: "Indisponível" } })
        : route.fallback(),
    );
    await page
      .getByRole("button", { name: "Recarregar dados da conta", exact: true })
      .click();
    await expect(page.locator(".notice[role='alert']")).toContainText(
      "Não foi possível aceder às carteiras da conta",
    );
    failReload = false;
    await page
      .getByRole("button", { name: "Recarregar dados da conta", exact: true })
      .click();
    await expect(page.locator(".account-save-status")).toHaveText(
      "Guardado na conta",
    );
    await expect(page.locator(".notice")).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        name: "Copiar carteiras locais para a conta",
        exact: true,
      })
      .click();
    await expect(page.locator(".notice[role='status']")).toContainText(
      "Carteiras locais copiadas para a conta",
    );
  },
);

test(
  "preferências da conta guardam tema e período sem alterar preferências locais",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.addInitScript(() =>
      localStorage.setItem("rendimentos-theme-v1", "light"),
    );
    await page.goto("/conta");
    await expect(
      page.getByRole("heading", { name: "Definições da conta" }),
    ).toBeVisible();

    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect
      .poll(() => state.userMetadata.rendimentosPreferences)
      .toEqual({
        version: 1,
        theme: "dark",
        chartPeriod: "Máximo",
        positionsPeriod: "Máximo",
      });
    await expect.poll(() => state.completedUserUpdates).toBe(1);
    expect(
      await page.evaluate(() => localStorage.getItem("rendimentos-theme-v1")),
    ).toBe("light");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("rendimentos-account-theme-v1"),
      ),
    ).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByLabel("Período predefinido do gráfico").selectOption("1A");
    await expect
      .poll(() => state.userMetadata.rendimentosPreferences)
      .toEqual({
        version: 1,
        theme: "dark",
        chartPeriod: "1A",
        positionsPeriod: "Máximo",
      });
    await expect.poll(() => state.completedUserUpdates).toBe(2);
    await page
      .getByLabel("Período predefinido das posições")
      .selectOption("1A");
    await expect
      .poll(() => state.userMetadata.rendimentosPreferences)
      .toEqual({
        version: 1,
        theme: "dark",
        chartPeriod: "1A",
        positionsPeriod: "1A",
      });
    await expect.poll(() => state.completedUserUpdates).toBe(3);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("rendimentos-positions-period-v1"),
      ),
    ).toBeNull();
    const storedAuth = await page.evaluate((key) => {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value).user?.user_metadata : null;
    }, authKey);
    expect(storedAuth).toEqual(state.userMetadata);
    await page.reload();
    await expect(page.getByLabel("Período predefinido do gráfico")).toHaveValue(
      "1A",
    );
    await expect(
      page.getByLabel("Período predefinido das posições"),
    ).toHaveValue("1A");
  },
);

test(
  "falha ao guardar preferência repõe o valor confirmado e permite fechar aviso",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.goto("/conta");
    await expect(
      page.getByRole("heading", { name: "Definições da conta" }),
    ).toBeVisible();
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect
      .poll(() => state.userMetadata.rendimentosPreferences)
      .toEqual({
        version: 1,
        theme: "dark",
        chartPeriod: "Máximo",
        positionsPeriod: "Máximo",
      });
    await expect.poll(() => state.completedUserUpdates).toBe(1);
    state.failNextUserUpdate = true;
    await page.getByLabel("Período predefinido do gráfico").selectOption("1A");
    await expect(page.locator(".notice[role='alert']")).toContainText(
      "Não foi possível guardar",
    );
    await expect(page.getByRole("radio", { name: "Escuro" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("button", { name: "Fechar aviso" }).click();
    await expect(page.locator(".notice[role='alert']")).toHaveCount(0);
  },
);

test(
  "versão futura de preferências é só de leitura",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page);
    state.userMetadata = {
      rendimentosPreferences: { version: 2, theme: "dark", chartPeriod: "1A" },
    };
    await page.goto("/");
    await login(page);
    await openAccountSettings(page);
    await expect(page.locator(".notice[role='status']")).toContainText(
      "versão mais recente",
    );
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect(page.getByRole("radio", { name: "Sistema" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByLabel("Período predefinido do gráfico").selectOption("1A");
    await expect(page.getByLabel("Período predefinido do gráfico")).toHaveValue(
      "Máximo",
    );
    expect(
      state.authRequests.filter((request) => request.path.endsWith("/user")),
    ).toHaveLength(0);
  },
);

test(
  "pintura inicial usa a cache da conta antes da preferência local",
  { tag: "@desktop-only" },
  async ({ page }) => {
    await setup(page, true);
    await page.addInitScript((key) => {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      saved.user.user_metadata = {
        rendimentosPreferences: {
          version: 1,
          theme: "dark",
          chartPeriod: "Máximo",
          positionsPeriod: "Máximo",
        },
      };
      localStorage.setItem(key, JSON.stringify(saved));
      localStorage.setItem("rendimentos-account-theme-v1", "dark");
      localStorage.setItem("rendimentos-theme-v1", "light");
      const observed: string[] = [];
      (window as unknown as { observedThemes: string[] }).observedThemes =
        observed;
      // Init scripts run before <html> exists, so observe the document subtree.
      // Record every intermediate value: reading the attribute inside the
      // batched callback would only see the latest one and hide a flash.
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.target !== document.documentElement) continue;
          observed.push(mutation.oldValue ?? "");
        }
        observed.push(document.documentElement?.dataset.theme ?? "");
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-theme"],
        attributeOldValue: true,
      });
    }, authKey);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const observedThemes = await page.evaluate(
      () => (window as unknown as { observedThemes: string[] }).observedThemes,
    );
    expect(observedThemes).not.toContain("light");
  },
);

test(
  "escolhas rápidas de tema guardam a última sem aviso",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.goto("/conta");
    await expect(
      page.getByRole("heading", { name: "Definições da conta" }),
    ).toBeVisible();
    state.delayAuthPath = "/user";
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect.poll(() => state.authBlocked).toBe(true);
    await page.getByRole("radio", { name: "Sistema" }).click();
    await page.getByRole("radio", { name: "Claro" }).click();
    await page.getByRole("radio", { name: "Escuro" }).click();
    state.releaseAuth();
    await expect
      .poll(() => state.userMetadata.rendimentosPreferences)
      .toEqual({
        version: 1,
        theme: "dark",
        chartPeriod: "Máximo",
        positionsPeriod: "Máximo",
      });
    await expect.poll(() => state.completedUserUpdates).toBe(2);
    const preferenceWrites = state.authRequests
      .filter((request) => request.path.endsWith("/user"))
      .map((request) => request.body.data);
    expect(preferenceWrites).toEqual([
      {
        rendimentosPreferences: {
          version: 1,
          theme: "dark",
          chartPeriod: "Máximo",
          positionsPeriod: "Máximo",
        },
      },
      {
        rendimentosPreferences: {
          version: 1,
          theme: "dark",
          chartPeriod: "Máximo",
          positionsPeriod: "Máximo",
        },
      },
    ]);
    await expect(page.getByRole("radio", { name: "Escuro" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator(".notice[role='alert']")).toHaveCount(0);
  },
);
