import { test, expect } from "@playwright/test";
import { skipUnlessEnv } from "../../helpers/require-test-env";
import { mockMarketAndGeography } from "../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("entrada sem Supabase conserva acesso explícito ao modo local", async ({
  page,
}) => {
  skipUnlessEnv(
    "TEST_NO_ACCOUNT_CONFIG",
    "Requer build sem configuração Supabase.",
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Bem-vindo ao Rendimentos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "As contas estão indisponíveis. Podes continuar no modo local.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar sessão", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".metrics")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
});

for (const [kind, callback] of [
  ["fragmento", "#access_token=synthetic&refresh_token=synthetic"],
  ["query", "&access_token=synthetic&refresh_token=synthetic"],
  ["código", "&code=synthetic&recovery=1"],
  ["erro", "&error=synthetic&error_description=synthetic"],
]) {
  test(`limpar callback Auth sem Supabase e preservar modo local: ${kind}`, async ({
    page,
  }) => {
    skipUnlessEnv(
      "TEST_NO_ACCOUNT_CONFIG",
      "Requer build sem configuração Supabase.",
    );
    let authRequests = 0;
    await page.route("**/auth/v1/**", (route) => {
      authRequests++;
      return route.abort();
    });
    await page.goto(`/?preservar=1${callback}`);
    await expect(
      page.getByRole("heading", {
        name: "Bem-vindo ao Rendimentos",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Não foi possível validar esta ligação/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Iniciar sessão", exact: true }),
    ).toHaveCount(0);
    const url = new URL(page.url());
    expect(url.search).toBe("?preservar=1");
    expect(url.hash).toBe("");
    expect(authRequests).toBe(0);
    await page
      .getByRole("button", { name: "Continuar sem sessão", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
    ).toBeVisible();
  });
}
