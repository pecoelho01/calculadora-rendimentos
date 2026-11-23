import { test, expect, type Page } from "@playwright/test";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  assets,
  csv,
  mockMarketAndGeography,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";

async function choosePerformanceMode(
  page: Page,
  mode: "Posições atuais" | "Desempenho da carteira",
) {
  const target = page.getByRole("button", { name: mode, exact: true });
  await target.click();
}

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("explorar rentabilidade por rato, toque e teclado sem confundir o histórico com o valor atual", async ({
  page,
}, testInfo) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: { assets: { ...assets, TEST: { ...assets.TEST, price: 160 } } },
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
  const current = page.locator(".performance-current");
  const performanceCard = page.locator(".performance");
  const modeSelector = performanceCard.locator(".performance-modes");
  const panelHeading = performanceCard.locator(".panel-heading");
  await expect(modeSelector).toBeVisible();
  await expect(modeSelector).toHaveAttribute(
    "aria-label",
    "Métrica do gráfico",
  );
  const selectorPosition = await modeSelector.boundingBox();
  const currentPosition = await current.boundingBox();
  const panelHeadingPosition = await panelHeading.boundingBox();
  expect(selectorPosition).not.toBeNull();
  expect(currentPosition).not.toBeNull();
  expect(panelHeadingPosition).not.toBeNull();
  expect(
    panelHeadingPosition!.y + panelHeadingPosition!.height,
  ).toBeLessThanOrEqual(selectorPosition!.y);
  expect(selectorPosition!.y + selectorPosition!.height).toBeLessThan(
    currentPosition!.y,
  );
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 360, height: 800 });
  for (const button of await modeSelector.getByRole("button").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await performanceCard.evaluate(
      (card) => card.scrollWidth <= card.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize(originalViewport);
  await expect(
    page.getByRole("button", {
      name: "Posições atuais",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(current).toContainText("+41,18%");
  await choosePerformanceMode(page, "Desempenho da carteira");
  await expect(current).toContainText("+45,45%");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  const readout = page.locator(".chart-readout");
  await chart.scrollIntoViewIfNeeded();
  const last = await chart.locator("svg").evaluate((svg) => {
    const point = new DOMPoint(
      (svg as SVGSVGElement).viewBox.baseVal.width - 30,
      100,
    ).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  if (testInfo.project.name === "mobile")
    await page.touchscreen.tap(last.x, last.y);
  else await page.mouse.move(last.x, last.y);
  await expect(readout).toContainText("Atual");
  await expect(readout).toContainText("+45,45%");
  await expect(readout).not.toContainText("S&P 500");
  await chart.focus();
  await chart.press("Home");
  await expect(readout).toContainText("05/01/2024");
  await expect(readout).toContainText("-9,09%");
  await expect(chart).not.toHaveAttribute("aria-valuetext", /S&P 500/);
  await chart.press("ArrowRight");
  await expect(chart).toHaveAttribute(
    "aria-valuetext",
    /12\/01\/2024.*\+27,27%/,
  );
  await page
    .locator(".performance")
    .screenshot({ path: testInfo.outputPath("grafico-interativo.png") });
  await page.emulateMedia({ media: "print" });
  await expect(readout).toBeHidden();
  await expect(page.locator(".chart-cursor")).toBeHidden();
  await expect(current).toBeVisible();
  await expect(chart.locator("svg")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Métrica do gráfico" }),
  ).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await expect(chart).toBeVisible();
  await expect(current).toContainText("+14,29%");
  await page.getByRole("button", { name: "Máximo", exact: true }).click();
  await expect(readout).toContainText("Seleciona uma data");
});

test("distinguir preço histórico zero de retorno atual zero", async ({
  page,
}) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: {
          ...assets,
          TEST: {
            ...assets.TEST,
            price: 100,
            history: [{ date: "2024-01-12", close: 0 }],
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
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2024-01-01,TEST,100,10,buy",
      ),
    });
  await confirmCsvReview(page);
  await expect(page.locator(".performance-current")).toContainText("+0%");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  await chart.focus();
  await chart.press("Home");
  await expect(page.locator(".chart-readout")).toContainText(
    "Posições atuais -100%",
  );
  await chart.press("End");
  await expect(page.locator(".chart-readout")).toContainText(
    "Posições atuais +0%",
  );
  await chart.press("ArrowLeft");
  await expect(page.locator(".chart-readout")).toContainText(
    "Posições atuais -100%",
  );
});

test("alternar ROI total e posições abertas com FIFO no resumo, histórico e impressão", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  await expect(page.locator(".performance-current")).toContainText(
    "Indisponível",
  );
  await choosePerformanceMode(page, "Desempenho da carteira");
  await expect(page.locator(".performance-current")).toContainText(
    "Indisponível",
  );
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "fifo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  const current = page.locator(".performance-current");
  await expect(current).toContainText("+27,27%");
  await choosePerformanceMode(page, "Posições atuais");
  await expect(current).toContainText("+23,53%");
  await expect(current).toContainText("custo FIFO");
  await expect(page.locator(".metric").nth(2)).toContainText("150,00");
  await expect(page.locator("tbody tr").first()).toContainText("113,33");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  await chart.focus();
  await chart.press("Home");
  await expect(page.locator(".chart-readout")).toContainText("-11,76%");
  await chart.press("End");
  await expect(page.locator(".chart-readout")).toContainText("+23,53%");
  await page
    .locator(".performance")
    .screenshot({ path: testInfo.outputPath("fifo-posicoes-abertas.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("Ganho nas posições atuais");
  await expect(current).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Métrica do gráfico" }),
  ).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await choosePerformanceMode(page, "Desempenho da carteira");
  await expect(page.locator(".chart-readout")).toContainText(
    "Seleciona uma data",
  );
  await chart.focus();
  await chart.press("Home");
  await expect(page.locator(".chart-readout")).toContainText("-9,09%");
  await expect(current).toContainText("+27,27%");
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "fecho.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2024-01-15,TEST,140,15,sell",
      ),
    });
  await confirmCsvReview(page);
  await choosePerformanceMode(page, "Posições atuais");
  await expect(current).toContainText("Indisponível");
  // Existing historical points remain available after the current position closes.
  await chart.focus();
  await chart.press("End");
  await expect(page.locator(".chart-readout")).toContainText("Indisponível");
  await chart.press("ArrowLeft");
  await expect(page.locator(".chart-readout")).toContainText("+23,53%");
  await choosePerformanceMode(page, "Desempenho da carteira");
  await expect(current).toContainText("+27,27%");
});

test("Os sete períodos recalculam o destaque e o hover sem benchmark", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
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
          TEST: {
            ...assets.TEST,
            price: 150,
            history,
            intraday: [
              { date: "2026-10-30T10:00:00Z", close: 148 },
              { date: "2026-10-30T10:05:00Z", close: 152 },
              { date: "2026-10-30T10:10:00Z", close: 145 },
              { date: "2026-10-30T10:15:00Z", close: 149 },
              { date: "2026-10-30T10:20:00Z", close: 150 },
            ],
          },
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "periodos.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2025-01-01,TEST,100,1,buy",
      ),
    });
  await confirmCsvReview(page);
  const current = page.locator(".performance-current");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  const readout = page.locator(".chart-readout");
  await expect(current).toContainText("+50%");
  await expect(page.locator(".performance .segments button")).toHaveText([
    "1D",
    "5D",
    "1M",
    "6M",
    "YTD",
    "1A",
    "Máximo",
  ]);
  for (const mode of ["Posições atuais", "Desempenho da carteira"]) {
    await choosePerformanceMode(
      page,
      mode as "Posições atuais" | "Desempenho da carteira",
    );
    for (const [period, expected] of [
      ["1D", "+1,35%"],
      ["5D", "+7,14%"],
      ["1M", "+15,38%"],
      ["6M", "+25%"],
      ["YTD", "+36,36%"],
      ["1A", "+42,86%"],
      ["Máximo", "+50%"],
    ]) {
      await page.getByRole("button", { name: period, exact: true }).click();
      await expect(current).toContainText(expected);
      await expect(current).toContainText(period);
      const axisLabels = page.locator(".performance .chart-date");
      if (period === "1D") {
        await expect(axisLabels).toHaveText(["10:00", "10:10", "10:20"]);
        const path = await chart
          .locator('svg path[fill="none"]')
          .getAttribute("d");
        const coordinates = [...path!.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(
          (match) => Number(match[2]),
        );
        expect(coordinates).toHaveLength(5);
        expect(coordinates[1]).toBeLessThan(coordinates[0]);
        expect(coordinates[2]).toBeGreaterThan(coordinates[1]);
        expect(coordinates[3]).toBeLessThan(coordinates[2]);
        await expect(page.locator(".chart-limitations")).toContainText(
          "Horas em UTC",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        if (mode === "Posições atuais") {
          await page
            .locator(".performance")
            .screenshot({ path: testInfo.outputPath("rentabilidade-1d.png") });
          await page.emulateMedia({ media: "print" });
          await expect(axisLabels).toHaveText(["10:00", "10:10", "10:20"]);
          await page.emulateMedia({ media: "screen" });
        }
      } else {
        for (const label of await axisLabels.allTextContents()) {
          expect(label).toMatch(/\S+(?:\s+|\/)\d{2}$/);
          expect(label).not.toContain(":");
        }
        await expect(page.locator(".chart-limitations")).not.toContainText(
          "Horas em UTC",
        );
      }
      await chart.focus();
      await chart.press("End");
      await expect(readout).toContainText(expected);
      await expect(page.locator(".performance")).not.toContainText(
        /S&P 500|índice/,
      );
      await expect(chart).not.toHaveAttribute("aria-valuetext", /S&P 500/);
      await expect(chart.locator('svg path[fill="none"]')).toHaveCount(1);
      await expect(readout).toContainText(
        period === "1D" ? "Última observação" : "Atual",
      );
      if (period === "1D") {
        await expect(chart).toHaveAttribute("aria-valuetext", /10:20.*UTC/);
        await chart.press("ArrowLeft");
        await chart.press("ArrowLeft");
        await expect(readout).toContainText("10:10");
        await expect(readout).toContainText("-2,03%");
        await expect(current).toContainText(expected);
      }
      if (period !== "Máximo") {
        await chart.press("Home");
        await expect(readout).toContainText("+0%");
      }
    }
  }
  await page.getByRole("button", { name: "YTD", exact: true }).click();
  await expect(current).not.toContainText("01/01/2026");
  await expect(current).not.toContainText("30/10/2026");
  await expect(page.locator(".performance")).not.toContainText(
    "Passa o rato ou toca no gráfico",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".performance")
    .screenshot({ path: testInfo.outputPath("rentabilidade-ytd.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("YTD");
  await expect(current).toContainText("+36,36%");
  await expect(page.locator(".performance")).not.toContainText(
    /S&P 500|índice/,
  );
  await expect(chart.locator('svg path[fill="none"]')).toHaveCount(1);
  await expect(current).toBeVisible();
  await expect(page.locator(".performance .segments")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("1D preenche falhas curtas, identifica estimativas e mantém interrupções longas", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: {
          TEST: {
            ...assets.TEST,
            history: [{ date: "2026-10-29", close: 100 }],
            intraday: [
              { date: "2026-10-30T09:55:00Z", close: null },
              { date: "2026-10-30T10:00:00Z", close: 100 },
              { date: "2026-10-30T10:05:00Z", close: null },
              { date: "2026-10-30T10:10:00Z", close: 105 },
              { date: "2026-10-30T10:15:00Z", close: null },
              { date: "2026-10-30T10:30:00Z", close: null },
              { date: "2026-10-30T10:35:00Z", close: 110 },
              { date: "2026-10-30T10:40:00Z", close: null },
            ],
          },
        },
      },
    }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "falhas.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2025-01-01,TEST,100,1,buy",
      ),
    });
  await confirmCsvReview(page);
  await page.getByRole("button", { name: "1D", exact: true }).click();
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  const current = page.locator(".performance-current");
  const readout = page.locator(".chart-readout");
  await expect(current).toContainText("+10%");
  await expect(current).toContainText("Estimado");
  await chart.focus();
  await chart.press("Home");
  await expect(readout).toContainText("Indisponível");
  await chart.press("ArrowRight");
  await expect(readout).toContainText("+0%");
  await expect(readout).not.toContainText("Estimado");
  await chart.press("ArrowRight");
  await expect(readout).toContainText("10:05");
  await expect(readout).toContainText("+0%");
  await expect(chart).toHaveAttribute("aria-valuetext", /Estimado.*15 min/);
  await chart.press("ArrowRight");
  await expect(readout).toContainText("+5%");
  await expect(readout).not.toContainText("Estimado");
  await chart.press("End");
  await chart.press("ArrowLeft");
  await chart.press("ArrowLeft");
  await expect(readout).toContainText("10:30");
  await expect(readout).toContainText("Indisponível");
  expect(
    (await chart.locator('svg path[fill="none"]').getAttribute("d"))!.match(
      /M/g,
    ),
  ).toHaveLength(2);
  await chart.press("End");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".performance")
    .screenshot({ path: testInfo.outputPath("rentabilidade-1d-estimada.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("Estimado");
  await expect(page.locator(".chart-limitations")).toContainText("15 min");
});

test("1D sem observações intradiárias não desenha uma reta com os fechos diários", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await page.getByRole("button", { name: "1D", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sem dados intradiários neste dia" }),
  ).toBeVisible();
  await expect(page.locator(".performance-current")).toContainText(
    "Indisponível",
  );
  await expect(page.locator(".performance .chart-interaction")).toHaveCount(0);
  await page.getByRole("button", { name: "Máximo", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Data da rentabilidade" }),
  ).toBeVisible();
});
