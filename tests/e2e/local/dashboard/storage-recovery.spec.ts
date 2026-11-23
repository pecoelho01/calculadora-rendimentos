import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
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

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("alteração noutro separador impede sobrescrita", async ({
  page,
  context,
}) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const second = await context.newPage();
  await second.route("**/api/geography?*", (route) =>
    route.fulfill({ json: { geographies: {} } }),
  );
  await second.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets } }),
  );
  await openLocal(second);
  await expect(second.locator("tbody tr")).toHaveCount(1);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p2.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,ticker,pricebuy,shares\n2024-01-04,TEST,100,1"),
    });
  await confirmCsvReview(page);
  await expect(page.getByRole("status")).toContainText("1 transação importada");
  await second
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p3.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,ticker,pricebuy,shares\n2024-01-05,TEST,100,2"),
    });
  await confirmCsvReview(second);
  await expect(
    second
      .getByRole("dialog", { name: "Rever importação CSV" })
      .getByRole("alert"),
  ).toContainText("Não foi possível guardar");
  await second.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(second.getByRole("status")).toContainText("noutro separador");
  const stored = await second.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(stored.portfolios[0].orders).toHaveLength(4);
  await second.close();
});

test("restaurar backup JSON e assinalar cotações noutra moeda", async ({
  page,
}) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: { ...assets, TEST: { ...assets.TEST, currency: "USD" } },
      },
    }),
  );
  await openLocal(page);
  const backup = {
    version: 1,
    portfolios: [
      {
        id: "restored",
        name: "Carteira recuperada",
        currency: "EUR",
        orders: [
          {
            id: "order1",
            date: "2024-01-01",
            ticker: "TEST",
            name: "Teste",
            pricebuy: 100,
            shares: 1,
            type: "buy",
          },
        ],
      },
    ],
  };
  page.once("dialog", (d) => d.accept());
  await page
    .getByLabel("Restaurar cópia de segurança", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    selectedPortfolio(page).filter({ hasText: "Carteira recuperada" }),
  ).toBeVisible();
  await expect(page.locator(".metric").nth(0)).toContainText("—");
  await navigateTo(page, "Posições");
  await expect(
    page.getByText("Cotação em USD; carteira em EUR").filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    selectedPortfolio(page).filter({ hasText: "Carteira recuperada" }),
  ).toBeVisible();
});

test("armazenamento corrompido preserva dados até reposição explícita", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("rendimentos.portfolios.v1", "conteudo-invalido"),
  );
  await openLocal(page);
  await expect(
    page.getByRole("heading", { name: "Recuperar carteiras" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos.portfolios.v1"),
    ),
  ).toBe("conteudo-invalido");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar dados originais" }).click();
  const originalDownload = await downloaded;
  expect(originalDownload.suggestedFilename()).toBe(
    "carteiras-recuperacao.txt",
  );
  expect(await readFile((await originalDownload.path())!, "utf8")).toBe(
    "conteudo-invalido",
  );
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Repor armazenamento" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos.portfolios.v1"),
    ),
  ).toBe("conteudo-invalido");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Repor armazenamento" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
  await openSidebar(page);
  await page
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Criar carteira",
    exact: true,
  });
  await dialog.getByLabel("Nome da carteira").fill("Carteira após recuperação");
  await dialog
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("rendimentos.portfolios.v1")!,
      ).portfolios.map((p: { name: string }) => p.name),
    ),
  ).toContain("Carteira após recuperação");
});

test("reposição de armazenamento corrompido preserva alterações noutro separador", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("rendimentos.portfolios.v1", "original-corrompido"),
  );
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recuperar carteiras", exact: true }),
  ).toBeVisible();
  const replacement = JSON.stringify({
    version: 1,
    portfolios: [
      {
        id: "recuperada-noutro-separador",
        name: "Dados mais recentes",
        currency: "EUR",
        orders: [],
      },
    ],
  });
  await page.evaluate(
    (value) => localStorage.setItem("rendimentos.portfolios.v1", value),
    replacement,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Repor armazenamento", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "alterado noutro separador",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos.portfolios.v1"),
    ),
  ).toBe(replacement);
});
