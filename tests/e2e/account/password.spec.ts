import { test, expect } from "@playwright/test";
import { userA, session, setup } from "../../helpers/account/mock-backend";
import { authSurface, assertNoOverflow } from "../../helpers/account/actions";
import {
  openRecovery,
  publishAuthSession,
} from "../../helpers/account/recovery";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test("registo pede confirmação por email e recuperação envia ligação", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  let dialog = authSurface(page, "Criar conta");
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog
    .getByLabel("Palavra-passe", { exact: true })
    .fill("password-test");
  await dialog
    .getByRole("button", { name: "Criar conta", exact: true })
    .click();
  await expect(
    page.getByText(/Consulta o teu email para confirmar a conta/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  await authSurface(page)
    .getByRole("button", { name: "Esqueci a palavra-passe", exact: true })
    .click();
  dialog = authSurface(page, "Recuperar acesso");
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog
    .getByRole("button", { name: "Enviar ligação", exact: true })
    .click();
  await expect(
    dialog.getByText(/Se existir uma conta com este email/),
  ).toBeVisible();
  expect(
    state.authRequests.some(
      (request) =>
        request.path.endsWith("/recover") &&
        request.body.email === "ana@example.test",
    ),
  ).toBe(true);
  if (process.env.TEST_CAPTCHA) {
    const tokens = state.authRequests
      .filter(
        (request) =>
          request.path.endsWith("/signup") || request.path.endsWith("/recover"),
      )
      .map(
        (request) =>
          (request.body.gotrue_meta_security as { captcha_token: string })
            .captcha_token,
      );
    expect(tokens).toHaveLength(2);
    expect(tokens.every(Boolean)).toBe(true);
  }
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

test("alteração de palavra-passe pede código quando Auth exige reautenticação", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  const dialog = await openRecovery(page);
  state.requireReauthentication = true;
  await dialog
    .getByLabel("Nova palavra-passe", { exact: true })
    .fill("reauth-password-test");
  await dialog
    .getByRole("button", { name: "Guardar palavra-passe", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Código de confirmação", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/Enviámos um código de confirmação/),
  ).toBeVisible();
  await assertNoOverflow(page);
  await expect(
    dialog.getByRole("button", { name: "Guardar palavra-passe", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("recuperacao-codigo.png"),
    fullPage: true,
  });
  expect(
    state.authRequests.filter((request) =>
      request.path.endsWith("/reauthenticate"),
    ),
  ).toHaveLength(1);
  await dialog
    .getByLabel("Código de confirmação", { exact: true })
    .fill("000000");
  await dialog
    .getByRole("button", { name: "Guardar palavra-passe", exact: true })
    .click();
  await expect(
    dialog.getByText(/O código de confirmação é inválido ou expirou/),
  ).toBeVisible();
  expect(
    state.authRequests.filter((request) =>
      request.path.endsWith("/reauthenticate"),
    ),
  ).toHaveLength(1);
  await dialog
    .getByLabel("Código de confirmação", { exact: true })
    .fill("123456");
  await dialog
    .getByRole("button", { name: "Guardar palavra-passe", exact: true })
    .click();
  await expect(
    page.getByText("Palavra-passe atualizada.", { exact: true }),
  ).toBeVisible();
  expect(
    state.authRequests
      .filter((request) => request.body.password === "reauth-password-test")
      .map((request) => request.body.nonce),
  ).toEqual([undefined, "000000", "123456"]);
});

test(
  "falha ao enviar código permite reenviar sem perder recuperação",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page);
    const dialog = await openRecovery(page);
    state.requireReauthentication = true;
    state.failReauthenticationSend = true;
    await dialog
      .getByLabel("Nova palavra-passe", { exact: true })
      .fill("reauth-password-test");
    await dialog
      .getByRole("button", { name: "Guardar palavra-passe", exact: true })
      .click();
    await expect(
      dialog.getByText(/Não foi possível enviar o código/),
    ).toBeVisible();
    state.failReauthenticationSend = false;
    await dialog
      .getByRole("button", { name: "Enviar novo código", exact: true })
      .click();
    await expect(dialog.getByText(/Enviámos um novo código/)).toBeVisible();
    await expect(
      dialog.getByLabel("Nova palavra-passe", { exact: true }),
    ).toHaveValue("reauth-password-test");
    await publishAuthSession(
      page,
      session(userA, 3600, {
        sessionId: "33333333-3333-4333-8333-333333333333",
      }),
      "SIGNED_IN",
    );
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/A sessão de recuperação mudou/)).toBeVisible();
  },
);

test(
  "mudar de sessão durante envio de reautenticação descarta a conclusão antiga",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page);
    const dialog = await openRecovery(page);
    state.requireReauthentication = true;
    state.delayAuthPath = "/reauthenticate";
    await dialog
      .getByLabel("Nova palavra-passe", { exact: true })
      .fill("discarded-reauth-password-test");
    await dialog
      .getByRole("button", { name: "Guardar palavra-passe", exact: true })
      .click();
    await expect
      .poll(() =>
        state.authRequests.some((request) =>
          request.path.endsWith("/reauthenticate"),
        ),
      )
      .toBe(true);
    await publishAuthSession(
      page,
      session(userA, 3600, {
        sessionId: "33333333-3333-4333-8333-333333333333",
      }),
      "SIGNED_IN",
    );
    await expect(dialog).toBeHidden();
    state.releaseAuth();
    await expect(page.getByText(/A sessão de recuperação mudou/)).toBeVisible();
    await expect(
      page.getByText(/Enviámos um código de confirmação/),
    ).toHaveCount(0);
    expect(
      state.authRequests.filter(
        (request) => request.body.password === "discarded-reauth-password-test",
      ),
    ).toHaveLength(1);
    expect(state.authRequests.some((request) => request.body.nonce)).toBe(
      false,
    );
  },
);
