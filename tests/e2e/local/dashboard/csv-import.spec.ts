import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  csv,
  mockMarketAndGeography,
  navigateTo,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("consultar e descarregar o exemplo antes de escolher o CSV", async ({
  page,
}) => {
  await openLocal(page);
  await page.locator(".data-actions summary").click();
  await page
    .locator(".data-actions")
    .getByRole("button", { name: "Importar CSV" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Importar CSV",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByText("Consultar formato e exemplo CSV", { exact: false })
    .click();
  await expect(dialog.getByLabel("Exemplo de CSV")).toContainText(
    "date,ticker,name,pricebuy,shares,type",
  );
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Descarregar modelo CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("modelo_site_ativos.csv");
  const sample = await readFile((await download.path())!, "utf8");
  expect(sample.trim()).toBe(
    await dialog.getByLabel("Exemplo de CSV").textContent(),
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".metric").first()).toContainText("0,00");
  await page.locator(".data-actions summary").click();
  await page
    .locator(".data-actions")
    .getByRole("button", { name: "Importar CSV" })
    .click();
  const chooserPromise = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Escolher ficheiro CSV" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "modelo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sample),
  });
  await confirmCsvReview(page);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText(
    "2 transações importadas",
  );
  await page
    .getByRole("link", { name: "Transações", exact: true })
    .first()
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("importar, calcular, persistir, filtrar e imprimir", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openLocal(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect(page.locator(".metric").nth(0)).toContainText("2100,00");
  await expect(page.locator(".metric").nth(1)).toContainText("550,00");
  await expect(
    page.locator(".metric").nth(1).locator(":scope > strong"),
  ).toHaveText("+25%");
  await expect(page.locator(".metric").nth(1).locator("small")).toContainText(
    "550,00",
  );
  await navigateTo(page, "Posições");
  await page
    .getByRole("textbox", { name: "Pesquisar ativo" })
    .fill("inexistente");
  await expect(
    page.getByText("Nenhuma posição corresponde à pesquisa.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Pesquisar ativo" }).fill("");
  await page.reload();
  await navigateTo(page, "Posições");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const position = page.locator("tbody tr").first();
  await expect(position.locator(".position-profit")).toContainText("400,00");
  await expect(position.locator(".position-gain > strong")).toHaveText(
    "+23,53%",
  );
  await expect(position.locator(".position-profit strong")).toContainText(
    "400,00",
  );
  await position.getByLabel("Ver detalhes de TEST", { exact: true }).click();
  await expect(position.locator(".position-details")).toContainText("+30%");
  await page
    .getByRole("link", { name: "Transações", exact: true })
    .first()
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const sale = page
    .locator("tbody tr")
    .filter({ has: page.locator('time[datetime="2024-01-03"]') })
    .locator(".transaction-gain");
  const firstBuy = page
    .locator("tbody tr")
    .filter({ has: page.locator('time[datetime="2024-01-01"]') })
    .locator(".transaction-gain");
  const secondBuy = page
    .locator("tbody tr")
    .filter({ has: page.locator('time[datetime="2024-01-02"]') })
    .locator(".transaction-gain");
  await expect(sale).toContainText("150,00");
  await expect(sale).toContainText("+30%");
  await expect(sale).toContainText("Realizado");
  await expect(page.locator("table")).not.toContainText("FIFO");
  await expect(firstBuy).toContainText("350,00");
  await expect(firstBuy).toContainText("+35%");
  await expect(firstBuy).toContainText("5 em carteira");
  await expect(secondBuy).toContainText("200,00");
  await expect(secondBuy).toContainText("+16,67%");
  const screenViewport = page.viewportSize()!;
  // A4 landscape minus the 14 mm margins from @page, converted to CSS pixels.
  await page.setViewportSize({ width: 1016, height: 794 });
  await page.emulateMedia({ media: "print" });
  await expect(firstBuy).toContainText("+35%");
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
    path: testInfo.outputPath("transaction-gains-print.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize(screenViewport);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("transaction-gains.png"),
    fullPage: true,
  });
  await navigateTo(page, "Visão geral");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".metrics")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("portfolio.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("falha de mercado e CSV inválido não inventam valores nem perdem ordens", async ({
  page,
}) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ status: 503, json: { error: "indisponível" } }),
  );
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "indisponível",
  );
  await expect(page.locator(".metric").nth(0)).toContainText("—");
  await expect(page.locator(".performance-current")).toContainText(
    "Indisponível",
  );
  await expect(page.locator(".metric").nth(2)).toContainText("150,00");
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2024-01-04,TEST,100,99,sell",
      ),
    });
  await expect(
    page
      .getByRole("dialog", { name: "Rever importação CSV" })
      .getByRole("alert"),
  ).toContainText("superior");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(stored.portfolios[0].orders).toHaveLength(3);
});
