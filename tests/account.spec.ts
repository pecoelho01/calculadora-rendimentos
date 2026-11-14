import { confirmCsvReview } from "./csv-helpers";
import { openSidebar, navigateTo, selectedPortfolio } from "./sidebar-helpers";
import { test, expect, type Page, type Route } from "@playwright/test";
import type { Portfolio } from "../src/lib/types";
import type { AccountSnapshot, AccountWrite } from "../src/lib/account";

// UI contract tests mock our Auth API. Cookie encryption, PKCE and Supabase
// transport are exercised separately by auth-server.test.ts.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

const storageKey = "rendimentos.portfolios.v1";
const entryKey = "rendimentos.entry.local.v1";
const authChannel = "rendimentos.auth.session.v1";
const localPortfolio: Portfolio = {
  id: "local-original",
  name: "Carteira do navegador",
  currency: "EUR",
  orders: [],
};
const localJson = JSON.stringify({ version: 1, portfolios: [localPortfolio] });
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
function session(
  id = userA,
  lifetime = 3600,
  options: { sessionId?: string; nonce?: string } = {},
) {
  return {
    user: {
      id,
      email: id === userA ? "ana@example.test" : "bruno@example.test",
    },
    sessionKey: options.sessionId ?? id,
    recovery: false,
    expiresAt: Math.floor(Date.now() / 1000) + lifetime,
    nonce: options.nonce ?? "initial",
  };
}
type MockSession = ReturnType<typeof session>;
const authStates = new WeakMap<Page, { currentSession: MockSession | null }>();
function publicSession(value: MockSession | null) {
  return (
    value && {
      user: value.user,
      sessionKey: value.sessionKey,
      recovery: value.recovery,
    }
  );
}
function remote(name = "Carteira da Ana", id = "remote-a"): AccountSnapshot {
  return {
    version: 1,
    portfolios: [
      { portfolio: { id, name, currency: "EUR", orders: [] }, revision: 3 },
    ],
  };
}
async function setup(
  page: Page,
  signedIn: boolean | "expired" = false,
  autoCaptcha = true,
) {
  const accounts: Record<string, AccountSnapshot> = {
    [userA]: remote(),
    [userB]: remote("Carteira do Bruno", "remote-b"),
  };
  const requests: AccountWrite[] = [];
  const authRequests: {
    path: string;
    body: Record<string, unknown>;
    grant: string | null;
    authorization: string;
  }[] = [];
  const pkceFlows = new Map<string, { recovery: boolean; id: string }>();
  const receipts = new Set<string>();
  const state = {
    currentSession: signedIn
      ? session(userA, signedIn === "expired" ? -3600 : 3600)
      : (null as MockSession | null),
    invalidVerifier: false,
    afterCallbackSession: null as MockSession | null,
    requireReauthentication: false,
    failReauthenticationSend: false,
    failNextLogin: false,
    failNextWrite: 0,
    delayNextWrite: false,
    releaseWrite: () => {},
    delayRefresh: false,
    releaseRefresh: () => {},
    failRefresh: false,
    delayAuthPath: "",
    releaseAuth: () => {},
    nextTokenSession: null as ReturnType<typeof session> | null,
    accountReads: 0,
    marketRequests: 0,
    accounts,
    requests,
    authRequests,
  };
  authStates.set(page, state);
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `(() => {
      let next = 0;
      const widgets = new Map();
      const mock = window.__captchaMock = {
        active: null,
        issue() { mock.active?.callback('captcha-test-' + (++next)); },
        expire() { mock.active?.['expired-callback'](); },
        fail() { mock.active?.['error-callback'](); },
        timeout() { mock.active?.['timeout-callback'](); }
      };
      window.turnstile = {
        render(container, options) {
          const id = String(++next); widgets.set(id, options); mock.active = options;
          container.textContent = 'Verificação de segurança simulada';
          // Match Cloudflare's documented widget footprint for responsive checks.
          container.style.width = options.size === 'compact' ? '150px' : '100%';
          container.style.minWidth = options.size === 'compact' ? '150px' : '300px';
          container.style.height = options.size === 'compact' ? '140px' : '65px';
          ${autoCaptcha ? "queueMicrotask(() => options.callback('captcha-test-' + (++next)));" : ""}
          return id;
        },
        remove(id) { if (mock.active === widgets.get(id)) mock.active = null; widgets.delete(id); }
      };
    })();`,
      }),
  );
  await page.addInitScript(
    ({ key, json }) => {
      localStorage.setItem(key, json);
    },
    { key: storageKey, json: localJson },
  );
  await page.route("**/api/market?*", (route) => {
    state.marketRequests++;
    return route.fulfill({ json: { assets: {} } });
  });
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({ json: { geographies: {} } }),
  );
  function respondToAuthRequest(
    route: Route,
    status = 200,
    extra: Record<string, unknown> = {},
  ) {
    return route.fulfill({
      status,
      json: {
        configured: true,
        session: publicSession(state.currentSession),
        ...extra,
      },
    });
  }

  function rejectAuthRequest(route: Route, code: string, status = 400) {
    return respondToAuthRequest(route, status, { error: code, code });
  }

  async function refreshMockSession(route: Route) {
    if (state.delayRefresh)
      await new Promise<void>((resolve) => {
        state.releaseRefresh = resolve;
      });
    if (state.failRefresh) {
      state.currentSession = null;
      return rejectAuthRequest(route, "session-expired", 401);
    }
    const previous = state.currentSession!;
    state.currentSession = state.nextTokenSession ?? {
      ...previous,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    state.nextTokenSession = null;
    return respondToAuthRequest(route);
  }

  function completeMockCallback(route: Route, body: Record<string, unknown>) {
    const flow = pkceFlows.get(String(body.code));
    if (!flow || state.invalidVerifier)
      return rejectAuthRequest(route, "invalid_callback");
    pkceFlows.delete(String(body.code));
    state.currentSession = { ...session(flow.id), recovery: flow.recovery };
    // Capture the callback response before simulating a later session change.
    const result = respondToAuthRequest(route);
    if (state.afterCallbackSession) {
      state.currentSession = state.afterCallbackSession;
      state.afterCallbackSession = null;
    }
    return result;
  }

  function recoveryRequestFailure(
    operation: string,
    body: Record<string, unknown>,
  ): { code: string; status: number } | null {
    if (
      !state.currentSession?.recovery ||
      (body.sessionKey && body.sessionKey !== state.currentSession.sessionKey)
    )
      return { code: "session-changed", status: 401 };
    if (operation === "reauthenticate" && state.failReauthenticationSend)
      return { code: "over_email_send_rate_limit", status: 429 };
    if (operation !== "password" || !state.requireReauthentication) return null;
    if (!body.nonce) return { code: "reauthentication_needed", status: 401 };
    if (body.nonce !== "123456")
      return { code: "reauthentication_not_valid", status: 401 };
    return null;
  }

  function performMockAuthOperation(
    route: Route,
    operation: string,
    body: Record<string, unknown>,
  ) {
    if (operation === "login") {
      if (state.failNextLogin) {
        state.failNextLogin = false;
        return rejectAuthRequest(route, "invalid_credentials");
      }
      state.currentSession =
        state.nextTokenSession ??
        session(body.email === "bruno@example.test" ? userB : userA);
      state.nextTokenSession = null;
    } else if (operation === "register" || operation === "recover") {
      pkceFlows.set(
        operation === "register"
          ? "confirmation-test-code"
          : "recovery-test-code",
        { recovery: operation === "recover", id: userA },
      );
    } else if (operation === "callback") {
      return completeMockCallback(route, body);
    } else if (operation === "password" || operation === "reauthenticate") {
      const failure = recoveryRequestFailure(operation, body);
      if (failure)
        return rejectAuthRequest(route, failure.code, failure.status);
      if (operation === "password") state.currentSession!.recovery = false;
    } else if (operation === "logout") state.currentSession = null;
    return respondToAuthRequest(route);
  }

  async function handleAuthRequest(route: Route) {
    const request = route.request();
    const operation = new URL(request.url()).pathname.split("/").at(-1)!;
    const body = (request.postData() ? request.postDataJSON() : {}) as Record<
      string,
      unknown
    >;
    const aliases: Record<string, string> = {
      login: "/token",
      register: "/signup",
      callback: "/token",
      password: "/user",
    };
    const grants: Record<string, string> = {
      login: "password",
      callback: "pkce",
    };
    let path = aliases[operation] ?? `/${operation}`;
    let grant: string | null = grants[operation] ?? null;
    if (operation === "session" || operation === "refresh") {
      if (
        !state.currentSession ||
        state.currentSession.expiresAt > Date.now() / 1000
      )
        return respondToAuthRequest(route);
      path = "/token";
      grant = "refresh_token";
    }
    authRequests.push({
      path,
      body,
      grant,
      authorization: state.currentSession?.sessionKey ?? "",
    });
    if (state.delayAuthPath && path.endsWith(state.delayAuthPath)) {
      state.delayAuthPath = "";
      await new Promise<void>((resolve) => {
        state.releaseAuth = resolve;
      });
    }
    if (grant === "refresh_token") return refreshMockSession(route);
    return performMockAuthOperation(route, operation, body);
  }

  function applyAccountWrite(id: string, write: AccountWrite) {
    const snapshot = structuredClone(accounts[id]);
    if (write.migration) {
      const receipt = `${id}:${write.migration.key}`;
      if (!receipts.has(receipt)) {
        snapshot.portfolios.push(
          ...write.migration.portfolios.map((portfolio) => ({
            portfolio: { ...portfolio, id: `import-${portfolio.id}` },
            revision: 1,
          })),
        );
        receipts.add(receipt);
      }
      return snapshot;
    }
    // Validate the complete batch before changing any portfolio revision.
    for (const change of write.changes) {
      const existing = snapshot.portfolios.find(
        (record) => record.portfolio.id === change.id,
      );
      if ((existing?.revision ?? null) !== change.expectedRevision) return null;
    }
    for (const change of write.changes) {
      const index = snapshot.portfolios.findIndex(
        (record) => record.portfolio.id === change.id,
      );
      if (!change.portfolio) snapshot.portfolios.splice(index, 1);
      else if (index >= 0)
        snapshot.portfolios[index] = {
          portfolio: change.portfolio,
          revision: snapshot.portfolios[index].revision + 1,
        };
      else
        snapshot.portfolios.push({
          portfolio: change.portfolio,
          revision: 1,
        });
    }
    return snapshot;
  }

  async function handleAccountRequest(route: Route) {
    const request = route.request();
    const current = state.currentSession;
    const id = current?.user.id ?? "";
    if (
      !accounts[id] ||
      request.headers()["x-account-session"] !== current?.sessionKey
    ) {
      await route.fulfill({ status: 401, json: { error: "Sessão inválida" } });
      return;
    }
    if (request.method() === "GET") state.accountReads++;
    if (request.method() === "POST") {
      const write = request.postDataJSON() as AccountWrite;
      requests.push(write);
      if (state.delayNextWrite) {
        state.delayNextWrite = false;
        await new Promise<void>((resolve) => {
          state.releaseWrite = resolve;
        });
      }
      if (state.failNextWrite) {
        const status = state.failNextWrite;
        state.failNextWrite = 0;
        await route.fulfill({ status, json: { error: "Falha controlada" } });
        return;
      }
      const snapshot = applyAccountWrite(id, write);
      if (!snapshot) {
        await route.fulfill({ status: 409, json: { error: "Conflito" } });
        return;
      }
      accounts[id] = snapshot;
    }
    await route.fulfill({
      json: accounts[id],
      headers: { "Cache-Control": "no-store" },
    });
  }

  await page.route("**/api/auth/*", handleAuthRequest);
  await page.route("**/api/account", handleAccountRequest);
  return state;
}
async function openAccountSettings(page: Page) {
  // The loading screen also uses .entry-page; wait before deciding to skip navigation.
  await expect(page.locator('.entry-page[aria-busy="true"]')).toBeHidden();
  if (
    new URL(page.url()).pathname === "/conta" ||
    (await page.locator(".entry-page").count())
  )
    return;
  await openSidebar(page);
  await page
    .getByRole("link", { name: "Definições da conta", exact: true })
    .click();
  await expect(page).toHaveURL(/\/conta$/);
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
}
async function accountAction(page: Page, name: string) {
  await openAccountSettings(page);
  await page
    .locator(".account-actions")
    .getByRole("button", { name, exact: true })
    .click();
  if (name !== "Sair da conta") {
    await page
      .getByRole("link", { name: "Voltar às carteiras", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
}
function authSurface(page: Page, title?: string) {
  const surface = page.locator(".entry-auth-card, dialog.auth-dialog");
  return title
    ? surface.filter({
        has: page.getByRole("heading", { name: title, exact: true }),
      })
    : surface;
}
async function login(
  page: Page,
  email = "ana@example.test",
  waitForCompletion = true,
) {
  if (await page.locator(".app-shell").count()) await openSidebar(page);
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const dialog = authSurface(page, "Iniciar sessão");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog
    .getByLabel("Palavra-passe", { exact: true })
    .fill("password-test");
  await dialog
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  if (waitForCompletion) {
    await expect(dialog).toBeHidden();
    if (new URL(page.url()).pathname === "/conta") {
      await page
        .getByRole("link", { name: "Voltar às carteiras", exact: true })
        .click();
      await expect(page).toHaveURL(/\/$/);
    }
  }
}
async function rename(page: Page, oldName: string, nextName: string) {
  await openSidebar(page);
  await page
    .getByRole("button", { name: `Renomear carteira ${oldName}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Renomear carteira",
    exact: true,
  });
  await dialog.getByLabel("Nome da carteira").fill(nextName);
  await dialog
    .getByRole("button", { name: "Guardar nome", exact: true })
    .click();
}
async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

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

test("gravar espera pela confirmação da conta, incrementa revisão e não grava localmente", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.delayNextWrite = true;
  await rename(page, "Carteira da Ana", "Conta atualizada");
  await expect(page.getByText("A guardar…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Renomear carteira" }),
  ).toBeVisible();
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].changes[0].expectedRevision).toBe(3);
  state.releaseWrite();
  await expect(
    page.getByRole("dialog", { name: "Renomear carteira" }),
  ).toBeHidden();
  await expect(
    selectedPortfolio(page).getByText("Conta atualizada", { exact: true }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios[0].revision).toBe(4);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await page.reload();
  await expect(
    selectedPortfolio(page).getByText("Conta atualizada", { exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
});

test("conflito entre dispositivos preserva dados e exige recarga explícita", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.accounts[userA].portfolios[0] = {
    portfolio: {
      ...state.accounts[userA].portfolios[0].portfolio,
      name: "Alterada noutro dispositivo",
    },
    revision: 4,
  };
  await rename(page, "Carteira da Ana", "Alteração antiga");
  await expect(
    page.getByText(/Esta carteira foi alterada noutro dispositivo/),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Renomear carteira" }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
    "Alterada noutro dispositivo",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await accountAction(page, "Recarregar dados da conta");
  await expect(
    selectedPortfolio(page).getByText("Alterada noutro dispositivo", {
      exact: true,
    }),
  ).toBeVisible();
  await rename(page, "Alterada noutro dispositivo", "Nova tentativa");
  await expect(
    selectedPortfolio(page).getByText("Nova tentativa", { exact: true }),
  ).toBeVisible();
  expect(state.requests[1].changes[0].expectedRevision).toBe(4);
});

test("falha de gravação mantém diálogo e valores confirmados", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.failNextWrite = 503;
  await rename(page, "Carteira da Ana", "Não guardada");
  await expect(
    page.getByText("Erro ao guardar ou carregar", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByLabel("Nome da carteira"),
  ).toHaveValue("Não guardada");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios[0].revision).toBe(3);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
});

test("migração local explícita é repetível e conserva dados dos dois modos", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await accountAction(page, "Copiar carteiras locais para a conta");
  expect(state.requests).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await accountAction(page, "Copiar carteiras locais para a conta");
  await expect(page.locator(".portfolio-row")).toHaveCount(2);
  expect(state.requests[0].changes).toEqual([]);
  expect(state.requests[0].migration?.key).toMatch(/^[a-f0-9]{64}$/);
  expect(state.requests[0].migration?.portfolios).toEqual([localPortfolio]);
  page.once("dialog", (dialog) => dialog.accept());
  await accountAction(page, "Copiar carteiras locais para a conta");
  await expect.poll(() => state.requests.length).toBe(2);
  await expect(
    page.getByText(/Carteiras locais copiadas para a conta/),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(2);
  expect(state.requests[1].migration?.key).toBe(
    state.requests[0].migration?.key,
  );
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
    "Carteira da Ana",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await assertNoOverflow(page);
});

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
      .map((request) => request.body.captchaToken);
    expect(tokens).toHaveLength(2);
    expect(tokens.every(Boolean)).toBe(true);
  }
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

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

test("resposta pendente da conta não volta a apresentar dados depois de sair", async ({
  page,
}) => {
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
  await expect(page.getByText("Resposta antiga", { exact: true })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
});

async function requestRecovery(page: Page) {
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  await authSurface(page)
    .getByRole("button", { name: "Esqueci a palavra-passe", exact: true })
    .click();
  const dialog = authSurface(page, "Recuperar acesso");
  await dialog.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await dialog
    .getByRole("button", { name: "Enviar ligação", exact: true })
    .click();
  await expect(
    dialog.getByText(/Se existir uma conta com este email/),
  ).toBeVisible();
}

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
  expect(exchange?.body.code).toBe("recovery-test-code");
  expect(exchange?.body.code_verifier).toBeUndefined();
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
      .code_verifier,
  ).toBeUndefined();
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
  state.currentSession = {
    ...state.currentSession!,
    expiresAt: Math.floor(Date.now() / 1000) - 3600,
  };
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
  expect(
    state.authRequests.filter((request) => request.grant === "pkce"),
  ).toHaveLength(1);
  state.currentSession = {
    ...state.currentSession!,
    expiresAt: Math.floor(Date.now() / 1000) - 3600,
  };
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
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  state.afterCallbackSession = session(userB);
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(
    selectedPortfolio(page).getByText("Carteira do Bruno", { exact: true }),
  ).toBeVisible();
  await expect(authSurface(page, "Definir nova palavra-passe")).toHaveCount(0);
});

async function openRecovery(page: Page) {
  await page.goto("/");
  await requestRecovery(page);
  await page.goto("/?code=recovery-test-code&recovery=1");
  const dialog = authSurface(page, "Definir nova palavra-passe");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function publishAuthSession(
  page: Page,
  next: MockSession,
  event: "TOKEN_REFRESHED" | "SIGNED_IN",
) {
  const state = authStates.get(page)!;
  state.currentSession = {
    ...next,
    recovery:
      event === "TOKEN_REFRESHED"
        ? (state.currentSession?.recovery ?? false)
        : false,
  };
  await page.evaluate(
    ({ channel, event }) => {
      const writer = new BroadcastChannel(channel);
      writer.postMessage({ event });
      writer.close();
    },
    { channel: authChannel, event },
  );
}

test("renovar o token da mesma sessão conserva a recuperação e usa o token atual", async ({
  page,
}) => {
  const state = await setup(page);
  const dialog = await openRecovery(page);
  await dialog
    .getByLabel("Nova palavra-passe", { exact: true })
    .fill("retained-password-test");
  const expired = session(userA, -3600, { nonce: "expired-rotation" });
  const refreshed = {
    ...session(userA, 3600, { nonce: "valid-rotation" }),
    recovery: true,
  };
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
  ).toBe(refreshed.sessionKey);
});

for (const sessionId of [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
]) {
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
  state.currentSession = session(userA, 3600, {
    sessionId: "44444444-4444-4444-8444-444444444444",
  });
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
        access_token: `synthetic-${attackerSession.sessionKey}`,
        refresh_token: "synthetic-refresh",
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
        expect(state.currentSession?.user.id).toBe(userA);
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
        expect(state.currentSession).toBeNull();
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
    expect(
      state.authRequests.filter((request) => request.grant === "pkce"),
    ).toHaveLength(1);
    expect(new URL(page.url()).search).toBe("");
    if (signedIn)
      await expect(
        selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
      ).toBeVisible();
    else expect(state.currentSession).toBeNull();
  });
}

test("query contaminada rejeita código PKCE válido sem consumir o verifier nem a sessão anterior", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  const prior = session();
  state.currentSession = prior;
  const beforeAuth = state.authRequests.length;
  await page.goto(
    "/?preservar=1&code=recovery-test-code&recovery=1&access_token=synthetic&refresh_token=synthetic",
  );
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(authSurface(page, "Definir nova palavra-passe")).toHaveCount(0);
  expect(state.authRequests).toHaveLength(beforeAuth);
  expect(state.currentSession).toEqual(prior);
  expect(new URL(page.url()).search).toBe("?preservar=1");
  expect(new URL(page.url()).hash).toBe("");
  // The rejected URL must not consume the pending recovery flow.
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(authSurface(page, "Definir nova palavra-passe")).toBeVisible();
});

test("código com verifier incorreto é rejeitado sem alterar carteiras", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await requestRecovery(page);
  state.invalidVerifier = true;
  await page.goto("/?code=recovery-test-code&recovery=1");
  await expect(
    page.getByText(/Não foi possível validar esta ligação/),
  ).toBeVisible();
  await expect(authSurface(page)).toHaveCount(0);
  expect(
    state.authRequests.filter((request) => request.grant === "pkce"),
  ).toHaveLength(1);
  expect(state.currentSession).toBeNull();
  expect(state.requests).toHaveLength(0);
});

test("login pendente bloqueia fecho, Escape e reentrada até concluir", async ({
  page,
}) => {
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
});

test("pedidos Auth noutro separador não ultrapassam um login pendente", async ({
  page,
  context,
}) => {
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
});

test("recuperar, alterar palavra-passe e sair mantêm os pedidos pendentes protegidos", async ({
  page,
}) => {
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
    page.getByRole("button", { name: "Abrir carteiras da conta", exact: true }),
  ).toBeDisabled();
  state.releaseAuth();
  await expect(
    page.getByRole("button", { name: "Iniciar sessão", exact: true }),
  ).toBeEnabled();
});

for (const storedSession of [false, true, "expired"] as const) {
  test(`sem Web Locks não enviar credenciais, incluindo renovação: ${storedSession}`, async ({
    page,
  }) => {
    const state = await setup(page, storedSession);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "locks", { value: undefined }),
    );
    await page.goto("/");
    await login(page, "ana@example.test", false);
    await expect(
      page.getByText(/Este navegador não permite proteger os pedidos da conta/),
    ).toBeVisible();
    expect(state.authRequests).toHaveLength(0);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Continuar sem sessão", exact: true })
      .click();
    await expect(
      selectedPortfolio(page).getByText(localPortfolio.name, { exact: true }),
    ).toBeVisible();
  });
}

test("sessão expirada não renova com o lock ocupado e permite tentar novamente", async ({
  page,
}) => {
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
  await expect(page.getByText(/Há um pedido de conta em curso/)).toBeVisible();
  expect(state.authRequests).toHaveLength(0);
  expect(state.accountReads).toBe(0);
  await page.evaluate(() =>
    (window as unknown as { releaseAuthAudit: () => void }).releaseAuthAudit(),
  );
  await login(page);
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(
    state.authRequests.filter((request) => request.grant === "refresh_token"),
  ).toHaveLength(0);
});

test("renovação por temporizador e foco respeita um lock noutro separador", async ({
  page,
  context,
}) => {
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
  state.currentSession = {
    ...state.currentSession!,
    expiresAt: Math.floor(Date.now() / 1000) - 3600,
  };
  await page.clock.fastForward(30_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(state.authRequests).toHaveLength(0);
  await other.evaluate(() =>
    (window as unknown as { releaseAuthAudit: () => void }).releaseAuthAudit(),
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
});

test("temporizador não renova durante logout nem restaura a sessão depois", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.clock.install();
  await page.goto("/");
  await expect(selectedPortfolio(page)).toBeVisible();
  state.delayAuthPath = "/logout";
  await accountAction(page, "Sair da conta");
  await expect
    .poll(() =>
      state.authRequests.some((request) => request.path.endsWith("/logout")),
    )
    .toBe(true);
  state.currentSession = {
    ...state.currentSession!,
    expiresAt: Math.floor(Date.now() / 1000) - 3600,
  };
  await page.clock.fastForward(30_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(
    state.authRequests.filter((request) => request.grant === "refresh_token"),
  ).toHaveLength(0);
  state.releaseAuth();
  await expect.poll(() => state.currentSession).toBeNull();
  await page.clock.fastForward(60_000);
  expect(
    state.authRequests.filter((request) => request.grant === "refresh_token"),
  ).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Sair da conta", exact: true }),
  ).toHaveCount(0);
});

test("renovação pendente mantém o lock até persistir e bloqueia logout concorrente", async ({
  page,
  context,
}) => {
  const state = await setup(page, true);
  await page.clock.install();
  await page.goto("/");
  await expect(selectedPortfolio(page)).toBeVisible();
  const other = await context.newPage();
  await other.goto("/icon.svg");
  state.delayRefresh = true;
  state.currentSession = {
    ...state.currentSession!,
    expiresAt: Math.floor(Date.now() / 1000) - 3600,
  };
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
    .poll(
      () =>
        !!state.currentSession &&
        state.currentSession.expiresAt > Date.now() / 1000,
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
  await expect.poll(() => state.currentSession).toBeNull();
  await page.clock.fastForward(60_000);
  expect(state.currentSession).toBeNull();
  await other.close();
});

test("respostas incluem proteção contra enquadramento e fuga de referrer", async ({
  request,
}) => {
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
});

test("abrir definições aguarda o restauro inicial da sessão", async ({
  page,
}) => {
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
  await expect(page).toHaveURL(/\/conta$/);
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
});

test("conta vazia permite criar a primeira carteira sem copiar dados locais", async ({
  page,
}, testInfo) => {
  const state = await setup(page, true);
  state.accounts[userA] = { version: 1, portfolios: [] };
  await page.goto("/");
  await openAccountSettings(page);
  await expect(
    page.getByRole("button", {
      name: "Copiar carteiras locais para a conta",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("link", { name: "Voltar às carteiras", exact: true })
    .click();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adicionar transação", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nova transação", exact: true }),
  ).toBeDisabled();
  await assertNoOverflow(page);
  const noticeText = await page
    .locator(".account-empty-notice > span")
    .boundingBox();
  const noticeButton = await page
    .locator(".account-empty-notice .button")
    .boundingBox();
  expect(noticeText && noticeButton).toBeTruthy();
  expect(
    noticeText!.x + noticeText!.width <= noticeButton!.x ||
      noticeText!.y + noticeText!.height <= noticeButton!.y,
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("conta-vazia.png"),
    fullPage: true,
  });
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nova transação", exact: true }),
  ).toHaveCount(0);
  const dialog = page.getByRole("dialog", {
    name: "Criar carteira",
    exact: true,
  });
  await dialog
    .getByLabel("Nome da carteira")
    .fill("Primeira carteira na conta");
  await dialog
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    selectedPortfolio(page).getByText("Primeira carteira na conta", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.requests[0].changes).toHaveLength(1);
  expect(state.requests[0].changes[0].expectedRevision).toBe(null);
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .click();
  const orderDialog = page.getByRole("dialog", {
    name: "Nova transação",
    exact: true,
  });
  await expect(orderDialog).toBeVisible();
  await orderDialog.getByLabel("Ticker Yahoo").fill("TEST");
  await orderDialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await orderDialog.getByLabel("Preço por unidade").fill("100");
  await orderDialog
    .getByRole("button", { name: "Guardar transação", exact: true })
    .click();
  await expect(orderDialog).toBeHidden();
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(1);
  expect(state.accounts[userA].portfolios[0].revision).toBe(2);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await assertNoOverflow(page);
});

test("eliminar a última carteira da conta mantém a conta vazia após confirmação e recarga", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.delayNextWrite = true;
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".data-actions summary").click();
  await page
    .locator(".data-actions")
    .getByRole("button", { name: "Eliminar carteira", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].changes).toEqual([
    { id: "remote-a", portfolio: null, expectedRevision: 3 },
  ]);
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.releaseWrite();
  await expect(
    page.getByText("A tua conta ainda não tem carteiras.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  expect(state.accounts[userA].portfolios).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Criar a primeira carteira",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adicionar transação", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Criar carteira",
    exact: true,
  });
  await dialog
    .getByLabel("Nome da carteira")
    .fill("Nova carteira após eliminação");
  await dialog
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    selectedPortfolio(page).getByText("Nova carteira após eliminação", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  await assertNoOverflow(page);
});

test("recarregar conta limpa as pesquisas de todos os separadores e preserva os títulos", async ({
  page,
}) => {
  const state = await setup(page, true);
  state.accounts[userA].portfolios[0].portfolio.orders = [
    {
      id: "buy-test",
      date: "2024-01-01",
      ticker: "TEST",
      name: "Teste",
      pricebuy: 100,
      shares: 10,
      type: "buy",
    },
  ];
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  for (const tab of (page.viewportSize()?.width ?? 1440) <= 800
    ? ["Posições", "Transações"]
    : ["Visão geral", "Posições", "Transações"]) {
    await navigateTo(page, new RegExp(`^${tab}`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(`^${tab}$`, "i"),
      }),
    ).toBeVisible();
    await search.fill("sem resultado");
  }
  await accountAction(page, "Recarregar dados da conta");
  await expect(search).toHaveValue("");
  for (const tab of (page.viewportSize()?.width ?? 1440) <= 800
    ? ["Posições", "Transações"]
    : ["Visão geral", "Posições", "Transações"]) {
    await navigateTo(page, new RegExp(`^${tab}`));
    await expect(search).toHaveValue("");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  }
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

for (const conflict of [false, true]) {
  test(`remover pela tabela de transações da conta aguarda confirmação e preserva conflitos: ${conflict}`, async ({
    page,
  }) => {
    const state = await setup(page, true);
    state.accounts[userA].portfolios[0].portfolio.orders = [
      {
        id: "buy-first",
        date: "2024-01-01",
        ticker: "TEST",
        name: "Teste",
        pricebuy: 100,
        shares: 10,
        type: "buy",
      },
      {
        id: "buy-second",
        date: "2024-01-02",
        ticker: "TEST",
        name: "Teste",
        pricebuy: 120,
        shares: 2,
        type: "buy",
      },
    ];
    await page.goto("/");
    await navigateTo(page, "Transações");
    const rows = page.locator(".transactions-table tbody tr");
    await expect(rows).toHaveCount(2);
    await page.getByRole("button", { name: "Compras 2", exact: true }).click();
    await page.getByRole("textbox", { name: "Pesquisar ativo" }).fill("TEST");
    await page
      .getByLabel("Ver detalhes de TEST de 2024-01-02", { exact: true })
      .click();
    if (conflict) state.accounts[userA].portfolios[0].revision = 4;
    state.delayNextWrite = true;
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Remover TEST de 2024-01-02", exact: true })
      .click();
    await expect.poll(() => state.requests.length).toBe(1);
    await expect(page.getByText("A guardar…", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(2);
    expect(state.requests[0].changes[0].expectedRevision).toBe(3);
    expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(
      2,
    );
    state.releaseWrite();
    if (conflict) {
      await expect(
        page.getByText(/Esta carteira foi alterada noutro dispositivo/),
      ).toBeVisible();
      await expect(rows).toHaveCount(2);
      expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(
        2,
      );
      await accountAction(page, "Recarregar dados da conta");
      await expect(
        page.getByRole("textbox", { name: "Pesquisar ativo" }),
      ).toHaveValue("");
    } else {
      await expect(rows).toHaveCount(1);
      expect(
        state.accounts[userA].portfolios[0].portfolio.orders.map(
          (order) => order.id,
        ),
      ).toEqual(["buy-first"]);
      expect(state.accounts[userA].portfolios[0].revision).toBe(4);
    }
    await expect(rows).toHaveCount(conflict ? 2 : 1);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
    await assertNoOverflow(page);
  });
}

test("CSV remoto é atómico, conserva ordem no mesmo dia e só envia tickers/data ao mercado", async ({
  page,
}) => {
  const state = await setup(page, true);
  const marketRequests: URL[] = [];
  const geographyRequests: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/market?"))
      marketRequests.push(new URL(request.url()));
    if (request.url().includes("/api/geography?"))
      geographyRequests.push(new URL(request.url()));
  });
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  const csv =
    "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-01,TEST,Teste,120,3,sell";
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "ordens.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect
    .poll(() => state.accounts[userA].portfolios[0].portfolio.orders.length)
    .toBe(2);
  expect(
    state.accounts[userA].portfolios[0].portfolio.orders.map(
      (order) => order.type,
    ),
  ).toEqual(["buy", "sell"]);
  expect(state.requests[0].changes[0].expectedRevision).toBe(3);
  await expect.poll(() => marketRequests.length).toBeGreaterThan(0);
  expect([...marketRequests[0].searchParams.keys()].sort()).toEqual([
    "start",
    "tickers",
  ]);
  expect(marketRequests[0].searchParams.get("tickers")).toBe("TEST");
  await expect.poll(() => geographyRequests.length).toBeGreaterThan(0);
  for (const url of geographyRequests) {
    expect([...url.searchParams.keys()]).toEqual(["tickers"]);
    expect(url.searchParams.get("tickers")).toBe("TEST");
  }
  const invalid =
    "date,ticker,name,pricebuy,shares,type\n2024-01-02,TEST,Teste,120,8,sell\n2024-01-03,TEST,Teste,120,1,buy";
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "venda-invalida.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(invalid),
    });
  await expect(
    page.getByText(/venda superior à posição disponível/),
  ).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(2);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
});

test("restauro JSON na conta valida todas as carteiras antes do lote com revisões", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  const restored: Portfolio = {
    id: "backup-one",
    name: "Carteira restaurada",
    currency: "USD",
    orders: [],
  };
  const invalid = JSON.stringify({
    version: 1,
    portfolios: [
      restored,
      { ...restored, id: "backup-two", currency: "INVALID" },
    ],
  });
  await page
    .getByLabel("Restaurar cópia de segurança", { exact: true })
    .setInputFiles({
      name: "invalido.json",
      mimeType: "application/json",
      buffer: Buffer.from(invalid),
    });
  await expect(
    page.getByText("Carteira inválida.", { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(0);
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
    "Carteira da Ana",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Restaurar cópia de segurança", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ version: 1, portfolios: [restored] }),
      ),
    });
  await expect(
    selectedPortfolio(page).getByText(restored.name, { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0].changes).toEqual(
    expect.arrayContaining([
      { id: "remote-a", portfolio: null, expectedRevision: 3 },
      { id: restored.id, portfolio: restored, expectedRevision: null },
    ]),
  );
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
});

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

test("restaurar uma sessão válida aguarda Auth sem abrir carteiras locais", async ({
  page,
}) => {
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
});

test("sessão expirada e refresh inválido devolvem a escolha sem montar carteiras", async ({
  page,
}) => {
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
});

test("login pode ser repetido após falhar a recuperação da sessão expirada", async ({
  page,
}) => {
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

test("preservar tema entre entrada, conta, modo local e saída", async ({
  page,
}, testInfo) => {
  await setup(page);
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
    page.getByRole("button", { name: "Ativar tema claro", exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("conta-tema-escuro.png"),
    fullPage: true,
  });
  await accountAction(page, "Usar modo local");
  await expect(page.locator(".local-badge")).toContainText("Modo local");
  await expect(
    page.getByRole("button", { name: "Ativar tema claro", exact: true }),
  ).toBeVisible();
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
  await login(page);
  await openAccountSettings(page);
  await expect(page.locator(".account-controls")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".local-badge")).toContainText("Modo conta");
  await assertNoOverflow(page);
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
  await expect(page).toHaveURL(/\/conta$/);
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
  await expect(page).toHaveURL(/\/$/);
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
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Posições", exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
});

for (const localMode of [false, true]) {
  test(`terminar sessão diretamente na sidebar preserva carteiras locais: modo local ${localMode}`, async ({
    page,
  }) => {
    const state = await setup(page, true);
    await page.goto("/");
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
    await expect.poll(() => state.currentSession).toBeNull();
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
  await expect(page).toHaveURL(/\/conta$/);
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

test("revisão CSV da conta aguarda confirmação e conserva edições perante conflito", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  const upload = async (date: string) => {
    await page
      .getByLabel("Importar ficheiro CSV", { exact: true })
      .setInputFiles({
        name: "revisao-conta.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          `date,ticker,name,pricebuy,shares,type\n${date},TEST,Teste,100,10,buy`,
        ),
      });
  };
  await upload("2024-01-01");
  const dialog = page.getByRole("dialog", {
    name: "Rever importação CSV",
    exact: true,
  });
  await expect(dialog).toContainText("Carteira da Ana · EUR");
  expect(state.requests).toHaveLength(0);
  expect(state.marketRequests).toBe(0);
  await dialog.getByLabel("Quantidade da linha 2", { exact: true }).fill("11");
  state.delayNextWrite = true;
  await dialog
    .getByRole("button", { name: "Confirmar importação", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(1);
  await expect(
    dialog.getByLabel("Quantidade da linha 2", { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.locator(".auth-inline-back, .dialog-heading button"),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(0);
  state.releaseWrite();
  await expect(dialog).toBeHidden();
  expect(state.accounts[userA].portfolios[0].portfolio.orders[0].shares).toBe(
    11,
  );
  await upload("2024-01-02");
  await dialog
    .getByLabel("Nome da linha 2", { exact: true })
    .fill("Preservar no conflito");
  state.failNextWrite = 409;
  await dialog
    .getByRole("button", { name: "Confirmar importação", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "As edições foram mantidas",
  );
  await expect(
    dialog.getByLabel("Nome da linha 2", { exact: true }),
  ).toHaveValue("Preservar no conflito");
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
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

test("falha ao enviar código permite reenviar sem perder recuperação", async ({
  page,
}) => {
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
    session(userA, 3600, { sessionId: "33333333-3333-4333-8333-333333333333" }),
    "SIGNED_IN",
  );
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/A sessão de recuperação mudou/)).toBeVisible();
});

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
  const tokens = attempts.map((request) => request.body.captchaToken);
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

test("mudar de sessão durante envio de reautenticação descarta a conclusão antiga", async ({
  page,
}) => {
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
    session(userA, 3600, { sessionId: "33333333-3333-4333-8333-333333333333" }),
    "SIGNED_IN",
  );
  await expect(dialog).toBeHidden();
  state.releaseAuth();
  await expect(page.getByText(/A sessão de recuperação mudou/)).toBeVisible();
  await expect(page.getByText(/Enviámos um código de confirmação/)).toHaveCount(
    0,
  );
  expect(
    state.authRequests.filter(
      (request) => request.body.password === "discarded-reauth-password-test",
    ),
  ).toHaveLength(1);
  expect(state.authRequests.some((request) => request.body.nonce)).toBe(false);
});

test("definições mostram falhas de recarga e confirmação de cópia local", async ({
  page,
}) => {
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
});

test("sessão pública não expõe tokens e uma troca silenciosa de conta rejeita a escrita antiga", async ({
  page,
}) => {
  const state = await setup(page, true);
  let externalAuthRequests = 0;
  await page.route("**/auth/v1/**", (route) => {
    externalAuthRequests++;
    return route.abort();
  });
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(
    Object.keys(stored).some(
      (key) => key.startsWith("sb-") || key.includes("auth-token"),
    ),
  ).toBe(false);
  const publicResponse = await page.evaluate(async () =>
    (await fetch("/api/auth/session", { cache: "no-store" })).text(),
  );
  expect(publicResponse).not.toContain("access_token");
  expect(publicResponse).not.toContain("refresh_token");
  state.currentSession = session(userB);
  await rename(page, "Carteira da Ana", "Não transferir para Bruno");
  await expect(
    selectedPortfolio(page).getByText("Carteira do Bruno", { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(0);
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
    "Carteira da Ana",
  );
  expect(state.accounts[userB].portfolios[0].portfolio.name).toBe(
    "Carteira do Bruno",
  );
  expect(externalAuthRequests).toBe(0);
});

test("logout comunica falha remota depois de limpar cookie local", async ({
  page,
}) => {
  await setup(page, true);
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Indisponível", session: null },
    }),
  );
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await accountAction(page, "Sair da conta");
  await expect(
    page.getByText(/não foi possível confirmar a saída no servidor/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar sessão", exact: true }),
  ).toBeVisible();
});

test("logout rejeitado por sessão diferente não anuncia saída nem esconde a falha", async ({
  page,
}) => {
  await setup(page, true);
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "A sessão mudou.", code: "session_changed" },
    }),
  );
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const messages: unknown[] = [];
    (window as unknown as { __logoutMessages: unknown[] }).__logoutMessages =
      messages;
    const channel = new BroadcastChannel("rendimentos.auth.session.v1");
    channel.onmessage = (event) => messages.push(event.data);
  });
  await accountAction(page, "Sair da conta");
  await expect(
    page.getByText(/não foi possível terminar a sessão/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __logoutMessages: unknown[] }).__logoutMessages,
    ),
  ).toEqual([]);
});
