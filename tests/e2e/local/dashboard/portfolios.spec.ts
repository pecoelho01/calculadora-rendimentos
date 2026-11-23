import { test, expect } from "@playwright/test";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  openSidebar,
  selectedPortfolio,
} from "../../../helpers/sidebar-helpers";
import {
  csv,
  mockMarketAndGeography,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("renomear por botão direito ou edição preserva seleção, transações e gravação", async ({
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
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  const original = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  await openSidebar(page);
  await page
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await page
    .getByLabel("Nome da carteira", { exact: true })
    .fill("Outra carteira");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  const first = page
    .locator(".portfolio-link")
    .filter({ hasText: "A minha carteira" });
  await openSidebar(page);
  if (testInfo.project.name === "desktop")
    await first.click({ button: "right" });
  else
    await page
      .getByRole("button", {
        name: "Renomear carteira A minha carteira",
        exact: true,
      })
      .click();
  const dialog = page.getByRole("dialog", {
    name: "Renomear carteira",
    exact: true,
  });
  await dialog.getByLabel("Nome da carteira").fill("   ");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Introduz um nome");
  await dialog
    .getByLabel("Nome da carteira")
    .fill("  Investimentos a longo prazo  ");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    selectedPortfolio(page).filter({ hasText: "Outra carteira" }),
  ).toBeVisible();
  const renamed = page
    .locator(".portfolio-link")
    .filter({ hasText: "Investimentos a longo prazo" });
  await openSidebar(page);
  await expect(renamed).toBeVisible();
  await renamed.focus();
  await renamed.press("Shift+F10");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nome da carteira").fill("Alteração cancelada");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await openSidebar(page);
  await expect(renamed).toBeVisible();
  await renamed.click();
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  await page.reload();
  await expect(
    selectedPortfolio(page).filter({ hasText: "Investimentos a longo prazo" }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(stored.portfolios[0]).toEqual({
    ...original.portfolios[0],
    name: "Investimentos a longo prazo",
  });
  await page.screenshot({
    path: testInfo.outputPath("sidebar-renomeada.png"),
    fullPage: true,
  });
});

test("conflito ao renomear mostra erro no diálogo e preserva a versão mais recente", async ({
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
  await openSidebar(page);
  await page
    .getByRole("button", {
      name: "Renomear carteira A minha carteira",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Renomear carteira",
    exact: true,
  });
  await dialog.getByLabel("Nome da carteira").fill("Nome desatualizado");
  const latest = await page.evaluate(() => {
    const key = "rendimentos.portfolios.v1";
    const data = JSON.parse(localStorage.getItem(key)!);
    data.portfolios[0].id = "nova-carteira";
    data.portfolios[0].name = "Versão mais recente";
    const encoded = JSON.stringify(data);
    localStorage.setItem(key, encoded);
    return encoded;
  });
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Não foi possível guardar o nome",
  );
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "já não está disponível",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos.portfolios.v1"),
    ),
  ).toBe(latest);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    selectedPortfolio(page).filter({ hasText: "Versão mais recente" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("noutro separador");
});

test("eliminar a última carteira local mantém uma carteira vazia no navegador", async ({
  page,
}) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "carteira.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const original = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!)
        .portfolios[0].id,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".data-actions summary").click();
  await page
    .locator(".data-actions")
    .getByRole("button", { name: "Eliminar carteira", exact: true })
    .click();
  await expect(page.locator(".portfolio-row")).toHaveCount(1);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!)
            .portfolios[0].id,
      ),
    )
    .not.toBe(original);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(saved.portfolios).toHaveLength(1);
  expect(saved.portfolios[0].orders).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(1);
});
