import { test, expect } from "@playwright/test";
import { selectedPortfolio } from "../../helpers/sidebar-helpers";
import {
  storageKey,
  authKey,
  localJson,
  userA,
  userB,
  session,
  setup,
} from "../../helpers/account/mock-backend";
import { authSurface } from "../../helpers/account/actions";
import {
  requestRecovery,
  openRecovery,
  publishAuthSession,
} from "../../helpers/account/recovery";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test("o parâmetro recovery isolado não autoriza alteração de palavra-passe", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/?recovery=1");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(authSurface(page, "Definir nova palavra-passe")).toHaveCount(0);
  expect(state.authRequests.some((request) => request.body.password)).toBe(
    false,
  );
  expect(new URL(page.url()).searchParams.has("recovery")).toBe(false);
});

test("recuperação PKCE valida o verifier antes de definir palavra-passe", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  await page.goto("/?recovery=1&code=recovery-test-code");
  const dialog = authSurface(page, "Definir nova palavra-passe");
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Nova palavra-passe", { exact: true })
    .fill("recovered-password-test");
  await dialog
    .getByRole("button", { name: "Guardar palavra-passe", exact: true })
    .click();
  await expect(
    page.getByText("Palavra-passe atualizada.", { exact: true }),
  ).toBeVisible();
  const exchange = state.authRequests.find(
    (request) => request.grant === "pkce",
  );
  expect(exchange?.body.auth_code).toBe("recovery-test-code");
  expect(exchange?.body.code_verifier).toBeTruthy();
  expect(
    state.authRequests.some(
      (request) =>
        request.path.endsWith("/user") &&
        request.body.password === "recovered-password-test",
    ),
  ).toBe(true);
  expect(new URL(page.url()).search).toBe("");
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(authSurface(page)).toHaveCount(0);
});

test("confirmação PKCE abre a conta sem autorizar formulário de recuperação", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  const dialog = authSurface(page, "Criar conta");
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
  expect(
    state.authRequests.find((request) => request.path.endsWith("/signup"))?.body
      .code_challenge_method,
  ).toBe("s256");
  await page.goto("/?code=confirmation-test-code&recovery=1");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await expect(authSurface(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
});

test("recuperação PKCE válida não é apagada pela sessão anterior expirada", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  await page.evaluate(
    ({ key, expired }) => localStorage.setItem(key, JSON.stringify(expired)),
    { key: authKey, expired: session(userA, -3600) },
  );
  state.failRefresh = true;
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(authSurface(page, "Definir nova palavra-passe")).toBeVisible();
  expect(
    state.authRequests.some((request) => request.grant === "refresh_token"),
  ).toBe(false);
  expect(
    state.authRequests.filter((request) => request.grant === "pkce"),
  ).toHaveLength(1);
});

test("callback PKCE inválido preserva a renovação da sessão anterior", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.clock.install();
  await page.goto("/?code=unsolicited-code&recovery=1");
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(state.authRequests).toHaveLength(0);
  await page.evaluate(
    ({ key, expired }) => localStorage.setItem(key, JSON.stringify(expired)),
    { key: authKey, expired: session(userA, -3600) },
  );
  await page.clock.fastForward(30_000);
  await expect
    .poll(
      () =>
        state.authRequests.filter(
          (request) => request.grant === "refresh_token",
        ).length,
    )
    .toBe(1);
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
});

test("uma sessão recebida após a troca PKCE não herda o formulário de recuperação", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  // Deterministically place another tab's completed login in the exact gap
  // between releasing the exchange lock and the gateway restoring its session.
  await page.addInitScript(
    ({ authKey, otherSession }) => {
      const locks = navigator.locks;
      const request = locks.request.bind(locks);
      Object.defineProperty(locks, "request", {
        value: async (...args: Parameters<typeof request>) => {
          const result = await request(...args);
          if (
            args[0] === "rendimentos.auth.mutation.v1" &&
            new URL(location.href).pathname === "/"
          )
            localStorage.setItem(authKey, JSON.stringify(otherSession));
          return result;
        },
      });
    },
    { authKey, otherSession: session(userB) },
  );
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(
    selectedPortfolio(page).getByText("Carteira do Bruno", { exact: true }),
  ).toBeVisible();
  await expect(authSurface(page, "Definir nova palavra-passe")).toHaveCount(0);
});

test("renovar o token da mesma sessão conserva a recuperação e usa o token atual", async ({
  page,
}) => {
  const state = await setup(page);
  const dialog = await openRecovery(page);
  await dialog
    .getByLabel("Nova palavra-passe", { exact: true })
    .fill("retained-password-test");
  const expired = session(userA, -3600, { nonce: "expired-rotation" });
  const refreshed = session(userA, 3600, { nonce: "valid-rotation" });
  state.nextTokenSession = refreshed;
  await publishAuthSession(page, expired, "TOKEN_REFRESHED");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel("Nova palavra-passe", { exact: true }),
  ).toHaveValue("retained-password-test");
  await dialog
    .getByRole("button", { name: "Guardar palavra-passe", exact: true })
    .click();
  await expect(
    page.getByText("Palavra-passe atualizada.", { exact: true }),
  ).toBeVisible();
  expect(
    state.authRequests.some((request) => request.grant === "refresh_token"),
  ).toBe(true);
  expect(
    state.authRequests.find(
      (request) => request.body.password === "retained-password-test",
    )?.authorization,
  ).toBe(`Bearer ${refreshed.access_token}`);
});

for (const sessionId of ["33333333-3333-4333-8333-333333333333", ""]) {
  test(`outra sessão do mesmo utilizador invalida a recuperação: ${sessionId || "sem identificador"}`, async ({
    page,
  }) => {
    const state = await setup(page);
    const dialog = await openRecovery(page);
    await dialog
      .getByLabel("Nova palavra-passe", { exact: true })
      .fill("discarded-password-test");
    await publishAuthSession(
      page,
      session(userA, 3600, { sessionId, nonce: "replacement" }),
      "SIGNED_IN",
    );
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/A sessão de recuperação mudou/)).toBeVisible();
    expect(state.authRequests.some((request) => request.body.password)).toBe(
      false,
    );
  });
}

test("revalidar a sessão dentro do lock impede submissão sem evento de mudança", async ({
  page,
}) => {
  const state = await setup(page);
  const dialog = await openRecovery(page);
  await dialog
    .getByLabel("Nova palavra-passe", { exact: true })
    .fill("never-sent-password-test");
  // Another tab has persisted a session, but its event has not reached this tab.
  await page.evaluate(
    ({ key, next }) => localStorage.setItem(key, JSON.stringify(next)),
    {
      key: authKey,
      next: session(userA, 3600, {
        sessionId: "44444444-4444-4444-8444-444444444444",
      }),
    },
  );
  await dialog
    .getByRole("button", { name: "Guardar palavra-passe", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/A sessão de recuperação mudou/)).toBeVisible();
  expect(state.authRequests.some((request) => request.body.password)).toBe(
    false,
  );
});

for (const signedIn of [false, true]) {
  for (const transport of ["fragmento", "query"]) {
    test(`rejeitar sessão por tokens na ligação e preservar sessão anterior: ${signedIn}, ${transport}`, async ({
      page,
    }) => {
      const state = await setup(page, signedIn);
      const attackerSession = session(userB);
      const hash = new URLSearchParams({
        access_token: attackerSession.access_token,
        refresh_token: attackerSession.refresh_token,
        expires_in: "3600",
        token_type: "bearer",
        type: "recovery",
      });
      await page.goto(
        transport === "fragmento"
          ? `/?recovery=1#${hash}`
          : `/?recovery=1&code=discarded-code&${hash}#access_token=discarded-fragment`,
      );
      await expect(
        page.getByText(/Não foi possível validar esta ligação/),
      ).toBeVisible();
      await expect(authSurface(page)).toHaveCount(0);
      if (signedIn) {
        await expect(
          selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key)!).user.id,
            authKey,
          ),
        ).toBe(userA);
      } else {
        await expect(
          page.getByRole("heading", {
            name: "Bem-vindo ao Rendimentos",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: "Copiar carteiras locais para a conta",
            exact: true,
          }),
        ).toHaveCount(0);
        expect(
          await page.evaluate((key) => localStorage.getItem(key), authKey),
        ).toBeNull();
      }
      expect(state.authRequests).toHaveLength(0);
      expect(state.requests).toHaveLength(0);
      expect(new URL(page.url()).hash).toBe("");
      expect(new URL(page.url()).search).toBe("");
      expect(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
      ).toBe(localJson);
    });
  }
  test(`código sem verifier não inicia sessão nem substitui sessão anterior: ${signedIn}`, async ({
    page,
  }) => {
    const state = await setup(page, signedIn);
    await page.goto("/?code=unsolicited-code&recovery=1");
    await expect(
      page.getByText(/Não foi possível validar esta ligação/),
    ).toBeVisible();
    await expect(authSurface(page)).toHaveCount(0);
    expect(state.authRequests).toHaveLength(0);
    expect(new URL(page.url()).search).toBe("");
    if (signedIn)
      await expect(
        selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
      ).toBeVisible();
    else
      expect(
        await page.evaluate((key) => localStorage.getItem(key), authKey),
      ).toBeNull();
  });
}

test("query contaminada rejeita código PKCE válido sem consumir o verifier nem a sessão anterior", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  const prior = session();
  await page.evaluate(
    ({ key, prior }) => localStorage.setItem(key, JSON.stringify(prior)),
    { key: authKey, prior },
  );
  const verifier = await page.evaluate(
    (key) => localStorage.getItem(`${key}-code-verifier`),
    authKey,
  );
  expect(verifier).toBeTruthy();
  const beforeAuth = state.authRequests.length;
  await page.goto(
    "/?preservar=1&code=recovery-test-code&recovery=1&access_token=synthetic&refresh_token=synthetic",
  );
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(authSurface(page, "Definir nova palavra-passe")).toHaveCount(0);
  expect(state.authRequests).toHaveLength(beforeAuth);
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(`${key}-code-verifier`),
      authKey,
    ),
  ).toBe(verifier);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).access_token,
      authKey,
    ),
  ).toBe(prior.access_token);
  expect(new URL(page.url()).search).toBe("?preservar=1");
  expect(new URL(page.url()).hash).toBe("");
});

test("código com verifier incorreto é rejeitado sem alterar carteiras", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        `${key}-code-verifier`,
        JSON.stringify("wrong-verifier/recovery"),
      ),
    authKey,
  );
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(authSurface(page)).toHaveCount(0);
  expect(
    state.authRequests.filter((request) => request.grant === "pkce"),
  ).toHaveLength(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), authKey),
  ).toBeNull();
  expect(state.requests).toHaveLength(0);
});
