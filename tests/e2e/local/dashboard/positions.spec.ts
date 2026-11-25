import { test, expect, type Page } from "@playwright/test";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  assets,
  csv,
  mockMarketAndGeography,
  navigateTo,
  openLocal,
  positionPeriodGroup,
} from "../../../helpers/dashboard/dashboard-helpers";
import { openListFilters } from "../../../helpers/dashboard/list-filters";

// "Hoje" fixo, no dia seguinte ao último fecho dos mocks (asOf em dashboard-helpers),
// para que os períodos relativos (1M, 1A, …) não dependam da data da execução.
const fixedToday = new Date("2026-10-30T12:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedToday);
  await mockMarketAndGeography(page);
});

test("manter pesquisas independentes e permitir limpar resultados vazios", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  if (testInfo.project.name === "desktop") await search.fill("Teste");
  await navigateTo(page, /^Posições/);
  await expect(search).toHaveValue("");
  await search.fill("sem posição");
  await expect(page.locator(".no-results")).toContainText(
    "Nenhuma posição corresponde à pesquisa.",
  );
  await navigateTo(page, "Transações");
  await expect(search).toHaveValue("");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await search.fill("sem transação");
  await expect(page.locator(".no-results")).toContainText(
    "Nenhuma transação corresponde à pesquisa.",
  );
  await navigateTo(page, /^Posições/);
  await expect(search).toHaveValue("sem posição");
  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("posicoes.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("heading", { level: 1, name: "Posições", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".page-heading")).not.toContainText(
    "A minha carteira",
  );
  await page.emulateMedia({ media: "screen" });
  await navigateTo(page, "Transações");
  await expect(search).toHaveValue("sem transação");
  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath("transacoes.png"),
    fullPage: true,
  });
  await navigateTo(page, "Visão geral");
  if (testInfo.project.name === "desktop")
    await expect(search).toHaveValue("Teste");
});

test("ganhos de compras fechadas e vendas permanecem sem cotação atual", async ({
  page,
}) => {
  await page.unroute("**/api/market?*");
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets: {} } }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "fechada.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,130,10,sell\n2024-01-03,TEST,Teste,120,1,buy",
      ),
    });
  await confirmCsvReview(page);
  await page
    .getByRole("link", { name: "Transações", exact: true })
    .first()
    .click();
  const closed = page
    .locator("tbody tr")
    .filter({ has: page.locator('time[datetime="2024-01-01"]') })
    .locator(".transaction-gain");
  const sale = page
    .locator("tbody tr")
    .filter({ has: page.locator('time[datetime="2024-01-02"]') })
    .locator(".transaction-gain");
  const open = page
    .locator("tbody tr")
    .filter({ has: page.locator('time[datetime="2024-01-03"]') })
    .locator(".transaction-gain");
  await expect(closed).toContainText("300,00");
  await expect(closed).toContainText("+30%");
  await expect(closed).toContainText("Lote fechado");
  await expect(sale).toContainText("300,00");
  await expect(sale).toContainText("+30%");
  await expect(open).toContainText("—");
  await expect(open).not.toContainText("0,00");
});

async function verifyPositionPeriodValues(page: Page) {
  const periodGroup = positionPeriodGroup(page);
  for (const [period, expectedPercent, expectedGain] of [
    ["1D", "+1,35%", "+2,00 €"],
    ["5D", "+7,14%", "+10,00 €"],
    ["1M", "+15,38%", "+20,00 €"],
    ["6M", "+25%", "+30,00 €"],
    ["YTD", "+36,36%", "+40,00 €"],
    ["1A", "+42,86%", "+45,00 €"],
    ["Máximo", "+50%", "+50,00 €"],
  ]) {
    const periodButton = periodGroup.getByRole("button", {
      name: period,
      exact: true,
    });
    await periodButton.click();
    await expect(periodButton).toHaveAttribute("aria-pressed", "true");
    if (period !== "Máximo")
      await expect(page.locator(".positions-table thead")).toContainText(
        `Rentabilidade (${period})`,
      );
    await expect(page.locator(".position-gain strong")).toHaveText(
      expectedPercent,
    );
    await expect(page.locator(".position-profit strong")).toHaveText(
      expectedGain,
    );
  }
}

test("período da tabela é independente, aplica-se às posições abertas e adapta-se a telemóvel", async ({
  page,
}) => {
  const history = [
    { date: "2025-01-03", close: 100 },
    { date: "2025-10-29", close: 105 },
    { date: "2025-12-31", close: 110 },
    { date: "2026-04-29", close: 120 },
    { date: "2026-09-29", close: 130 },
    { date: "2026-10-23", close: 140 },
    { date: "2026-10-26", close: 142 },
    { date: "2026-10-27", close: 144 },
    { date: "2026-10-28", close: 146 },
    { date: "2026-10-29", close: 148 },
  ];
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: {
          TEST: { ...assets.TEST, price: 150, history },
          CLOSED: { ...assets.TEST, price: 150, history },
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "periodos-posicoes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2025-01-01,TEST,100,1,buy\n2025-01-01,CLOSED,100,1,buy\n2025-01-02,CLOSED,130,1,sell",
      ),
    });
  await confirmCsvReview(page);
  await page.evaluate(() =>
    localStorage.setItem("rendimentos-chart-period-v1", "6M"),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "6M", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await navigateTo(page, /^Posições/);
  const periodGroup = positionPeriodGroup(page);
  const maximumPeriodButton = periodGroup.getByRole("button", {
    name: "Máximo",
    exact: true,
  });
  await expect(maximumPeriodButton).toHaveAttribute("aria-pressed", "true");
  const chartPeriodPreference = await page.evaluate(() =>
    localStorage.getItem("rendimentos-chart-period-v1"),
  );
  await verifyPositionPeriodValues(page);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos-chart-period-v1"),
    ),
  ).toBe(chartPeriodPreference);
  const oneYearPeriodButton = periodGroup.getByRole("button", {
    name: "1A",
    exact: true,
  });
  await oneYearPeriodButton.click();
  await expect(oneYearPeriodButton).toHaveAttribute("aria-pressed", "true");
  if ((page.viewportSize()?.width ?? 1440) <= 800)
    await page.locator(".list-filter-menu summary").click();
  await page.locator(".position-filters button").nth(2).click();
  await expect(page.locator(".position-closed .position-gain")).toContainText(
    "Realizado",
  );
  await expect(
    page.locator(".position-closed .position-gain strong"),
  ).toHaveText("+30%");
  await navigateTo(page, /^Visão geral/);
  await expect(
    page.getByRole("button", { name: "6M", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos-chart-period-v1"),
    ),
  ).toBe(chartPeriodPreference);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigateTo(page, /^Posições/);
  await expect(positionPeriodGroup(page)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("organizar posições por estado, valor e rentabilidade sem confundir zero com cotação ausente", async ({
  page,
}, testInfo) => {
  const marketAssets = {
    ...assets,
    AAA: { ...assets.TEST, name: "Alpha", price: 50 },
    ZERO: { ...assets.TEST, name: "Zero válido", price: 0 },
    MISSING: { ...assets.TEST, name: "Sem dados", price: null },
    FX: { ...assets.TEST, name: "Outra moeda", price: 99, currency: "USD" },
    CLOSED: { ...assets.TEST, name: "Encerrada", price: null },
  };
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets: marketAssets } }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "posicoes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "date,ticker,name,pricebuy,shares,type",
          "2024-01-01,TEST,Teste,100,10,buy",
          "2024-01-01,AAA,Alpha,25,2,buy",
          "2024-01-01,ZERO,Zero válido,10,1,buy",
          "2024-01-01,MISSING,Sem dados,10,1,buy",
          "2024-01-01,FX,Outra moeda,10,1,buy",
          "2024-01-01,CLOSED,Encerrada,10,2,buy",
          "2024-01-02,CLOSED,Encerrada,15,2,sell",
        ].join("\n"),
      ),
    });
  await confirmCsvReview(page);
  await navigateTo(page, /^Posições/);
  const rows = page.locator(".positions-table tbody tr");
  const tickers = () => page.locator(".position-identity a").allTextContents();
  await expect(rows).toHaveCount(5);
  await expect(rows.first().locator(".position-value")).toContainText(
    "1400,00",
  );
  expect((await tickers()).map((ticker) => ticker.trim())).toEqual([
    "TEST",
    "AAA",
    "ZERO",
    "FX",
    "MISSING",
  ]);
  const zero = rows.filter({
    has: page.locator(".position-identity a", { hasText: /^ZERO/ }),
  });
  const missing = rows.filter({
    has: page.locator(".position-identity a", { hasText: /^MISSING/ }),
  });
  const fx = rows.filter({
    has: page.locator(".position-identity a", { hasText: /^FX/ }),
  });
  await expect(zero.locator(".position-value strong")).toHaveText(/^0,00\s€$/);
  await expect(zero.locator(".position-profit")).toContainText("-10,00");
  await expect(missing.locator(".position-value strong")).toHaveText("—");
  await expect(missing.locator(".position-gain strong")).toHaveText("—");
  await expect(fx.locator(".position-value strong")).toHaveText("—");
  await expect(fx.locator(".position-quote")).toContainText(
    "Cotação em USD; carteira em EUR",
  );
  await openListFilters(page, "posições");
  await page
    .getByRole("button", { name: "Ordenação descendente. Inverter ordem" })
    .click();
  expect((await tickers()).map((ticker) => ticker.trim())).toEqual([
    "ZERO",
    "AAA",
    "TEST",
    "FX",
    "MISSING",
  ]);
  await page.getByLabel("Ordenar posições por").selectOption("return");
  await expect(rows.first()).toContainText("AAA");
  await page.getByLabel("Ordenar posições por").selectOption("asset");
  await expect(rows.first()).toContainText("AAA");
  if (testInfo.project.name === "desktop") {
    await page.locator("th").first().getByRole("button").click();
    await expect(page.locator("th").first()).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    await expect(rows.first()).toContainText("ZERO");
  }
  await openListFilters(page, "posições");
  await page.getByRole("button", { name: "Fechadas 1", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".position-profit")).toContainText(
    "+10,00",
  );
  await expect(rows.first().locator(".position-gain")).toContainText("+50%");
  await page.getByRole("button", { name: "Todas 6", exact: true }).click();
  await expect(rows).toHaveCount(6);
  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    const toggles = page.locator(".list-filter-menu[open] > summary");
    if (await toggles.count()) await toggles.first().click();
  }
  await page.screenshot({
    path: testInfo.outputPath("positions-all.png"),
    fullPage: true,
  });
  const originalViewport = page.viewportSize()!;
  for (const width of [360, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".positions-view")
        .evaluate((panel) => panel.scrollWidth <= panel.clientWidth),
    ).toBe(true);
    const singleLineAmounts = await page
      .locator(".position-value > strong, .position-gain > strong")
      .evaluateAll((amounts) =>
        amounts.every((amount) => {
          const range = document.createRange();
          range.selectNodeContents(amount);
          return range.getClientRects().length === 1;
        }),
      );
    expect(singleLineAmounts).toBe(true);
  }
  await page.setViewportSize(originalViewport);
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  await search.fill("Teste");
  await expect(rows).toHaveCount(1);
  const disclosure = page.getByLabel("Ver detalhes de TEST", { exact: true });
  await disclosure.click();
  await expect(page.locator(".position-details dd").last()).toContainText(
    "29/10/2026",
  );
  if (testInfo.project.name === "mobile") {
    await expect(
      page.locator(".position-additional-detail").first(),
    ).toBeVisible();
    await expect(
      page.locator(".position-additional-detail").nth(1),
    ).toContainText("100,00");
    await expect(
      page.locator(".position-additional-detail").nth(2),
    ).toContainText("140,00");
  }
  await disclosure.click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("positions-redesign.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: testInfo.outputPath("positions-redesign-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1016, height: 794 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".position-details dd").last()).toBeVisible();
  expect(
    (await page.locator(".position-actions").boundingBox())!.width,
  ).toBeGreaterThan((await page.locator("table").boundingBox())!.width * 0.25);
  await expect(page.locator(".position-details")).toContainText(
    "Ganho realizado",
  );
  await expect(page.locator(".position-context")).toContainText(
    "Todas · Pesquisa: “Teste”",
  );
  await expect(page.locator(".position-filters")).toBeHidden();
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
    path: testInfo.outputPath("positions-redesign-print.png"),
    fullPage: true,
  });
});
