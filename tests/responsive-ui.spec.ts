import { expect, test } from "@playwright/test";
import { navigateTo } from "./sidebar-helpers";

const portfolios = [
  { id: "euros", name: "Investimentos em euros", currency: "EUR", orders: [
    { id: "buy-eur", date: "2024-01-01", ticker: "TEST", name: "Ativo de teste", pricebuy: 100, shares: 10, type: "buy" },
  ] },
  { id: "dollars", name: "Investimentos em dólares", currency: "USD", orders: [] },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => localStorage.setItem("rendimentos.portfolios.v1", JSON.stringify({ version: 1, portfolios: data })), portfolios);
  await page.route("**/api/market?*", (route) => route.fulfill({ json: { assets: { TEST: {
    name: "Ativo de teste", price: 120, currency: "EUR", asOf: "2026-11-10T16:00:00Z",
    history: [{ date: "2024-01-01", close: 100 }, { date: "2024-01-02", close: 120 }],
  } } } }));
  await page.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: {} } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
});

test("trocar carteira pelo seletor e abrir conta pela navegação móvel", async ({ page }, testInfo) => {
  const selector = page.getByRole("combobox", { name: "Selecionar carteira", exact: true });
  await expect(selector.locator("option:checked")).toHaveText("Investimentos em euros · EUR");
  await selector.selectOption("dollars");
  await expect(selector.locator("option:checked")).toHaveText("Investimentos em dólares · USD");
  await expect(page.locator(".positions-table")).toHaveCount(0);
  await selector.selectOption("euros");
  await expect(page.locator(".positions-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".metric.featured")).toContainText("1200,00");
  if (testInfo.project.name === "mobile") {
    const navigation = page.getByRole("navigation", { name: "Navegação móvel", exact: true });
    await navigation.getByRole("link", { name: "Conta", exact: true }).click();
    await expect(page).toHaveURL(/\/conta$/);
    await expect(navigation.getByRole("link", { name: "Conta", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Definições da conta", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ativar tema/ })).toHaveCount(1);
    await navigation.getByRole("button", { name: "Posições", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Posições", exact: true, level: 1 })).toBeVisible();
    await expect(selector.locator("option:checked")).toHaveText("Investimentos em euros · EUR");
  }
});

test("manter listas e formulários legíveis nas larguras do handoff", async ({ page }) => {
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Posições", "Transações"]) {
      await navigateTo(page, name);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const row = await page.locator("tbody tr").boundingBox();
      expect(row!.x).toBeGreaterThanOrEqual(0);
      expect(row!.x + row!.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: "Nova transação", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nova transação", exact: true });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  }
});

test("respeitar a densidade das referências e calcular a pré-visualização da ordem", async ({ page }, testInfo) => {
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".performance")).toBeVisible();
    const chart = await page.locator(".performance").boundingBox();
    expect(chart!.height).toBeGreaterThanOrEqual(300);
    expect(chart!.height).toBeLessThanOrEqual(380);
    expect((await page.locator(".holdings").boundingBox())!.y).toBeLessThan(850);
    await expect(page.locator(".list-compact .positions-toolbar")).toBeHidden();
  } else {
    await navigateTo(page, "Posições");
    expect((await page.locator("tbody tr").first().boundingBox())!.y).toBeLessThan(300);
    expect((await page.locator("tbody tr").first().boundingBox())!.height).toBeLessThan(220);
  }
  await page.getByRole("button", { name: "Nova transação", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Nova transação", exact: true });
  await form.getByLabel("Quantidade", { exact: true }).fill("2");
  await form.getByLabel("Preço por unidade (EUR)", { exact: true }).fill("570");
  await expect(form.locator("output")).toContainText("1140,00");
  await form.getByRole("radio", { name: "Venda", exact: true }).check();
  await expect(form.locator("output")).toContainText("1140,00");
  await form.getByLabel("Quantidade", { exact: true }).fill("inválido");
  await expect(form.locator("output")).toHaveText("—");
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".transactions-table")).toHaveCount(0);
});
