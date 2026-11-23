import { test, expect } from "@playwright/test";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  assets,
  csv,
  mockMarketAndGeography,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("mostrar exposição geográfica ponderada, cobertura e fonte em ecrã e impressão", async ({
  page,
}, testInfo) => {
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({
      json: {
        geographies: {
          TEST: {
            allocations: [
              { country: "US", weight: 0.6 },
              { country: "JP", weight: 0.3 },
            ],
            asOf: "2026-09-30",
            source:
              "https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv",
            sourceName: "iShares",
            method: "holdings",
            holdingsCount: 509,
          },
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart.getByRole("img")).toBeVisible();
  await expect(chart.locator("svg path")).toHaveCount(3);
  await expect(chart.locator(".donut")).toContainText("90%");
  for (const [name, weight] of [
    ["América do Norte", "60%"],
    ["Ásia", "30%"],
    ["Sem classificação", "10%"],
  ]) {
    await expect(
      chart.locator(".allocation-list > div").filter({ hasText: name }),
    ).toContainText(weight);
  }
  await expect(
    chart.getByRole("link", { name: "TEST · iShares" }),
  ).toHaveAttribute(
    "href",
    "https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv",
  );
  await expect(chart).toContainText("30/09/2026");
  await expect(chart).toContainText("509 posições no ficheiro da gestora");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await chart.screenshot({ path: testInfo.outputPath("geografia.png") });
  await page.emulateMedia({ media: "print" });
  await expect(chart).toBeVisible();
  await expect(chart.locator(".allocation-list")).toContainText("60%");
  await expect(chart).toContainText("30/09/2026");
  await expect(chart).toContainText("509 posições no ficheiro da gestora");
});

test("exposição sem composição permanece sem classificação e moeda incompatível impede percentagens", async ({
  page,
}) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart.locator(".allocation-list")).toContainText(
    "Sem classificação",
  );
  await expect(chart.locator(".allocation-list")).toContainText("100%");
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: { ...assets, TEST: { ...assets.TEST, currency: "USD" } },
      },
    }),
  );
  if ((page.viewportSize()?.width ?? 1440) <= 800)
    await page.locator(".data-actions summary").click();
  await page
    .getByRole("button", { name: "Atualizar preços", exact: true })
    .click();
  await expect(chart).toContainText(
    "São necessárias cotações na moeda da carteira",
  );
  await expect(chart.getByRole("img")).toHaveCount(0);
});

test("agrupar composição completa apenas por continentes em ecrã e impressão", async ({
  page,
}, testInfo) => {
  const countries = [
    "US",
    "JP",
    "GB",
    "CA",
    "FR",
    "DE",
    "CH",
    "AU",
    "NL",
    "SE",
    "DK",
    "ES",
    "IT",
    "HK",
    "SG",
    "FI",
    "BE",
    "NO",
    "IE",
    "NZ",
    "IL",
    "AT",
    "PT",
  ];
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({
      json: {
        geographies: {
          TEST: {
            allocations: countries.map((country) => ({
              country,
              weight: 0.04,
            })),
            asOf: "2026-10-30",
            source:
              "https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv",
            sourceName: "iShares",
            method: "holdings",
            holdingsCount: 1271,
          },
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart.locator(".allocation-list > div")).toHaveCount(5);
  await expect(chart.locator(".allocation-list")).toContainText("Europa");
  await expect(chart.locator(".allocation-list")).toContainText("60%");
  await expect(chart.locator(".allocation-list")).not.toContainText(
    /Estados Unidos|Japão|Portugal|Outros países/,
  );
  await expect(
    chart.getByRole("button", { name: "Países", exact: true }),
  ).toHaveCount(0);
  await expect(chart.locator(".donut")).toContainText("92%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const withinPanel = () =>
    chart.evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return [...panel.querySelectorAll(".allocation-list > div")].every(
        (row) => {
          const rect = row.getBoundingClientRect();
          return (
            rect.left >= bounds.left &&
            rect.right <= bounds.right &&
            rect.bottom <= bounds.bottom
          );
        },
      );
    });
  expect(await withinPanel()).toBe(true);
  await chart.screenshot({
    path: testInfo.outputPath("geografia-completa.png"),
  });
  await page.emulateMedia({ media: "print" });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("1271 posições no ficheiro da gestora");
  expect(await withinPanel()).toBe(true);
});

test("alternar distribuição no mesmo card e alinhar altura com a rentabilidade", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  const card = page.getByRole("region", {
    name: "Distribuição da carteira",
    exact: true,
  });
  const assetsButton = card.getByRole("button", { name: "ETFs", exact: true });
  const geographyButton = card.getByRole("button", {
    name: "Geografia",
    exact: true,
  });
  const assertLayout = async () => {
    await expect(page.locator(".charts-grid > .panel")).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const cardBounds = await card.boundingBox();
    const toggleBounds = await card.locator(".allocation-toggle").boundingBox();
    expect(toggleBounds!.x).toBeGreaterThanOrEqual(cardBounds!.x);
    expect(toggleBounds!.x + toggleBounds!.width).toBeLessThanOrEqual(
      cardBounds!.x + cardBounds!.width,
    );
    if (testInfo.project.name === "desktop") {
      const performance = await page.locator(".performance").boundingBox();
      const allocation = await card.boundingBox();
      expect(Math.abs(allocation!.height - performance!.height)).toBeLessThan(
        1,
      );
      expect(Math.abs(allocation!.y - performance!.y)).toBeLessThan(1);
    }
  };
  await expect(assetsButton).toHaveAttribute("aria-pressed", "true");
  await assertLayout();
  await geographyButton.click();
  await expect(geographyButton).toHaveAttribute("aria-pressed", "true");
  await expect(
    card.getByRole("heading", { name: "Distribuição por continente" }),
  ).toBeVisible();
  await expect(card.locator(".asset-allocation")).toBeHidden();
  await assertLayout();
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect(
    card.locator(".geographic-allocation .allocation-list"),
  ).toContainText("100%");
  await assertLayout();
  await assetsButton.click();
  await expect(
    card.getByRole("img", {
      name: "Alocação da carteira por valor de mercado",
      exact: true,
    }),
  ).toBeVisible();
  await expect(card.locator(".geographic-view")).toBeHidden();
  await assertLayout();
  await page.emulateMedia({ media: "print" });
  await expect(card.locator(".geographic-view")).toBeVisible();
  await expect(card.locator(".allocation-toggle")).toBeHidden();
  await expect(card.locator(".asset-allocation")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: testInfo.outputPath("distribuicao-etfs.png"),
    fullPage: true,
  });
  await geographyButton.click();
  await page.screenshot({
    path: testInfo.outputPath("distribuicao-geografia.png"),
    fullPage: true,
  });
});

test("explorar fatias dos ETFs e continentes por rato, toque e teclado", async ({
  page,
}, testInfo) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: {
          ...assets,
          OTHER: { ...assets.TEST, name: "Outro ETF" },
          ZERO: { ...assets.TEST, price: 0, name: "Cotação zero" },
        },
      },
    }),
  );
  const geography = (country: string) => ({
    allocations: [{ country, weight: 1 }],
    asOf: "2026-10-30",
    source: "https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5Y983",
  });
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({
      json: {
        geographies: {
          TEST: geography("US"),
          OTHER: geography("JP"),
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "fatias.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2024-01-01,TEST,100,10,buy\n2024-01-01,ZERO,100,10,buy\n2024-01-01,OTHER,100,10,buy",
      ),
    });
  await confirmCsvReview(page);
  const card = page.getByRole("region", {
    name: "Distribuição da carteira",
    exact: true,
  });
  const assetsChart = card.locator(".asset-allocation");
  await expect(assetsChart.locator("svg path")).toHaveCount(2);
  const selectedLabel = assetsChart.locator(".donut-selection").first();
  const svg = assetsChart.locator("svg");
  await svg.scrollIntoViewIfNeeded();
  const bounds = (await svg.boundingBox())!;
  // Half of the ring belongs to TEST, from the top clockwise to the bottom.
  const x = bounds.x + bounds.width * 0.94;
  const y = bounds.y + bounds.height * 0.5;
  if (testInfo.project.name === "mobile") {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.move(x, y);
  }
  await expect(selectedLabel).toHaveText("TEST");
  await expect(assetsChart.locator(".donut-selection").last()).toHaveText(
    "50%",
  );
  await expect(assetsChart.locator(".slice-muted")).toHaveCount(1);
  if (testInfo.project.name === "desktop") {
    await page.mouse.click(x, y);
    await page.mouse.move(0, 0);
    await expect(selectedLabel).toHaveText("TEST");
  }
  await page.keyboard.press("Escape");
  await expect(selectedLabel).toHaveCount(0);
  const other = assetsChart.getByRole("button", {
    name: "OTHER: 50%",
    exact: true,
  });
  await other.focus();
  await expect(selectedLabel).toHaveText("OTHER");
  await other.press("Enter");
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await other.press("Escape");
  await expect(selectedLabel).toHaveCount(0);
  await expect(assetsChart.locator(".donut")).toContainText("Ativos3");
  const zero = assetsChart.getByRole("button", {
    name: "ZERO: 0%",
    exact: true,
  });
  await zero.focus();
  await zero.press("Space");
  await expect(zero).toHaveAttribute("aria-pressed", "true");
  await expect(selectedLabel).toHaveText("ZERO");
  await card.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = card.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart).not.toContainText("Exposição dos ETFs por continente");
  const asia = chart.getByRole("button", { name: "Ásia: 50%", exact: true });
  await asia.click();
  await expect(chart.locator(".donut-selection").first()).toHaveText("Ásia");
  await expect(chart.locator(".slice-muted")).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("pizza-interativa.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(chart.locator(".donut-selection").first()).toBeHidden();
  await expect(chart.locator(".donut-default").first()).toHaveText("Cobertura");
  await expect(chart.locator(".donut-default").last()).toBeVisible();
  await expect(chart.locator(".donut-default").last()).toHaveText("100%");
  expect(
    await chart
      .locator(".slice-muted")
      .evaluateAll((paths) =>
        paths.every((path) => getComputedStyle(path).opacity === "1"),
      ),
  ).toBe(true);
});
