import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  openSidebar,
  selectedPortfolio,
} from "../../../helpers/sidebar-helpers";
import {
  assets,
  csv,
  mockMarketAndGeography,
  navigateTo,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";
import { openListFilters } from "../../../helpers/dashboard/list-filters";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("escolher tickers da carteira e registar um novo ativo", async ({
  page,
}) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `${csv}\n2024-01-04,CLOSED,Ativo fechado,10,1,buy\n2024-01-05,CLOSED,Ativo fechado,12,1,sell`,
      ),
    });
  await confirmCsvReview(page);
  await page.getByRole("button", { name: "Nova transação" }).click();
  const dialog = page.getByRole("dialog");
  const choice = dialog.getByLabel("Ativo da transação");
  await expect(choice.locator("option")).toHaveText([
    "Novo ticker",
    "CLOSED · Ativo fechado",
    "TEST · Teste",
  ]);
  await choice.selectOption("CLOSED");
  await expect(dialog.getByLabel("Nome do ativo")).toHaveValue("Ativo fechado");
  await choice.selectOption("TEST");
  await expect(dialog.getByLabel("Nome do ativo")).toHaveValue("Teste");
  await expect(dialog.getByLabel("Ticker Yahoo")).toHaveCount(0);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await dialog.getByLabel("Preço por unidade").fill("100");
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Guardar transação" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Nova transação" }).click();
  await choice.selectOption("TEST");
  await choice.selectOption("");
  await expect(dialog.getByLabel("Nome do ativo")).toHaveValue("");
  await dialog.getByLabel("Ticker Yahoo").fill("NEW");
  await dialog.getByLabel("Nome do ativo").fill("Novo ativo");
  await dialog.getByLabel("Quantidade", { exact: true }).fill("1");
  await dialog.getByLabel("Preço por unidade").fill("50");
  await dialog.getByRole("button", { name: "Guardar transação" }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(saved.portfolios[0].orders.slice(-2)).toMatchObject([
    { ticker: "TEST", name: "Teste", shares: 2, pricebuy: 100 },
    { ticker: "NEW", name: "Novo ativo", shares: 1, pricebuy: 50 },
  ]);
  await page.getByRole("button", { name: "Nova transação" }).click();
  await expect(choice.locator("option")).toHaveText([
    "Novo ticker",
    "CLOSED · Ativo fechado",
    "NEW · Novo ativo",
    "TEST · Teste",
  ]);
});

test("registar ordens, bloquear venda excessiva e criar carteira", async ({
  page,
}) => {
  await openLocal(page);
  await page
    .getByRole("button", { name: "Nova transação", exact: false })
    .click();
  await page.getByLabel("Ticker Yahoo").fill("TEST");
  await page.getByLabel("Quantidade", { exact: true }).fill("2");
  await page.getByLabel("Preço por unidade").fill("100,00");
  await page.getByRole("button", { name: "Guardar transação" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Nova transação", exact: false })
    .click();
  await page.getByRole("radio", { name: "Venda", exact: true }).check();
  await page.getByLabel("Ticker Yahoo").fill("TEST");
  await page.getByLabel("Quantidade", { exact: true }).fill("3");
  await page.getByLabel("Preço por unidade").fill("120");
  await page.getByRole("button", { name: "Guardar transação" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "superior",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await openSidebar(page);
  await page
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await page.getByLabel("Nome da carteira").fill("Longo prazo");
  await page.getByRole("radio", { name: "USD", exact: true }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(
    selectedPortfolio(page).filter({ hasText: "Longo prazo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova transação" }).click();
  await expect(page.getByLabel("Ativo da transação")).toHaveCount(0);
  await expect(page.getByLabel("Ticker Yahoo")).toHaveValue("");
  await expect(page.getByLabel("Nome do ativo")).toHaveValue("");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.locator(".data-actions summary").click();
  await expect(
    page.getByRole("button", { name: "Exportar backup JSON", exact: true }),
  ).toBeVisible();
  const storedPortfolios = await page.evaluate(() => {
    const stored = localStorage.getItem("rendimentos.portfolios.v1");
    return stored ? JSON.parse(stored).portfolios : [];
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar backup JSON", exact: true })
    .click();
  const backupDownload = await download;
  expect(backupDownload.suggestedFilename()).toBe("carteiras.json");
  const backupPath = await backupDownload.path();
  expect(backupPath).not.toBeNull();
  const backup = JSON.parse(await readFile(backupPath!, "utf8"));
  expect(backup).toEqual({ version: 1, portfolios: storedPortfolios });
  expect(backup.portfolios).toContainEqual(
    expect.objectContaining({ name: "Longo prazo", currency: "USD" }),
  );
});

test("filtrar e ordenar transações, consultar detalhes e preservar a validação de remoção", async ({
  page,
}, testInfo) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: {
          ...assets,
          AAA: { ...assets.TEST, name: "Alpha", price: 50 },
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "transacoes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `${csv}\n2024-01-02,AAA,Alpha,25,2,buy\n2024-01-04,TEST,Teste,150,1,sell`,
      ),
    });
  await confirmCsvReview(page);
  await navigateTo(page, "Transações");
  const rows = page.locator(".transactions-table tbody tr");
  await expect(rows).toHaveCount(5);
  expect(
    await rows
      .locator("time")
      .evaluateAll((times) =>
        times.map((time) => time.getAttribute("datetime")),
      ),
  ).toEqual([
    "2024-01-04",
    "2024-01-03",
    "2024-01-02",
    "2024-01-02",
    "2024-01-01",
  ]);
  expect(
    await rows.locator(".transaction-identity strong").allTextContents(),
  ).toEqual(["TEST", "TEST", "TEST", "AAA", "TEST"]);
  await expect(rows.first().locator("time")).toContainText("jan.");
  await expect(rows.first().locator(".transaction-total")).toContainText(
    "150,00",
  );
  await expect(rows.first().locator(".transaction-gain")).toContainText(
    "+50,00",
  );
  await expect(rows.first().locator(".transaction-gain")).toContainText(
    "Realizado",
  );
  await page.getByRole("button", { name: "Compras 3", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator(".transaction-gain")).toContainText(
    "Total da compra",
  );
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  await search.fill("Alpha");
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Vendas 2", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".no-results")).toContainText(
    "Nenhuma transação corresponde à pesquisa.",
  );
  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(rows).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Vendas 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Todas 5", exact: true }).click();
  await openListFilters(page, "transações");
  await page.getByLabel("Ordenar transações por").selectOption("total");
  await expect(rows.first().locator(".transaction-total")).toContainText(
    "1200,00",
  );
  await page
    .getByRole("button", { name: "Ordenação descendente. Inverter ordem" })
    .click();
  await expect(rows.first()).toContainText("AAA");
  await page.getByLabel("Ordenar transações por").selectOption("asset");
  await expect(rows.first()).toContainText("AAA");
  if (testInfo.project.name === "desktop") {
    await page.locator("th").nth(1).getByRole("button").click();
    await expect(page.locator("th").nth(1)).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    await expect(rows.first()).toContainText("TEST");
  }
  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    const toggles = page.locator(".list-filter-menu[open] > summary");
    if (await toggles.count()) await toggles.first().click();
  }
  const viewport = page.viewportSize()!;
  for (const width of [360, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".transactions-view")
        .evaluate((panel) => panel.scrollWidth <= panel.clientWidth),
    ).toBe(true);
    expect(
      await page
        .locator(".transaction-total > strong, .transaction-gain strong")
        .evaluateAll((amounts) =>
          amounts.every((amount) => {
            const range = document.createRange();
            range.selectNodeContents(amount);
            return range.getClientRects().length === 1;
          }),
        ),
    ).toBe(true);
  }
  await page.setViewportSize(viewport);
  await page.screenshot({
    path: testInfo.outputPath("transactions-redesign.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: testInfo.outputPath("transactions-redesign-dark.png"),
    fullPage: true,
  });
  const alphaDetails = page.getByLabel("Ver detalhes de AAA de 2024-01-02", {
    exact: true,
  });
  await alphaDetails.focus();
  await alphaDetails.press("Enter");
  const alpha = rows.filter({ hasText: "AAA" });
  await expect(alpha.locator(".transaction-explanation")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(alpha.locator(".transaction-mobile-detail")).toBeVisible();
    await expect(alpha.locator(".transaction-mobile-detail")).toContainText(
      "25,00",
    );
  }
  await page.screenshot({
    path: testInfo.outputPath("transactions-details.png"),
    fullPage: true,
  });
  await alphaDetails.press("Enter");
  await page.getByRole("button", { name: "Compras 3", exact: true }).click();
  await search.fill("Alpha");
  await page.setViewportSize({ width: 1016, height: 794 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".transaction-explanation")).toBeVisible();
  expect(
    (await page.locator(".transaction-actions").boundingBox())!.width,
  ).toBeGreaterThan((await page.locator("table").boundingBox())!.width * 0.25);
  await expect(page.locator(".transaction-context")).toContainText(
    "Compras · Pesquisa: “Alpha”",
  );
  await expect(page.locator(".transaction-filters")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Remover AAA de 2024-01-02" }),
  ).toBeHidden();
  expect(
    await page
      .locator("table")
      .evaluate(
        (table) =>
          table.getBoundingClientRect().right <=
          document.documentElement.clientWidth,
      ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("transactions-redesign-print.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize(viewport);
  await search.fill("");
  await page.getByRole("button", { name: "Todas 5", exact: true }).click();
  await page
    .getByLabel("Ver detalhes de TEST de 2024-01-01", { exact: true })
    .click();
  // The first purchase alone is not required, but removing both buys is invalid.
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Remover TEST de 2024-01-01", exact: true })
    .click();
  await expect(rows).toHaveCount(4);
  await page
    .getByLabel("Ver detalhes de TEST de 2024-01-02", { exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Remover TEST de 2024-01-02", exact: true })
    .click();
  await expect(page.locator(".notice")).toContainText("superior");
  await expect(rows).toHaveCount(4);
  await expect(
    page.locator(".transaction-gain").filter({ hasText: "Realizado" }),
  ).toHaveCount(2);
});
