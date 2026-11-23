import { test, expect } from "@playwright/test";
import { selectedPortfolio } from "../../helpers/sidebar-helpers";
import { setup } from "../../helpers/account/mock-backend";
import {
  openAccountSettings,
  authSurface,
  assertNoOverflow,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

type CaptchaMockWindow = Window & {
  __captchaMock: {
    issue(): void;
    expire(): void;
    fail(): void;
    timeout(): void;
  };
};

test("CAPTCHA mantém o nonce do documento após navegar para as definições da conta", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_CAPTCHA,
    "Requer build com site key Turnstile fictícia.",
  );
  const state = await setup(page, true, false);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  const documentNonce = await page
    .locator("head script[nonce]")
    .first()
    .evaluate((script) => (script as HTMLScriptElement).nonce);
  expect(documentNonce).toBeTruthy();
  await openAccountSettings(page);
  await page
    .locator(".account-actions")
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const dialog = authSurface(page, "Iniciar sessão");
  await expect(
    dialog.getByText("Verificação de segurança simulada"),
  ).toBeVisible();
  expect(
    await page
      .locator('script[src*="challenges.cloudflare.com/turnstile/"]')
      .evaluate((script) => (script as HTMLScriptElement).nonce),
  ).toBe(documentNonce);
  await assertNoOverflow(page);
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.issue(),
  );
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog
    .getByLabel("Palavra-passe", { exact: true })
    .fill("password-test");
  await dialog
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(
    state.authRequests.filter((request) => request.grant === "password"),
  ).toHaveLength(1);
  // After a logout the entry page starts over instead of returning to the
  // settings page of the previous session.
  await expect(page).toHaveURL(/\/carteira\/[^/?]+\/geral$/);
  await openAccountSettings(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".account-actions")
      .getByRole("button", { name: "Sair da conta", exact: true }),
  ).toBeVisible();
});

test("CAPTCHA expira e cada tentativa Auth exige um token novo", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.TEST_CAPTCHA,
    "Requer build com site key Turnstile fictícia.",
  );
  const state = await setup(page, false, false);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const dialog = authSurface(page);
  const submit = dialog.getByRole("button", {
    name: "Iniciar sessão",
    exact: true,
  });
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog
    .getByLabel("Palavra-passe", { exact: true })
    .fill("password-test");
  await expect(
    dialog.getByText("Verificação de segurança simulada"),
  ).toBeVisible();
  await assertNoOverflow(page);
  await expect(submit).toBeInViewport();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("login-captcha.png"),
    fullPage: true,
  });
  await expect(submit).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.issue(),
  );
  await expect(submit).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.expire(),
  );
  await expect(submit).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.issue(),
  );
  state.failNextLogin = true;
  await submit.click();
  await expect(
    dialog.getByText(/Não foi possível iniciar sessão/),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.issue(),
  );
  await submit.click();
  await expect(dialog).toBeHidden();
  const attempts = state.authRequests.filter(
    (request) => request.grant === "password",
  );
  const tokens = attempts.map(
    (request) =>
      (request.body.gotrue_meta_security as { captcha_token: string })
        .captcha_token,
  );
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toBeTruthy();
  expect(tokens[1]).not.toBe(tokens[0]);
});

test("CAPTCHA bloqueado permite repetir a verificação sem enviar Auth", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_CAPTCHA,
    "Requer build com site key Turnstile fictícia.",
  );
  const state = await setup(page, false, false);
  let blockScript = true;
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) => (blockScript ? route.abort() : route.fallback()),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  const dialog = authSurface(page);
  await expect(
    dialog.getByText(/Não foi possível concluir a verificação/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeDisabled();
  expect(state.authRequests).toHaveLength(0);
  blockScript = false;
  // A network failure never leaves a previous token usable, even after retry.
  await dialog
    .getByRole("button", { name: "Tentar verificação novamente", exact: true })
    .click();
  await expect(
    dialog.getByText("Verificação de segurança simulada"),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeDisabled();
  expect(state.authRequests).toHaveLength(0);
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.issue(),
  );
  await expect(
    dialog.getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as CaptchaMockWindow).__captchaMock.timeout(),
  );
  await expect(
    dialog.getByText(/Não foi possível concluir a verificação/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Criar conta", exact: true }),
  ).toBeDisabled();
});
