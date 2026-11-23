import { type Page, type TestInfo } from "@playwright/test";
import { confirmCsvReview } from "./csv-helpers";

export const assets = {
  TEST: {
    price: 140,
    previousClose: 130,
    currency: "EUR",
    name: "Teste",
    asOf: "2026-10-29T16:00:00Z",
    history: [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 120 },
      { date: "2024-01-03", close: 130 },
      { date: "2024-01-05", close: 100 },
      { date: "2024-01-12", close: 140 },
    ],
  },
};

// Respostas fixas de mercado e geografia, para os testes não dependerem do Yahoo.
export async function mockMarketAndGeography(page: Page) {
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({ json: { geographies: {} } }),
  );
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets } }),
  );
}

export const csv =
  "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,120,10,buy\n2024-01-03,TEST,Teste,130,5,sell";

export async function openLocal(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
}

export function positionPeriodGroup(page: Page) {
  return page.getByRole("group", { name: "Período da rentabilidade" });
}

export { navigateTo } from "./sidebar-helpers";

export async function openPeriodPreferences(page: Page, testInfo: TestInfo) {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);

  if (testInfo.project.name === "mobile") {
    await page
      .getByRole("navigation", { name: "Navegação móvel" })
      .getByRole("link", { name: "Conta", exact: true })
      .click();
    return;
  }

  await page
    .getByRole("link", { name: "Definições da conta", exact: true })
    .click();
}
