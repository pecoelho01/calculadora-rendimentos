import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { waitForSignupVerification } from "../../helpers/mailpit";

const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = requiredEnvironment(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);
const userAEmail = requiredEnvironment("E2E_SUPABASE_USER_A_EMAIL");
const userAPassword = requiredEnvironment("E2E_SUPABASE_USER_A_PASSWORD");
const userBEmail = requiredEnvironment("E2E_SUPABASE_USER_B_EMAIL");
const userBPassword = requiredEnvironment("E2E_SUPABASE_USER_B_PASSWORD");
const registrationEmail = `e2e-register-${randomUUID()}@example.invalid`;
const registrationPassword = `${randomBytes(32).toString("base64url")}Aa1!`;
const mailpitUrl = requiredEnvironment("E2E_MAILPIT_URL");

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta a variável ${name}.`);
  return value;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const form = page.locator(".entry-auth-card");
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Palavra-passe", { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === `${supabaseUrl}/auth/v1/token?grant_type=password` &&
        response.request().method() === "POST",
    ),
    form.getByRole("button", { name: "Iniciar sessão", exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { access_token?: string };
  if (!session.access_token) throw new Error("O Auth não devolveu sessão.");
  await expect(form).toBeHidden();
  return session.access_token;
}

async function createFirstPortfolio(page: Page, name: string) {
  await page
    .locator(".account-empty-notice")
    .getByRole("button", { name: "Criar a primeira carteira", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Criar carteira",
    exact: true,
  });
  await dialog.getByLabel("Nome da carteira").fill(name);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account") &&
      response.request().method() === "POST" &&
      response.status() === 200,
  );
  await dialog
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await saved;
  await expect(dialog).toBeHidden();
  await expect(page.locator(".portfolio-row")).toContainText(name);
}

async function registerThroughUi(page: Page, email: string, password: string) {
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  const form = page.locator(".entry-auth-card");
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Palavra-passe", { exact: true }).fill(password);
  const signupResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === new URL(supabaseUrl).origin &&
      new URL(response.url()).pathname === "/auth/v1/signup" &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Criar conta", exact: true }).click();
  return signupResponse;
}

async function authenticatedRpc<T>(token: string, name: string): Promise<T> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function authenticatedUser(
  token: string,
): Promise<{ id: string; email_confirmed_at?: string | null }> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    id: string;
    email_confirmed_at?: string | null;
  };
}

async function authenticatedGet(
  token: string,
  path: string,
): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });
}

async function signedInContext(
  context: BrowserContext,
  email: string,
  password: string,
) {
  const page = await context.newPage();
  const token = await login(page, email, password);
  await expect(page.locator(".app-shell")).toBeVisible();
  return { page, token };
}

test("registo exige confirmação real por email antes de abrir a conta", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const authOrigin = new URL(supabaseUrl).origin;
  await page.goto("/");
  const registrationOrigin = new URL(page.url()).origin;

  const signupResponse = await registerThroughUi(
    page,
    registrationEmail,
    registrationPassword,
  );
  const signup = await signupResponse;
  expect(signup.status()).toBe(200);
  const signupBody = (await signup.json()) as { access_token?: string };
  expect(Boolean(signupBody.access_token)).toBe(false);
  await expect(
    page.getByText(/Consulta o teu email para confirmar a conta/),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const loginForm = page.locator(".entry-auth-card");
  await loginForm.getByLabel("Email", { exact: true }).fill(registrationEmail);
  await loginForm
    .getByLabel("Palavra-passe", { exact: true })
    .fill(registrationPassword);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${supabaseUrl}/auth/v1/token?grant_type=password` &&
      response.request().method() === "POST",
  );
  await loginForm
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(400);
  const loginFailure = (await loginResponse.json()) as {
    code?: string;
    error_code?: string;
  };
  expect(loginFailure.code ?? loginFailure.error_code).toBe(
    "email_not_confirmed",
  );
  await expect(
    loginForm.getByText(/Não foi possível iniciar sessão/),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);

  const verificationLink = await waitForSignupVerification(
    mailpitUrl,
    registrationEmail,
    authOrigin,
    registrationOrigin,
  );
  const pkceExchange = page.waitForResponse(
    (response) =>
      response.url() === `${supabaseUrl}/auth/v1/token?grant_type=pkce` &&
      response.request().method() === "POST",
  );
  let exchange: Awaited<typeof pkceExchange>;
  try {
    [, exchange] = await Promise.all([
      page.goto(verificationLink),
      pkceExchange,
    ]);
  } catch {
    throw new Error("Não foi possível concluir a confirmação local da conta.");
  }
  expect(exchange.status()).toBe(200);
  const session = (await exchange.json()) as { access_token?: string };
  if (!session.access_token)
    throw new Error("O Auth não devolveu sessão PKCE.");
  await expect
    .poll(() => {
      const currentUrl = new URL(page.url());
      return (
        currentUrl.origin === registrationOrigin &&
        currentUrl.pathname === "/" &&
        currentUrl.search === "" &&
        currentUrl.hash === ""
      );
    })
    .toBe(true);
  await expect(page.locator(".app-shell")).toBeVisible();

  const confirmedUser = await authenticatedUser(session.access_token);
  expect(confirmedUser.email_confirmed_at).toBeTruthy();
  await expect(page.locator(".account-empty-notice")).toBeVisible();
  await createFirstPortfolio(page, "Carteira confirmada por email");
  await expect(page.locator(".portfolio-row")).toContainText(
    "Carteira confirmada por email",
  );
});

test("Auth, RPC, persistência e isolamento entre duas contas locais", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const { page: pageA, token: tokenA } = await signedInContext(
    contextA,
    userAEmail,
    userAPassword,
  );
  const portfolioNameA = "Carteira sintética A";
  await createFirstPortfolio(pageA, portfolioNameA);

  const userA = await authenticatedUser(tokenA);

  const accountA = await authenticatedRpc<{
    version: number;
    portfolios: {
      portfolio: { id: string; name: string };
      revision: number;
    }[];
  }>(tokenA, "get_account_portfolios");
  expect(accountA.version).toBe(1);
  expect(accountA.portfolios).toHaveLength(1);
  expect(accountA.portfolios[0]).toMatchObject({
    portfolio: { name: portfolioNameA },
    revision: 1,
  });
  const portfolioIdA = accountA.portfolios[0].portfolio.id;
  const ownerQuery = `account_portfolios?select=id&user_id=eq.${encodeURIComponent(
    userA.id,
  )}&id=eq.${encodeURIComponent(portfolioIdA)}`;
  const visibleToA = await authenticatedGet(tokenA, ownerQuery);
  expect(visibleToA.status).toBe(200);
  expect(await visibleToA.json()).toEqual([{ id: portfolioIdA }]);

  const firstReload = pageA.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  await pageA.reload();
  await firstReload;
  await expect(pageA.locator(".portfolio-row")).toContainText(portfolioNameA);

  const contextB = await browser.newContext();
  const { page: pageB, token: tokenB } = await signedInContext(
    contextB,
    userBEmail,
    userBPassword,
  );
  await expect(pageB.locator(".account-empty-notice")).toBeVisible();
  const userB = await authenticatedUser(tokenB);
  expect(userB.id).not.toBe(userA.id);
  const accountB = await authenticatedRpc<{
    version: number;
    portfolios: unknown[];
  }>(tokenB, "get_account_portfolios");
  expect(accountB).toEqual({ version: 1, portfolios: [] });

  const tableResponse = await authenticatedGet(tokenB, ownerQuery);
  expect(tableResponse.status).toBe(200);
  expect(await tableResponse.json()).toEqual([]);

  const portfolioNameB = "Carteira sintética B";
  await createFirstPortfolio(pageB, portfolioNameB);
  const updatedB = await authenticatedRpc<{
    version: number;
    portfolios: { portfolio: { name: string } }[];
  }>(tokenB, "get_account_portfolios");
  expect(updatedB.portfolios.map((item) => item.portfolio.name)).toEqual([
    portfolioNameB,
  ]);

  await pageA.reload();
  await expect(pageA.locator(".portfolio-row")).toContainText(portfolioNameA);
  await expect(pageA.locator(".portfolio-row")).not.toContainText(
    portfolioNameB,
  );

  await contextB.close();
  await contextA.close();
});
