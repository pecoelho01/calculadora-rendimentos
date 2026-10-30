import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const assets = {
  TEST: {
    price: 140,
    previousClose: 130,
    currency: "EUR",
    name: "Teste",
    asOf: "2026-10-29T16:00:00Z",
    history: [
      { date: "2024-01-05", close: 100 },
      { date: "2024-01-12", close: 140 },
    ],
  },
  "^GSPC": {
    price: 4400,
    previousClose: 4300,
    currency: "USD",
    name: "S&P 500",
    asOf: null,
    history: [
      { date: "2024-01-05", close: 4000 },
      { date: "2024-01-12", close: 4400 },
    ],
  },
};
const csv =
  "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,120,10,buy\n2024-01-03,TEST,Teste,130,5,sell";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets } }),
  );
});
test("consultar e descarregar o exemplo antes de escolher o CSV", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar CSV", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Exemplo de CSV")).toContainText("date,ticker,name,pricebuy,shares,type");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Descarregar modelo CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("modelo_site_ativos.csv");
  const sample = await readFile((await download.path())!, "utf8");
  expect(sample.trim()).toBe(await dialog.getByLabel("Exemplo de CSV").textContent());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".metric").first()).toContainText("0,00");
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Escolher ficheiro CSV" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "modelo.csv", mimeType: "text/csv", buffer: Buffer.from(sample) });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("2 transações importadas");
  await page.getByRole("button", { name: "Transações", exact: true }).first().click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});
test("importar, calcular, persistir, filtrar e imprimir", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A minha carteira" }),
  ).toBeVisible();
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator(".metric").nth(0)).toContainText("2100,00");
  await expect(page.locator(".metric").nth(1)).toContainText("550,00");
  await expect(page.locator(".metric").nth(1)).toContainText("+25%");
  await page
    .getByRole("textbox", { name: "Pesquisar ativo" })
    .fill("inexistente");
  await expect(page.getByText("Nenhum ativo encontrado.")).toBeVisible();
  await page.getByRole("textbox", { name: "Pesquisar ativo" }).fill("");
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Transações", exact: true })
    .first()
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
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
test("registar ordens, bloquear venda excessiva e criar carteira", async ({
  page,
}) => {
  await page.goto("/");
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
  await page.getByLabel("Operação").selectOption("sell");
  await page.getByLabel("Ticker Yahoo").fill("TEST");
  await page.getByLabel("Quantidade", { exact: true }).fill("3");
  await page.getByLabel("Preço por unidade").fill("120");
  await page.getByRole("button", { name: "Guardar transação" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "superior",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await page.getByLabel("Nome da carteira").fill("Longo prazo");
  await page.getByRole("combobox", { name: /^Moeda/ }).selectOption("USD");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Longo prazo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exportar backup JSON", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar backup JSON", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("carteiras.json");
});
test("falha de mercado e CSV inválido não inventam valores nem perdem ordens", async ({
  page,
}) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ status: 503, json: { error: "indisponível" } }),
  );
  await page.goto("/");
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "indisponível",
  );
  await expect(page.locator(".metric").nth(0)).toContainText("—");
  await expect(page.locator(".metric").nth(2)).toContainText("100,00");
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,pricebuy,shares,type\n2024-01-04,TEST,100,99,sell",
      ),
    });
  await expect(page.getByRole("status")).toContainText("superior");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(stored.portfolios[0].orders).toHaveLength(3);
});
test("alteração noutro separador impede sobrescrita", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const second = await context.newPage();
  await second.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets } }),
  );
  await second.goto("/");
  await expect(second.locator("tbody tr")).toHaveCount(1);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p2.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,ticker,pricebuy,shares\n2024-01-04,TEST,100,1"),
    });
  await expect(page.getByRole("status")).toContainText("1 transações");
  await second
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p3.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,ticker,pricebuy,shares\n2024-01-05,TEST,100,2"),
    });
  await expect(second.getByRole("status")).toContainText("noutro separador");
  const stored = await second.evaluate(() =>
    JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!),
  );
  expect(stored.portfolios[0].orders).toHaveLength(4);
  await second.close();
});
test("API rejeita datas e símbolos inválidos antes de consultar Yahoo", async ({
  request,
}) => {
  for (const url of [
    "/api/market?tickers=TEST&start=2024-13-01",
    "/api/market?tickers=https://evil.test&start=2024-01-01",
  ]) {
    const result = await request.get(url);
    expect(result.status()).toBe(400);
  }
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
  await page.goto("/");
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
    page.getByRole("heading", { name: "Carteira recuperada" }),
  ).toBeVisible();
  await expect(page.getByText("Cotação em USD; carteira em EUR")).toBeVisible();
  await expect(page.locator(".metric").nth(0)).toContainText("—");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Carteira recuperada" }),
  ).toBeVisible();
});
test("armazenamento corrompido preserva dados até reposição explícita", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("rendimentos.portfolios.v1", "conteudo-invalido"),
  );
  await page.goto("/");
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
  expect((await downloaded).suggestedFilename()).toBe(
    "carteiras-recuperacao.txt",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Repor armazenamento" }).click();
  await expect(
    page.getByRole("heading", { name: "A minha carteira" }),
  ).toBeVisible();
});
