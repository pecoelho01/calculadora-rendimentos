import { test, expect } from "@playwright/test";

const portfolios = [
  {
    id: "route-first",
    name: "Primeira",
    currency: "EUR",
    orders: [
      {
        id: "route-order",
        ticker: "TEST",
        name: "Teste",
        date: "2024-01-01",
        pricebuy: 100,
        shares: 2,
        type: "buy",
      },
    ],
  },
  { id: "route-second", name: "Segunda", currency: "EUR", orders: [] },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem(
      "rendimentos.portfolios.v1",
      JSON.stringify({ version: 1, portfolios: data }),
    );
  }, portfolios);
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets: {} } }),
  );
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({ json: { geographies: {} } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
});

test("abre diretamente transações e mantém a rota após recarregar", async ({
  page,
}) => {
  await page.goto("/carteira/route-first/transacoes");
  await expect(page).toHaveURL(/\/carteira\/route-first\/transacoes$/);
  await expect(
    page.getByRole("heading", { name: "Transações", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/carteira\/route-first\/transacoes$/);
  await expect(
    page.getByRole("heading", { name: "Transações", exact: true }),
  ).toBeVisible();
});

test("redireciona uma carteira inexistente com aviso", async ({ page }) => {
  await page.goto("/carteira/id-inexistente/geral");
  await expect(page).toHaveURL(/\/carteira\/route-first\/geral$/);
  await expect(page.getByRole("status")).toContainText(
    "A carteira pedida não existe ou já não está disponível.",
  );
});

test("a raiz regressa à última carteira aberta", async ({ page }) => {
  await page
    .getByRole("combobox", { name: "Selecionar carteira" })
    .selectOption("route-second");
  await expect(page).toHaveURL(/\/carteira\/route-second\/geral$/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("rendimentos.last-portfolio.v1"),
      ),
    )
    .toBe(JSON.stringify({ local: "route-second" }));
  await page.goto("/");
  await expect(page).toHaveURL(/\/carteira\/route-second\/geral$/);
});

test("preserva q ao recarregar a pesquisa", async ({ page }) => {
  await page.goto("/carteira/route-first/posicoes");
  if ((page.viewportSize()?.width ?? 1440) <= 800)
    await page.getByLabel("Filtrar posições", { exact: true }).click();
  await page.getByLabel("Pesquisar ativo", { exact: true }).fill("SXR8");
  await expect(page).toHaveURL(/\?q=SXR8$/);
  await page.reload();
  await expect(page.getByLabel("Pesquisar ativo", { exact: true })).toHaveValue(
    "SXR8",
  );
});

test("mostra 404 com ligação para as carteiras", async ({ page }) => {
  await page.goto("/caminho-desconhecido");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Voltar às carteiras" }),
  ).toHaveAttribute("href", "/");
});

// "%20" guards against decoding the route segment twice.
for (const id of ["carteira # especial?", "carteira%20especial"]) {
  test(`usa o id codificado de uma carteira com caracteres especiais: ${id}`, async ({
    page,
  }) => {
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByLabel("Restaurar cópia de segurança", { exact: true })
      .setInputFiles({
        name: "carteira-especial.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            version: 1,
            portfolios: [{ id, name: "Especial", currency: "EUR", orders: [] }],
          }),
        ),
      });
    await expect(page).toHaveURL(
      new RegExp(`/carteira/${encodeURIComponent(id)}/geral$`),
    );
    await expect(page.locator(".portfolio-selection-label")).toContainText(
      "Especial",
    );
  });
}

test("a pesquisa acompanha o URL ao abrir todas as posições e ao voltar", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) <= 800,
    "A lista compacta da visão geral não tem pesquisa no telemóvel.",
  );
  await page.goto("/carteira/route-first/geral");
  const search = page.getByLabel("Pesquisar ativo", { exact: true });
  await search.fill("SEM-RESULTADO");
  await page.getByRole("link", { name: /Ver todas/ }).click();
  await expect(page).toHaveURL(/\/posicoes\?q=SEM-RESULTADO$/);
  await expect(search).toHaveValue("SEM-RESULTADO");
  await search.fill("");
  await expect(page).toHaveURL(/\/posicoes$/);
  await page.goBack();
  await expect(page).toHaveURL(
    /\/carteira\/route-first\/geral\?q=SEM-RESULTADO$/,
  );
  await expect(search).toHaveValue("SEM-RESULTADO");
});

test("link aberto antes de entrar passa pela página inicial e regressa", async ({
  page,
}) => {
  await page.evaluate(() =>
    sessionStorage.removeItem("rendimentos.entry.local.v1"),
  );
  await page.goto("/carteira/route-first/transacoes?q=TEST");
  await expect(page).toHaveURL(
    /\/\?voltar=%2Fcarteira%2Froute-first%2Ftransacoes%3Fq%3DTEST$/,
  );
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await expect(page).toHaveURL(/\/carteira\/route-first\/transacoes\?q=TEST$/);
  await expect(page.getByLabel("Pesquisar ativo", { exact: true })).toHaveValue(
    "TEST",
  );
});

test("o retorno só aceita caminhos do próprio site", async ({ page }) => {
  // Tabs and line breaks are removed by the browser and would turn
  // "/\t/site" into "//site".
  for (const unsafeReturn of [
    "%2F%2Fexemplo.invalid%2Fcarteira",
    "%2F%09%2Fexemplo.invalid%2Fcarteira",
    "%2F%0A%2Fexemplo.invalid%2Fcarteira",
    "%2F%5Cexemplo.invalid",
    "javascript%3Aalert(1)",
    "%2F",
  ]) {
    await page.goto(`/?voltar=${unsafeReturn}`);
    await expect(page).toHaveURL(
      /^http:\/\/127\.0\.0\.1:\d+\/carteira\/route-first\/geral$/,
    );
  }
});

test("o retorno mantém os outros parâmetros do endereço", async ({ page }) => {
  await page.goto("/?voltar=%2Fdefinicoes&manter=1");
  await expect(page).toHaveURL(/\/definicoes\?manter=1$/);
});

test("links curtos e o endereço antigo das definições continuam a funcionar", async ({
  page,
}) => {
  await page.goto("/carteira/route-second");
  await expect(page).toHaveURL(/\/carteira\/route-second\/geral$/);
  await page.goto("/conta");
  await expect(page).toHaveURL(/\/definicoes$/);
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
});
