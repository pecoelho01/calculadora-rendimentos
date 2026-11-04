import { openSidebar, navigateTo, selectedPortfolio } from "./sidebar-helpers";
import { test, expect, type Page } from "@playwright/test";
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
};
async function openLocal(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
}
const csv =
  "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,120,10,buy\n2024-01-03,TEST,Teste,130,5,sell";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: {} } }));
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets } }),
  );
});
test("mostrar o resumo apenas na visão geral", async ({ page }) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.locator(".metric")).toHaveCount(4);
  await expect(page.locator(".metric").first()).toContainText("2100,00");

  for (const tab of ["Posições", "Transações"]) {
    await navigateTo(page, new RegExp(`^${tab}`));
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(page.locator(".charts-grid")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: tab, exact: true })).toBeVisible();
    await expect(page.locator(".page-heading")).not.toContainText("A minha carteira");
    await expect(page.getByRole("heading", {
      name: tab === "Posições" ? "As tuas posições" : "Histórico de transações",
    })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(tab === "Posições" ? 1 : 3);
    await expect(page.getByRole("textbox", { name: "Pesquisar ativo" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(page.locator("table")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  }

  await navigateTo(page, "Visão geral");
  await expect(page.locator(".metric")).toHaveCount(4);
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  await expect(page.locator(".charts-grid")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
  await expect(page.locator(".page-heading")).not.toContainText("A minha carteira");
});
test("manter pesquisas independentes e permitir limpar resultados vazios", async ({ page }, testInfo) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  await search.fill("Teste");
  await navigateTo(page, /^Posições/);
  await expect(search).toHaveValue("");
  await search.fill("sem posição");
  await expect(page.locator(".no-results")).toContainText("Nenhuma posição corresponde à pesquisa.");
  await navigateTo(page, "Transações");
  await expect(search).toHaveValue("");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await search.fill("sem transação");
  await expect(page.locator(".no-results")).toContainText("Nenhuma transação corresponde à pesquisa.");
  await navigateTo(page, /^Posições/);
  await expect(search).toHaveValue("sem posição");
  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("posicoes.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1, name: "Posições", exact: true })).toBeVisible();
  await expect(page.locator(".page-heading")).not.toContainText("A minha carteira");
  await page.emulateMedia({ media: "screen" });
  await navigateTo(page, "Transações");
  await expect(search).toHaveValue("sem transação");
  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("transacoes.png"), fullPage: true });
  await navigateTo(page, "Visão geral");
  await expect(search).toHaveValue("Teste");
});
test("distinguir carteira vazia de posições fechadas", async ({ page }) => {
  await openLocal(page);
  await navigateTo(page, /^Posições/);
  await expect(page.getByRole("heading", { name: "Ainda não tens posições" })).toBeVisible();
  await navigateTo(page, "Transações");
  await expect(page.getByRole("heading", { name: "Ainda não tens transações" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar transação", exact: false })).toBeVisible();
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "fechada.csv", mimeType: "text/csv",
    buffer: Buffer.from("date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,130,10,sell"),
  });
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await navigateTo(page, /^Posições/);
  await expect(page.getByText("Não tens posições abertas.", { exact: false })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Fechadas 1", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Fechada");
  await expect(page.getByRole("button", { name: "Limpar pesquisa" })).toHaveCount(0);
});
test("consultar e descarregar o exemplo antes de escolher o CSV", async ({ page }) => {
  await openLocal(page);
  await page.locator(".data-actions summary").click();
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
  await page.locator(".data-actions summary").click();
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
  await expect(page.locator(".metric").nth(0)).toContainText("2100,00");
  await expect(page.locator(".metric").nth(1)).toContainText("550,00");
  await expect(page.locator(".metric").nth(1).locator(":scope > strong")).toHaveText("+25%");
  await expect(page.locator(".metric").nth(1).locator("small")).toContainText("550,00");
  await page
    .getByRole("textbox", { name: "Pesquisar ativo" })
    .fill("inexistente");
  await expect(page.getByText("Nenhuma posição corresponde à pesquisa.", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Pesquisar ativo" }).fill("");
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const position = page.locator("tbody tr").first();
  await expect(position.locator(".position-gain")).toContainText("400,00");
  await expect(position.locator(".position-gain > strong")).toHaveText("+23,53%");
  await expect(position.locator(".gain-amount")).toContainText("400,00");
  await position.getByLabel("Ver detalhes de TEST", { exact: true }).click();
  await expect(position.locator(".position-details")).toContainText("+30%");
  await page
    .getByRole("button", { name: "Transações", exact: true })
    .first()
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const sale = page.locator("tbody tr").filter({ has: page.locator('time[datetime="2024-01-03"]') }).locator(".transaction-gain");
  const firstBuy = page.locator("tbody tr").filter({ has: page.locator('time[datetime="2024-01-01"]') }).locator(".transaction-gain");
  const secondBuy = page.locator("tbody tr").filter({ has: page.locator('time[datetime="2024-01-02"]') }).locator(".transaction-gain");
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
  expect(await page.locator("table").evaluate((table) => table.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("transaction-gains-print.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize(screenViewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("transaction-gains.png"), fullPage: true });
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
test("ganhos de compras fechadas e vendas permanecem sem cotação atual", async ({ page }) => {
  await page.unroute("**/api/market?*");
  await page.route("**/api/market?*", (route) => route.fulfill({ json: { assets: {} } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "fechada.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,130,10,sell\n2024-01-03,TEST,Teste,120,1,buy"),
  });
  await page.getByRole("button", { name: "Transações", exact: true }).first().click();
  const closed = page.locator("tbody tr").filter({ has: page.locator('time[datetime="2024-01-01"]') }).locator(".transaction-gain");
  const sale = page.locator("tbody tr").filter({ has: page.locator('time[datetime="2024-01-02"]') }).locator(".transaction-gain");
  const open = page.locator("tbody tr").filter({ has: page.locator('time[datetime="2024-01-03"]') }).locator(".transaction-gain");
  await expect(closed).toContainText("300,00");
  await expect(closed).toContainText("+30%");
  await expect(closed).toContainText("Lote fechado");
  await expect(sale).toContainText("300,00");
  await expect(sale).toContainText("+30%");
  await expect(open).toContainText("—");
  await expect(open).not.toContainText("0,00");
});
test("escolher tickers da carteira e registar um novo ativo", async ({ page }) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`${csv}\n2024-01-04,CLOSED,Ativo fechado,10,1,buy\n2024-01-05,CLOSED,Ativo fechado,12,1,sell`),
  });
  await page.getByRole("button", { name: "Nova transação" }).click();
  const dialog = page.getByRole("dialog");
  const choice = dialog.getByLabel("Ativo da transação");
  await expect(choice.locator("option")).toHaveText([
    "Novo ticker", "CLOSED · Ativo fechado", "TEST · Teste",
  ]);
  await choice.selectOption("CLOSED");
  await expect(dialog.getByLabel("Nome do ativo")).toHaveValue("Ativo fechado");
  await choice.selectOption("TEST");
  await expect(dialog.getByLabel("Nome do ativo")).toHaveValue("Teste");
  await expect(dialog.getByLabel("Ticker Yahoo")).toHaveCount(0);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await dialog.getByLabel("Preço por unidade").fill("100");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!));
  expect(saved.portfolios[0].orders.slice(-2)).toMatchObject([
    { ticker: "TEST", name: "Teste", shares: 2, pricebuy: 100 },
    { ticker: "NEW", name: "Novo ativo", shares: 1, pricebuy: 50 },
  ]);
  await page.getByRole("button", { name: "Nova transação" }).click();
  await expect(choice.locator("option")).toHaveText([
    "Novo ticker", "CLOSED · Ativo fechado", "NEW · Novo ativo", "TEST · Teste",
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
  await page.getByLabel("Operação").selectOption("sell");
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
  await page.getByRole("combobox", { name: /^Moeda/ }).selectOption("USD");
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
  await openLocal(page);
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
  await expect(page.locator(".performance-current")).toContainText("Indisponível");
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
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "p.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const second = await context.newPage();
  await second.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: {} } }));
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
  await expect(page.getByRole("status")).toContainText("1 transação importada");
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
  await expect(page.getByText("Cotação em USD; carteira em EUR").filter({ visible: true })).toBeVisible();
  await expect(page.locator(".metric").nth(0)).toContainText("—");
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
  expect(originalDownload.suggestedFilename()).toBe("carteiras-recuperacao.txt");
  expect(await readFile((await originalDownload.path())!, "utf8")).toBe("conteudo-invalido");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Repor armazenamento" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rendimentos.portfolios.v1"))).toBe("conteudo-invalido");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Repor armazenamento" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
  await openSidebar(page);
  await page.getByRole("button", { name: "Criar carteira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Criar carteira", exact: true });
  await dialog.getByLabel("Nome da carteira").fill("Carteira após recuperação");
  await dialog.getByRole("button", { name: "Criar carteira", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!).portfolios.map((p: { name: string }) => p.name))).toContain("Carteira após recuperação");
});

test("explorar rentabilidade por rato, toque e teclado sem confundir o histórico com o valor atual", async ({ page }, testInfo) => {
  await page.route("**/api/market?*", (route) => route.fulfill({
    json: { assets: { ...assets, TEST: { ...assets.TEST, price: 160 } } },
  }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  const current = page.locator(".performance-current");
  await expect(page.getByRole("button", { name: "Posições abertas", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(current).toContainText("+41,18%");
  await page.getByRole("button", { name: "Rentabilidade total", exact: true }).click();
  await expect(current).toContainText("+38,64%");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  const readout = page.locator(".chart-readout");
  await chart.scrollIntoViewIfNeeded();
  const last = await chart.locator("svg").evaluate((svg) => {
    const point = new DOMPoint((svg as SVGSVGElement).viewBox.baseVal.width - 30, 100).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  if (testInfo.project.name === "mobile") await page.touchscreen.tap(last.x, last.y);
  else await page.mouse.move(last.x, last.y);
  await expect(readout).toContainText("Atual");
  await expect(readout).toContainText("+38,64%");
  await expect(readout).not.toContainText("S&P 500");
  await chart.focus();
  await chart.press("Home");
  await expect(readout).toContainText("05/01/2024");
  await expect(readout).toContainText("-2,27%");
  await expect(chart).not.toHaveAttribute("aria-valuetext", /S&P 500/);
  await chart.press("ArrowRight");
  await expect(chart).toHaveAttribute("aria-valuetext", /12\/01\/2024.*\+25%/);
  await page.locator(".performance").screenshot({ path: testInfo.outputPath("grafico-interativo.png") });
  await page.emulateMedia({ media: "print" });
  await expect(readout).toBeHidden();
  await expect(page.locator(".chart-cursor")).toBeHidden();
  await expect(current).toBeVisible();
  await expect(chart.locator("svg")).toBeVisible();
  await expect(page.getByRole("group", { name: "Tipo de rentabilidade" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await expect(chart).toBeVisible();
  await expect(current).toContainText("+14,29%");
  await page.getByRole("button", { name: "Máximo", exact: true }).click();
  await expect(readout).toContainText("Seleciona uma data");
});

test("distinguir preço histórico zero de retorno atual zero", async ({ page }) => {
  await page.route("**/api/market?*", (route) => route.fulfill({
    json: { assets: { ...assets, TEST: { ...assets.TEST, price: 100, history: [{ date: "2024-01-12", close: 0 }] } } },
  }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from("date,ticker,pricebuy,shares,type\n2024-01-01,TEST,100,10,buy"),
  });
  await expect(page.locator(".performance-current")).toContainText("+0%");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  await chart.focus();
  await chart.press("Home");
  await expect(page.locator(".chart-readout")).toContainText("Posições abertas -100%");
  await chart.press("End");
  await expect(page.locator(".chart-readout")).toContainText("Posições abertas +0%");
  await chart.press("ArrowLeft");
  await expect(page.locator(".chart-readout")).toContainText("Posições abertas -100%");
});

test("alternar ROI total e posições abertas com FIFO no resumo, histórico e impressão", async ({ page }, testInfo) => {
  await openLocal(page);
  await expect(page.locator(".performance-current")).toContainText("Indisponível");
  await page.getByRole("button", { name: "Rentabilidade total", exact: true }).click();
  await expect(page.locator(".performance-current")).toContainText("+0%");
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "fifo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const current = page.locator(".performance-current");
  await expect(current).toContainText("+25%");
  await page.getByRole("button", { name: "Posições abertas", exact: true }).click();
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
  await page.locator(".performance").screenshot({ path: testInfo.outputPath("fifo-posicoes-abertas.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("Rentabilidade das posições abertas");
  await expect(current).toBeVisible();
  await expect(page.getByRole("group", { name: "Tipo de rentabilidade" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Rentabilidade total", exact: true }).click();
  await expect(page.locator(".chart-readout")).toContainText("Seleciona uma data");
  await chart.focus();
  await chart.press("Home");
  await expect(page.locator(".chart-readout")).toContainText("-2,27%");
  await expect(current).toContainText("+25%");
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "fecho.csv", mimeType: "text/csv", buffer: Buffer.from("date,ticker,pricebuy,shares,type\n2024-01-15,TEST,140,15,sell") });
  await page.getByRole("button", { name: "Posições abertas", exact: true }).click();
  await expect(current).toContainText("Indisponível");
  // Existing historical points remain available after the current position closes.
  await chart.focus();
  await chart.press("End");
  await expect(page.locator(".chart-readout")).toContainText("Indisponível");
  await chart.press("ArrowLeft");
  await expect(page.locator(".chart-readout")).toContainText("+23,53%");
  await page.getByRole("button", { name: "Rentabilidade total", exact: true }).click();
  await expect(current).toContainText("+25%");
});

test("Os sete períodos recalculam o destaque e o hover sem benchmark", async ({ page }, testInfo) => {
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
  await page.route("**/api/market?*", route => route.fulfill({ json: { assets: {
    TEST: { ...assets.TEST, price: 150, history, intraday: [
      { date: "2026-10-30T10:00:00Z", close: 148 },
      { date: "2026-10-30T10:05:00Z", close: 152 },
      { date: "2026-10-30T10:10:00Z", close: 145 },
      { date: "2026-10-30T10:15:00Z", close: 149 },
      { date: "2026-10-30T10:20:00Z", close: 150 },
    ] },
  } } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "periodos.csv", mimeType: "text/csv", buffer: Buffer.from("date,ticker,pricebuy,shares,type\n2025-01-01,TEST,100,1,buy") });
  const current = page.locator(".performance-current");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  const readout = page.locator(".chart-readout");
  await expect(current).toContainText("+50%");
  await expect(page.locator(".performance .segments button")).toHaveText(["1D", "5D", "1M", "6M", "YTD", "1A", "Máximo"]);
  for (const mode of ["Posições abertas", "Rentabilidade total"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    for (const [period, expected] of [["1D", "+1,35%"], ["5D", "+7,14%"], ["1M", "+15,38%"], ["6M", "+25%"], ["YTD", "+36,36%"], ["1A", "+42,86%"], ["Máximo", "+50%"]]) {
      await page.getByRole("button", { name: period, exact: true }).click();
      await expect(current).toContainText(expected);
      await expect(current).toContainText(period);
      const axisLabels = page.locator(".performance .chart-date");
      if (period === "1D") {
        await expect(axisLabels).toHaveText(["10:00", "10:10", "10:20"]);
        const path = await chart.locator("svg path").getAttribute("d");
        const coordinates = [...path!.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((match) => Number(match[2]));
        expect(coordinates).toHaveLength(5);
        expect(coordinates[1]).toBeLessThan(coordinates[0]);
        expect(coordinates[2]).toBeGreaterThan(coordinates[1]);
        expect(coordinates[3]).toBeLessThan(coordinates[2]);
        await expect(page.locator(".chart-limitations")).toContainText("Horas em UTC");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (mode === "Posições abertas") {
          await page.locator(".performance").screenshot({ path: testInfo.outputPath("rentabilidade-1d.png") });
          await page.emulateMedia({ media: "print" });
          await expect(axisLabels).toHaveText(["10:00", "10:10", "10:20"]);
          await page.emulateMedia({ media: "screen" });
        }
      } else {
        for (const label of await axisLabels.allTextContents()) {
          expect(label).toMatch(/\S+(?:\s+|\/)\d{2}$/);
          expect(label).not.toContain(":");
        }
        await expect(page.locator(".chart-limitations")).not.toContainText("Horas em UTC");
      }
      await chart.focus();
      await chart.press("End");
      await expect(readout).toContainText(expected);
      await expect(page.locator(".performance")).not.toContainText(/S&P 500|índice/);
      await expect(chart).not.toHaveAttribute("aria-valuetext", /S&P 500/);
      await expect(chart.locator("svg path")).toHaveCount(1);
      await expect(readout).toContainText(period === "1D" ? "Última observação" : "Atual");
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
  await expect(page.locator(".performance")).not.toContainText("Passa o rato ou toca no gráfico");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".performance").screenshot({ path: testInfo.outputPath("rentabilidade-ytd.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("YTD");
  await expect(current).toContainText("+36,36%");
  await expect(page.locator(".performance")).not.toContainText(/S&P 500|índice/);
  await expect(chart.locator("svg path")).toHaveCount(1);
  await expect(current).toBeVisible();
  await expect(page.locator(".performance .segments")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("1D preenche falhas curtas, identifica estimativas e mantém interrupções longas", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  await page.route("**/api/market?*", route => route.fulfill({ json: { assets: {
    TEST: { ...assets.TEST, history: [{ date: "2026-10-29", close: 100 }], intraday: [
      { date: "2026-10-30T09:55:00Z", close: null },
      { date: "2026-10-30T10:00:00Z", close: 100 },
      { date: "2026-10-30T10:05:00Z", close: null },
      { date: "2026-10-30T10:10:00Z", close: 105 },
      { date: "2026-10-30T10:15:00Z", close: null },
      { date: "2026-10-30T10:30:00Z", close: null },
      { date: "2026-10-30T10:35:00Z", close: 110 },
      { date: "2026-10-30T10:40:00Z", close: null },
    ] },
  } } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "falhas.csv", mimeType: "text/csv", buffer: Buffer.from("date,ticker,pricebuy,shares,type\n2025-01-01,TEST,100,1,buy") });
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
  expect((await chart.locator("svg path").getAttribute("d"))!.match(/M/g)).toHaveLength(2);
  await chart.press("End");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".performance").screenshot({ path: testInfo.outputPath("rentabilidade-1d-estimada.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("Estimado");
  await expect(page.locator(".chart-limitations")).toContainText("15 min");
});

test("1D sem observações intradiárias não desenha uma reta com os fechos diários", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "1D", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sem dados intradiários neste dia" })).toBeVisible();
  await expect(page.locator(".performance-current")).toContainText("Indisponível");
  await expect(page.locator(".performance .chart-interaction")).toHaveCount(0);
  await page.getByRole("button", { name: "Máximo", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Data da rentabilidade" })).toBeVisible();
});


test("ações agrupadas acessíveis por teclado e metodologia completa na impressão", async ({ page }, testInfo) => {
  await openLocal(page);
  const actions = page.locator(".data-actions");
  const toggle = actions.locator("summary");
  await toggle.focus();
  await toggle.press("Enter");
  await expect(page.getByRole("button", { name: "Importar CSV", exact: true })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Restaurar cópia de segurança", exact: true })).toBeVisible();
  await toggle.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(page.getByRole("button", { name: "Importar CSV", exact: true })).toBeHidden();
  await toggle.press("Enter");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar transações CSV", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("transacoes.csv");
  await expect(actions).not.toHaveAttribute("open");
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  const methodology = page.locator(".chart-methodology");
  const explanation = methodology.locator(".fine-print");
  await expect(page.locator(".chart-limitations")).toBeVisible();
  const labels = await page.locator(".chart-date").evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right };
  }));
  for (let index = 1; index < labels.length; index++) {
    expect(labels[index].left).toBeGreaterThan(labels[index - 1].right);
  }
  await expect(explanation).toBeHidden();
  await methodology.locator("summary").click();
  await expect(explanation).toBeVisible();
  await methodology.locator("summary").click();
  await page.emulateMedia({ media: "print" });
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText("não é TWR nem anualizado");
  await expect(page.locator(".heading-actions")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("relatorio.png"), fullPage: true });
});

test("recolher navegação mantém atalhos no desktop e devolve foco no telemóvel", async ({ page }, testInfo) => {
  await openLocal(page);
  const mobile = testInfo.project.name === "mobile";
  const sidebar = page.locator("#workspace-sidebar");
  const drawer = page.locator("#workspace-drawer");
  if (mobile) {
    await expect(sidebar).toBeHidden();
    await expect(page.locator(".mobile-workspace-title")).toContainText("A minha carteira");
    await openSidebar(page);
    await expect(drawer).toHaveJSProperty("open", true);
    await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeFocused();
    await expect(sidebar).toBeHidden();
    await openSidebar(page);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeFocused();
    await navigateTo(page, "Posições");
    await expect(page.getByRole("heading", { name: "Posições", level: 1, exact: true })).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Fechar sidebar", exact: true }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.locator(".main-area")).toHaveCSS("margin-left", "72px");
    const reopen = page.getByRole("button", { name: "Abrir sidebar", exact: true });
    await expect(reopen).toBeFocused();
    await expect(reopen).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Transações", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Transações", level: 1, exact: true })).toBeVisible();
    await expect(page.locator(".sidebar-portfolios")).toBeHidden();
    await expect(page.getByRole("separator", { name: "Largura da sidebar" })).toBeHidden();
    await reopen.press("Enter");
    await expect(page.getByRole("button", { name: "Fechar sidebar", exact: true })).toBeFocused();
    await expect(page.locator(".main-area")).toHaveCSS("margin-left", "248px");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("navegacao.png"), fullPage: true });
  await openSidebar(page);
  await page.emulateMedia({ media: "print" });
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("barra inferior permite navegar e mantém o conteúdo acessível no telemóvel", async ({ page }, testInfo) => {
  await openLocal(page);
  const navigation = page.locator(".mobile-navigation");
  if (testInfo.project.name === "desktop") {
    await expect(navigation).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    return;
  }
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button")).toHaveCount(3);
  for (const [name, heading] of [["Posições", "Posições"], ["Transações", "Transações"], ["Visão geral", "Visão Geral"]]) {
    const target = navigation.getByRole("button", { name, exact: true });
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(target).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole("heading", { name: heading, level: 1, exact: true })).toBeVisible();
    await expect(page.locator("#workspace-drawer")).not.toHaveAttribute("open");
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastAction = page.getByRole("button", { name: "Eliminar carteira", exact: true });
  await expect(lastAction).toBeInViewport();
  expect((await lastAction.boundingBox())!.y + (await lastAction.boundingBox())!.height).toBeLessThanOrEqual((await navigation.boundingBox())!.y);
  await navigation.getByRole("button", { name: "Posições", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await navigateTo(page, "Notas explicativas");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(0);
  await navigation.getByRole("button", { name: "Transações", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transações", level: 1, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("barra-inferior.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(navigation).toBeHidden();
  await expect(page.locator(".main-area")).toHaveCSS("padding-bottom", "0px");
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(navigation).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Transações", exact: true })).toHaveAttribute("aria-current", "page");
});

test("gaveta móvel contém o foco, fecha pelo fundo e adapta-se ao desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Fluxo da gaveta móvel.");
  await openLocal(page);
  await openSidebar(page);
  const drawer = page.getByRole("dialog", { name: "Navegação e carteiras" });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Tab");
    // Native modal navigation can visit browser chrome between the last and first control.
    expect(await page.locator("#workspace-drawer").evaluate((element) =>
      document.activeElement === document.body || element.contains(document.activeElement),
    )).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("gaveta-mobile.png"), fullPage: true });
  await page.mouse.click(380, 400);
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeFocused();
  await openSidebar(page);
  await page.getByRole("button", { name: "Criar carteira", exact: true }).click();
  await expect(page.locator("dialog:modal")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeFocused();
  await openSidebar(page);
  await page.getByRole("button", { name: "Renomear carteira A minha carteira", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeFocused();
  await openSidebar(page);
  await page.getByRole("button", { name: "Renomear carteira A minha carteira", exact: true }).click();
  await page.getByLabel("Nome da carteira").fill("Carteira renomeada");
  await page.getByRole("button", { name: "Guardar nome", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeFocused();
  await expect(page.locator(".mobile-workspace-title")).toContainText("Carteira renomeada");
  await openSidebar(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#workspace-sidebar")).toBeVisible();
  await expect(page.locator("#workspace-drawer")).toHaveJSProperty("open", true);
  await expect.poll(() => page.locator("#workspace-drawer").evaluate((element) => element.matches(":modal"))).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#workspace-sidebar")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("percorrer muitas carteiras sem sobrepor navegação e rodapé", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("rendimentos.portfolios.v1", JSON.stringify({
      version: 1,
      portfolios: Array.from({ length: 30 }, (_, index) => ({
        id: `portfolio-${index}`,
        name: `Carteira ${index + 1} com um nome mais longo`,
        currency: "EUR",
        orders: [],
      })),
    }));
  });
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 390 : 1440, height: 600 });
  await openLocal(page);
  await openSidebar(page);
  const content = page.locator(".sidebar-content");
  expect(await content.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const navBottom = await page.getByRole("navigation", { name: "Navegação principal" }).evaluate((element) => element.getBoundingClientRect().bottom);
  const portfoliosTop = await page.locator(".sidebar-portfolios").evaluate((element) => element.getBoundingClientRect().top);
  expect(portfoliosTop).toBeGreaterThanOrEqual(navBottom);
  const last = page.locator(".portfolio-link").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await last.click();
  await expect(selectedPortfolio(page)).toContainText("Carteira 30");
  await openSidebar(page);
  await page.locator(".sidebar-bottom").scrollIntoViewIfNeeded();
  const lastBottom = await last.evaluate((element) => element.getBoundingClientRect().bottom);
  expect(await page.locator(".sidebar-bottom").evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(lastBottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("dimensionar sidebar por arrasto e teclado respeita limites e mantém o conteúdo alinhado", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "A sidebar móvel ocupa a largura disponível.");
  await openLocal(page);
  const handle = page.getByRole("separator", { name: "Largura da sidebar" });
  const sidebar = page.locator("#workspace-sidebar");
  const drag = async (delta: number) => {
    const bounds = (await handle.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 160);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + delta, bounds.y + 160, { steps: 8 });
    await page.mouse.up();
  };
  await drag(100);
  await expect(handle).toHaveAttribute("aria-valuenow", "348");
  await drag(-60);
  await expect(handle).toHaveAttribute("aria-valuenow", "288");
  await drag(600);
  await expect(handle).toHaveAttribute("aria-valuenow", "420");
  await drag(-600);
  await expect(handle).toHaveAttribute("aria-valuenow", "224");
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "240");
  await handle.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "420");
  await expect(sidebar).toHaveCSS("width", "420px");
  await expect(page.locator(".main-area")).toHaveCSS("margin-left", "420px");
  await page.setViewportSize({ width: 820, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("sidebar-larga.png"), fullPage: true });
  await page.getByRole("button", { name: "Fechar sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Abrir sidebar", exact: true }).click();
  await expect(sidebar).toHaveCSS("width", "420px");
  await handle.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "224");
  await handle.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "224");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toBeHidden();
  await expect(sidebar).toBeHidden();
  await openSidebar(page);
  await expect(sidebar).toHaveCSS("width", "340px");
});

test("renomear por botão direito ou edição preserva seleção, transações e gravação", async ({ page }, testInfo) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!));
  await openSidebar(page);
  await page.getByRole("button", { name: "Criar carteira", exact: true }).click();
  await page.getByLabel("Nome da carteira", { exact: true }).fill("Outra carteira");
  await page.getByRole("dialog").getByRole("button", { name: "Criar carteira", exact: true }).click();
  const first = page.locator(".portfolio-link").filter({ hasText: "A minha carteira" });
  await openSidebar(page);
  if (testInfo.project.name === "desktop") await first.click({ button: "right" });
  else await page.getByRole("button", { name: "Renomear carteira A minha carteira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Renomear carteira", exact: true });
  await dialog.getByLabel("Nome da carteira").fill("   ");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Introduz um nome");
  await dialog.getByLabel("Nome da carteira").fill("  Investimentos a longo prazo  ");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog).toBeHidden();
  await expect(selectedPortfolio(page).filter({ hasText: "Outra carteira" })).toBeVisible();
  const renamed = page.locator(".portfolio-link").filter({ hasText: "Investimentos a longo prazo" });
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
  await expect(selectedPortfolio(page).filter({ hasText: "Investimentos a longo prazo" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!));
  expect(stored.portfolios[0]).toEqual({ ...original.portfolios[0], name: "Investimentos a longo prazo" });
  await page.screenshot({ path: testInfo.outputPath("sidebar-renomeada.png"), fullPage: true });
});


test("conflito ao renomear mostra erro no diálogo e preserva a versão mais recente", async ({ page }) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await openSidebar(page);
  await page.getByRole("button", { name: "Renomear carteira A minha carteira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Renomear carteira", exact: true });
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
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível guardar o nome");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog.getByRole("alert")).toContainText("já não está disponível");
  expect(await page.evaluate(() => localStorage.getItem("rendimentos.portfolios.v1"))).toBe(latest);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(selectedPortfolio(page).filter({ hasText: "Versão mais recente" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("noutro separador");
});

test("entrada sem Supabase conserva acesso explícito ao modo local", async ({ page }) => {
  test.skip(!process.env.TEST_NO_ACCOUNT_CONFIG, "Requer TEST_NO_ACCOUNT_CONFIG=1 e build sem configuração Supabase.");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.getByText("As contas estão indisponíveis. Podes continuar no modo local.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sessão", exact: true })).toHaveCount(0);
  await expect(page.locator(".metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
});

for (const [kind, callback] of [
  ["fragmento", "#access_token=synthetic&refresh_token=synthetic"],
  ["query", "&access_token=synthetic&refresh_token=synthetic"],
  ["código", "&code=synthetic&recovery=1"],
  ["erro", "&error=synthetic&error_description=synthetic"],
]) {
  test(`limpar callback Auth sem Supabase e preservar modo local: ${kind}`, async ({ page }) => {
    test.skip(!process.env.TEST_NO_ACCOUNT_CONFIG, "Requer build sem configuração Supabase válida.");
    let authRequests = 0;
    await page.route("**/auth/v1/**", (route) => { authRequests++; return route.abort(); });
    await page.goto(`/?preservar=1${callback}`);
    await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
    await expect(page.getByText(/Não foi possível validar esta ligação/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar sessão", exact: true })).toHaveCount(0);
    const url = new URL(page.url());
    expect(url.search).toBe("?preservar=1");
    expect(url.hash).toBe("");
    expect(authRequests).toBe(0);
    await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
  });
}

test("eliminar a última carteira local mantém uma carteira vazia no navegador", async ({ page }) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "carteira.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!).portfolios[0].id);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar carteira", exact: true }).click();
  await expect(page.locator(".portfolio-row")).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!).portfolios[0].id)).not.toBe(original);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!));
  expect(saved.portfolios).toHaveLength(1);
  expect(saved.portfolios[0].orders).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true })).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(1);
});

test("mostrar exposição geográfica ponderada, cobertura e fonte em ecrã e impressão", async ({
  page,
}, testInfo) => {
  await page.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: { TEST: {
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
            } } } }));
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
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
  ).toHaveAttribute("href", /ishares\.com/);
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
  await page.getByRole("button", { name: "Atualizar preços" }).click();
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
  await page.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: { TEST: {
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
            } } } }));
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart.locator(".allocation-list > div")).toHaveCount(5);
  await expect(chart.locator(".allocation-list")).toContainText("Europa");
  await expect(chart.locator(".allocation-list")).toContainText("60%");
  await expect(chart.locator(".allocation-list")).not.toContainText(/Estados Unidos|Japão|Portugal|Outros países/);
  await expect(chart.getByRole("button", { name: "Países", exact: true })).toHaveCount(0);
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


test("alternar distribuição no mesmo card e alinhar altura com a rentabilidade", async ({ page }, testInfo) => {
  await openLocal(page);
  const card = page.getByRole("region", { name: "Distribuição da carteira", exact: true });
  const assetsButton = card.getByRole("button", { name: "ETFs", exact: true });
  const geographyButton = card.getByRole("button", { name: "Geografia", exact: true });
  const assertLayout = async () => {
    await expect(page.locator(".charts-grid > .panel")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cardBounds = await card.boundingBox();
    const toggleBounds = await card.locator(".allocation-toggle").boundingBox();
    expect(toggleBounds!.x).toBeGreaterThanOrEqual(cardBounds!.x);
    expect(toggleBounds!.x + toggleBounds!.width).toBeLessThanOrEqual(cardBounds!.x + cardBounds!.width);
    if (testInfo.project.name === "desktop") {
      const performance = await page.locator(".performance").boundingBox();
      const allocation = await card.boundingBox();
      expect(Math.abs(allocation!.height - performance!.height)).toBeLessThan(1);
      expect(Math.abs(allocation!.y - performance!.y)).toBeLessThan(1);
    }
  };
  await expect(assetsButton).toHaveAttribute("aria-pressed", "true");
  await assertLayout();
  await geographyButton.click();
  await expect(geographyButton).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("heading", { name: "Distribuição por continente" })).toBeVisible();
  await expect(card.locator(".asset-allocation")).toBeHidden();
  await assertLayout();
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  await expect(card.locator(".geographic-allocation .allocation-list")).toContainText("100%");
  await assertLayout();
  await assetsButton.click();
  await expect(card.getByRole("img", { name: "Alocação da carteira por valor de mercado", exact: true })).toBeVisible();
  await expect(card.locator(".geographic-view")).toBeHidden();
  await assertLayout();
  await page.emulateMedia({ media: "print" });
  await expect(card.locator(".geographic-view")).toBeVisible();
  await expect(card.locator(".allocation-toggle")).toBeHidden();
  await expect(card.locator(".asset-allocation")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({ path: testInfo.outputPath("distribuicao-etfs.png"), fullPage: true });
  await geographyButton.click();
  await page.screenshot({ path: testInfo.outputPath("distribuicao-geografia.png"), fullPage: true });
});

test("explorar fatias dos ETFs e continentes por rato, toque e teclado", async ({ page }, testInfo) => {
  await page.route("**/api/market?*", (route) => route.fulfill({ json: { assets: {
    ...assets,
    OTHER: { ...assets.TEST, name: "Outro ETF" },
    ZERO: { ...assets.TEST, price: 0, name: "Cotação zero" },
  } } }));
  const geography = (country: string) => ({
    allocations: [{ country, weight: 1 }],
    asOf: "2026-10-30",
    source: "https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5Y983",
  });
  await page.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: {
    TEST: geography("US"), OTHER: geography("JP"),
  } } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "fatias.csv", mimeType: "text/csv",
    buffer: Buffer.from("date,ticker,pricebuy,shares,type\n2024-01-01,TEST,100,10,buy\n2024-01-01,ZERO,100,10,buy\n2024-01-01,OTHER,100,10,buy"),
  });
  const card = page.getByRole("region", { name: "Distribuição da carteira", exact: true });
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
  await expect(assetsChart.locator(".donut-selection").last()).toHaveText("50%");
  await expect(assetsChart.locator(".slice-muted")).toHaveCount(1);
  if (testInfo.project.name === "desktop") {
    await page.mouse.click(x, y);
    await page.mouse.move(0, 0);
    await expect(selectedLabel).toHaveText("TEST");
  }
  await page.keyboard.press("Escape");
  await expect(selectedLabel).toHaveCount(0);
  const other = assetsChart.getByRole("button", { name: "OTHER: 50%", exact: true });
  await other.focus();
  await expect(selectedLabel).toHaveText("OTHER");
  await other.press("Enter");
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await other.press("Escape");
  await expect(selectedLabel).toHaveCount(0);
  await expect(assetsChart.locator(".donut")).toContainText("Ativos3");
  const zero = assetsChart.getByRole("button", { name: "ZERO: 0%", exact: true });
  await zero.focus();
  await zero.press("Space");
  await expect(zero).toHaveAttribute("aria-pressed", "true");
  await expect(selectedLabel).toHaveText("ZERO");
  await card.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = card.getByRole("region", { name: "Distribuição por continente", exact: true });
  await expect(chart).not.toContainText("Exposição dos ETFs por continente");
  const asia = chart.getByRole("button", { name: "Ásia: 50%", exact: true });
  await asia.click();
  await expect(chart.locator(".donut-selection").first()).toHaveText("Ásia");
  await expect(chart.locator(".slice-muted")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("pizza-interativa.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(chart.locator(".donut-selection").first()).toBeHidden();
  await expect(chart.locator(".donut-default").first()).toHaveText("Cobertura");
  await expect(chart.locator(".donut-default").last()).toBeVisible();
  await expect(chart.locator(".donut-default").last()).toHaveText("100%");
  expect(await chart.locator(".slice-muted").evaluateAll((paths) => paths.every((path) => getComputedStyle(path).opacity === "1"))).toBe(true);
});

test("organizar posições por estado, valor e rentabilidade sem confundir zero com cotação ausente", async ({ page }, testInfo) => {
  const marketAssets = {
    ...assets,
    AAA: { ...assets.TEST, name: "Alpha", price: 50 },
    ZERO: { ...assets.TEST, name: "Zero válido", price: 0 },
    MISSING: { ...assets.TEST, name: "Sem dados", price: null },
    FX: { ...assets.TEST, name: "Outra moeda", price: 99, currency: "USD" },
    CLOSED: { ...assets.TEST, name: "Encerrada", price: null },
  };
  await page.route("**/api/market?*", (route) => route.fulfill({ json: { assets: marketAssets } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "posicoes.csv", mimeType: "text/csv",
    buffer: Buffer.from([
      "date,ticker,name,pricebuy,shares,type",
      "2024-01-01,TEST,Teste,100,10,buy",
      "2024-01-01,AAA,Alpha,25,2,buy",
      "2024-01-01,ZERO,Zero válido,10,1,buy",
      "2024-01-01,MISSING,Sem dados,10,1,buy",
      "2024-01-01,FX,Outra moeda,10,1,buy",
      "2024-01-01,CLOSED,Encerrada,10,2,buy",
      "2024-01-02,CLOSED,Encerrada,15,2,sell",
    ].join("\n")),
  });
  await navigateTo(page, /^Posições/);
  const rows = page.locator(".positions-table tbody tr");
  const tickers = () => page.locator(".position-identity a").allTextContents();
  await expect(rows).toHaveCount(5);
  await expect(rows.first().locator(".position-value")).toContainText("1400,00");
  expect((await tickers()).map((ticker) => ticker.trim())).toEqual(["TEST", "AAA", "ZERO", "FX", "MISSING"]);
  const zero = rows.filter({ has: page.locator(".position-identity a", { hasText: /^ZERO/ }) });
  const missing = rows.filter({ has: page.locator(".position-identity a", { hasText: /^MISSING/ }) });
  const fx = rows.filter({ has: page.locator(".position-identity a", { hasText: /^FX/ }) });
  await expect(zero.locator(".position-value strong")).toHaveText(/0,00/);
  await expect(zero.locator(".position-gain")).toContainText("-10,00");
  await expect(missing.locator(".position-value strong")).toHaveText("—");
  await expect(missing.locator(".position-gain strong")).toHaveText("—");
  await expect(fx.locator(".position-value strong")).toHaveText("—");
  await expect(fx.locator(".position-quote")).toContainText("Cotação em USD; carteira em EUR");
  await page.getByRole("button", { name: "Ordenação descendente. Inverter ordem" }).click();
  expect((await tickers()).map((ticker) => ticker.trim())).toEqual(["ZERO", "AAA", "TEST", "FX", "MISSING"]);
  await page.getByLabel("Ordenar posições por").selectOption("return");
  await expect(rows.first()).toContainText("AAA");
  await page.getByLabel("Ordenar posições por").selectOption("asset");
  await expect(rows.first()).toContainText("AAA");
  if (testInfo.project.name === "desktop") {
    await page.locator("th").first().getByRole("button").click();
    await expect(page.locator("th").first()).toHaveAttribute("aria-sort", "descending");
    await expect(rows.first()).toContainText("ZERO");
  }
  await page.getByRole("button", { name: "Fechadas 1", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".position-gain")).toContainText("+10,00");
  await expect(rows.first().locator(".position-gain")).toContainText("+50%");
  await page.getByRole("button", { name: "Todas 6", exact: true }).click();
  await expect(rows).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath("positions-all.png"), fullPage: true });
  const originalViewport = page.viewportSize()!;
  for (const width of [360, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".positions-view").evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true);
    const singleLineAmounts = await page.locator(".position-value > strong, .position-gain > strong").evaluateAll((amounts) =>
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
  await expect(page.locator(".position-details dd").last()).toContainText("29/10/2026");
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".position-mobile-detail").first()).toBeVisible();
    await expect(page.locator(".position-mobile-detail").nth(1)).toContainText("100,00");
    await expect(page.locator(".position-mobile-detail").nth(2)).toContainText("140,00");
  }
  await disclosure.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("positions-redesign.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("positions-redesign-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 1016, height: 794 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".position-details dd").last()).toBeVisible();
  await expect(page.locator(".position-details")).toContainText("Ganho realizado");
  await expect(page.locator(".position-context")).toContainText("Todas · Pesquisa: “Teste”");
  await expect(page.locator(".position-filters")).toBeHidden();
  expect(await page.locator("table").evaluate((table) => table.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("positions-redesign-print.png"), fullPage: true });
});

test("filtrar e ordenar transações, consultar detalhes e preservar a validação de remoção", async ({ page }, testInfo) => {
  await page.route("**/api/market?*", (route) => route.fulfill({ json: {
    assets: { ...assets, AAA: { ...assets.TEST, name: "Alpha", price: 50 } },
  } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "transacoes.csv", mimeType: "text/csv",
    buffer: Buffer.from(`${csv}\n2024-01-02,AAA,Alpha,25,2,buy\n2024-01-04,TEST,Teste,150,1,sell`),
  });
  await navigateTo(page, "Transações");
  const rows = page.locator(".transactions-table tbody tr");
  await expect(rows).toHaveCount(5);
  expect(await rows.locator("time").evaluateAll((times) => times.map((time) => time.getAttribute("datetime"))))
    .toEqual(["2024-01-04", "2024-01-03", "2024-01-02", "2024-01-02", "2024-01-01"]);
  expect(await rows.locator(".transaction-identity strong").allTextContents()).toEqual(["TEST", "TEST", "TEST", "AAA", "TEST"]);
  await expect(rows.first().locator("time")).toContainText("jan.");
  await expect(rows.first().locator(".transaction-total")).toContainText("150,00");
  await expect(rows.first().locator(".transaction-gain")).toContainText("+50,00");
  await expect(rows.first().locator(".transaction-gain")).toContainText("Realizado");
  await page.getByRole("button", { name: "Compras 3", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator(".transaction-gain")).toContainText("Total da compra");
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  await search.fill("Alpha");
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Vendas 2", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".no-results")).toContainText("Nenhuma transação corresponde à pesquisa.");
  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Vendas 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Todas 5", exact: true }).click();
  await page.getByLabel("Ordenar transações por").selectOption("total");
  await expect(rows.first().locator(".transaction-total")).toContainText("1200,00");
  await page.getByRole("button", { name: "Ordenação descendente. Inverter ordem" }).click();
  await expect(rows.first()).toContainText("AAA");
  await page.getByLabel("Ordenar transações por").selectOption("asset");
  await expect(rows.first()).toContainText("AAA");
  if (testInfo.project.name === "desktop") {
    await page.locator("th").nth(1).getByRole("button").click();
    await expect(page.locator("th").nth(1)).toHaveAttribute("aria-sort", "descending");
    await expect(rows.first()).toContainText("TEST");
  }
  const viewport = page.viewportSize()!;
  for (const width of [360, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".transactions-view").evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true);
    expect(await page.locator(".transaction-total > strong, .transaction-gain strong").evaluateAll((amounts) => amounts.every((amount) => {
      const range = document.createRange();
      range.selectNodeContents(amount);
      return range.getClientRects().length === 1;
    }))).toBe(true);
  }
  await page.setViewportSize(viewport);
  await page.screenshot({ path: testInfo.outputPath("transactions-redesign.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("transactions-redesign-dark.png"), fullPage: true });
  const alphaDetails = page.getByLabel("Ver detalhes de AAA de 2024-01-02", { exact: true });
  await alphaDetails.focus();
  await alphaDetails.press("Enter");
  const alpha = rows.filter({ hasText: "AAA" });
  await expect(alpha.locator(".transaction-explanation")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(alpha.locator(".transaction-mobile-detail")).toBeVisible();
    await expect(alpha.locator(".transaction-mobile-detail")).toContainText("25,00");
  }
  await page.screenshot({ path: testInfo.outputPath("transactions-details.png"), fullPage: true });
  await alphaDetails.press("Enter");
  await page.getByRole("button", { name: "Compras 3", exact: true }).click();
  await search.fill("Alpha");
  await page.setViewportSize({ width: 1016, height: 794 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".transaction-explanation")).toBeVisible();
  await expect(page.locator(".transaction-context")).toContainText("Compras · Pesquisa: “Alpha”");
  await expect(page.locator(".transaction-filters")).toBeHidden();
  await expect(page.getByRole("button", { name: "Remover AAA de 2024-01-02" })).toBeHidden();
  expect(await page.locator("table").evaluate((table) => table.getBoundingClientRect().right <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("transactions-redesign-print.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize(viewport);
  await search.fill("");
  await page.getByRole("button", { name: "Todas 5", exact: true }).click();
  await page.getByLabel("Ver detalhes de TEST de 2024-01-01", { exact: true }).click();
  // The first purchase alone is not required, but removing both buys is invalid.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remover TEST de 2024-01-01", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await page.getByLabel("Ver detalhes de TEST de 2024-01-02", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remover TEST de 2024-01-02", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("superior");
  await expect(rows).toHaveCount(4);
  await expect(page.locator(".transaction-gain").filter({ hasText: "Realizado" })).toHaveCount(2);
});

test("acomodar totais elevados nos cartões e recuperar de um filtro sem vendas", async ({ page }, testInfo) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "valor-elevado.csv", mimeType: "text/csv",
    buffer: Buffer.from("date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,1000000000000,1000000000000,buy"),
  });
  await navigateTo(page, "Transações");
  await page.getByRole("button", { name: "Vendas 0", exact: true }).click();
  await expect(page.locator(".no-results")).toContainText("Não tens vendas registadas.");
  await page.getByRole("button", { name: "Ver todas as transações", exact: true }).click();
  await expect(page.locator(".transactions-table tbody tr")).toHaveCount(1);
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator(".transactions-view").evaluate((panel) => panel.scrollWidth <= panel.clientWidth)).toBe(true);
    expect(await page.locator(".transaction-total > strong, .transaction-gain strong").evaluateAll((amounts) => amounts.every((amount) => {
      const range = document.createRange();
      range.selectNodeContents(amount);
      const text = range.getBoundingClientRect();
      const cell = amount.closest("td")!.getBoundingClientRect();
      return text.left >= cell.left - 1 && text.right <= cell.right + 1 && range.getClientRects().length === 1;
    }))).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("transactions-large-amount.png"), fullPage: true });
});


test("reposição de armazenamento corrompido preserva alterações noutro separador", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("rendimentos.portfolios.v1", "original-corrompido"));
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recuperar carteiras", exact: true })).toBeVisible();
  const replacement = JSON.stringify({ version: 1, portfolios: [{ id: "recuperada-noutro-separador", name: "Dados mais recentes", currency: "EUR", orders: [] }] });
  await page.evaluate((value) => localStorage.setItem("rendimentos.portfolios.v1", value), replacement);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Repor armazenamento", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("alterado noutro separador");
  expect(await page.evaluate(() => localStorage.getItem("rendimentos.portfolios.v1"))).toBe(replacement);
});
