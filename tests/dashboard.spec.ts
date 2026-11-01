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
async function openLocal(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
}
const csv =
  "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,120,10,buy\n2024-01-03,TEST,Teste,130,5,sell";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/market?*", (route) =>
    route.fulfill({ json: { assets } }),
  );
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
  const position = page.locator("tbody tr").first();
  await expect(position.locator("td").nth(5)).toContainText("400,00");
  await expect(position.locator("td").nth(5)).toContainText("+23,53%");
  await expect(position.locator("td").nth(6)).toContainText("+30%");
  await page
    .getByRole("button", { name: "Transações", exact: true })
    .first()
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const sale = page.locator("tbody tr").filter({ hasText: "2024-01-03" }).locator("td").nth(6);
  const firstBuy = page.locator("tbody tr").filter({ hasText: "2024-01-01" }).locator("td").nth(6);
  const secondBuy = page.locator("tbody tr").filter({ hasText: "2024-01-02" }).locator("td").nth(6);
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
  const closed = page.locator("tbody tr").filter({ hasText: "2024-01-01" }).locator("td").nth(6);
  const sale = page.locator("tbody tr").filter({ hasText: "2024-01-02" }).locator("td").nth(6);
  const open = page.locator("tbody tr").filter({ hasText: "2024-01-03" }).locator("td").nth(6);
  await expect(closed).toContainText("300,00");
  await expect(closed).toContainText("+30%");
  await expect(closed).toContainText("Lote fechado");
  await expect(sale).toContainText("300,00");
  await expect(sale).toContainText("+30%");
  await expect(open).toContainText("—");
  await expect(open).not.toContainText("0,00");
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
  expect((await downloaded).suggestedFilename()).toBe(
    "carteiras-recuperacao.txt",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Repor armazenamento" }).click();
  await expect(
    page.getByRole("heading", { name: "A minha carteira" }),
  ).toBeVisible();
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
  await expect(readout).toContainText("+10%");
  await chart.focus();
  await chart.press("Home");
  await expect(readout).toContainText("05/01/2024");
  await expect(readout).toContainText("-2,27%");
  await expect(readout).toContainText("+0%");
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
  await page.getByRole("button", { name: "3M", exact: true }).click();
  await expect(chart).toBeVisible();
  await expect(current).toContainText("+14,29%");
  await page.getByRole("button", { name: "Máximo", exact: true }).click();
  await expect(readout).toContainText("Seleciona uma data");
});

test("distinguir rentabilidade histórica indisponível de preços e retorno zero", async ({ page }) => {
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
  await expect(page.locator(".chart-readout")).toContainText("Posições abertas Indisponível");
  await expect(page.locator(".chart-readout")).toContainText("S&P 500 +0%");
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

test("3M, 6M, 1A e YTD recalculam o destaque, o hover e o benchmark", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  const history = [
    { date: "2025-01-03", close: 100 },
    { date: "2025-10-29", close: 105 },
    { date: "2025-12-31", close: 110 },
    { date: "2026-04-29", close: 120 },
    { date: "2026-07-29", close: 130 },
    { date: "2026-10-23", close: 140 },
  ];
  await page.route("**/api/market?*", route => route.fulfill({ json: { assets: {
    TEST: { ...assets.TEST, price: 150, history },
    "^GSPC": { ...assets["^GSPC"], price: 1500, history: history.map(p => ({ ...p, close: p.close * 10 })) },
  } } }));
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "periodos.csv", mimeType: "text/csv", buffer: Buffer.from("date,ticker,pricebuy,shares,type\n2025-01-01,TEST,100,1,buy") });
  const current = page.locator(".performance-current");
  const chart = page.getByRole("slider", { name: "Data da rentabilidade" });
  const readout = page.locator(".chart-readout");
  await expect(current).toContainText("+50%");
  for (const mode of ["Posições abertas", "Rentabilidade total"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    for (const [period, expected] of [["3M", "+15,38%"], ["6M", "+25%"], ["1A", "+42,86%"], ["YTD", "+36,36%"], ["Máximo", "+50%"]]) {
      await page.getByRole("button", { name: period, exact: true }).click();
      await expect(current).toContainText(expected);
      await expect(current).toContainText(period);
      await chart.focus();
      await chart.press("End");
      await expect(readout).toContainText(expected);
      await expect(readout).toContainText(`S&P 500 ${expected}`);
      await expect(readout).toContainText("Atual");
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
  await page.locator(".performance").screenshot({ path: testInfo.outputPath("rentabilidade-ytd.png") });
  await page.emulateMedia({ media: "print" });
  await expect(current).toContainText("YTD");
  await expect(current).toContainText("+36,36%");
  await expect(current).toBeVisible();
  await expect(page.locator(".segments")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test("fechar e reabrir sidebar mantém foco, carteira e conteúdo", async ({ page }, testInfo) => {
  await openLocal(page);
  const sidebar = page.locator("#workspace-sidebar");
  await page.getByRole("button", { name: "Fechar sidebar", exact: true }).click();
  await expect(sidebar).toBeHidden();
  const reopen = page.getByRole("button", { name: "Abrir sidebar", exact: true });
  await expect(reopen).toBeFocused();
  await expect(reopen).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "A minha carteira" })).toBeVisible();
  expect(await page.locator(".main-area").evaluate((element) => getComputedStyle(element).marginLeft)).toBe("0px");
  await reopen.press("Enter");
  await expect(sidebar).toBeVisible();
  const close = page.getByRole("button", { name: "Fechar sidebar", exact: true });
  await expect(close).toBeFocused();
  await expect(close).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("separator", { name: "Largura da sidebar" })).toBeVisible({ visible: testInfo.project.name === "desktop" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(sidebar).toBeHidden();
  await expect(page.locator(".sidebar-reopen")).toBeHidden();
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
  await expect(sidebar).toHaveCSS("width", "390px");
});

test("renomear por botão direito ou edição preserva seleção, transações e gravação", async ({ page }, testInfo) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!));
  await page.getByRole("button", { name: "Criar carteira", exact: true }).click();
  await page.getByLabel("Nome da carteira", { exact: true }).fill("Outra carteira");
  await page.getByRole("dialog").getByRole("button", { name: "Criar carteira", exact: true }).click();
  const first = page.locator(".portfolio-link").filter({ hasText: "A minha carteira" });
  if (testInfo.project.name === "desktop") await first.click({ button: "right" });
  else await page.getByRole("button", { name: "Renomear carteira A minha carteira", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Renomear carteira", exact: true });
  await dialog.getByLabel("Nome da carteira").fill("   ");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Introduz um nome");
  await dialog.getByLabel("Nome da carteira").fill("  Investimentos a longo prazo  ");
  await dialog.getByRole("button", { name: "Guardar nome" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Outra carteira", exact: true })).toBeVisible();
  const renamed = page.locator(".portfolio-link").filter({ hasText: "Investimentos a longo prazo" });
  await expect(renamed).toBeVisible();
  await renamed.focus();
  await renamed.press("Shift+F10");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nome da carteira").fill("Alteração cancelada");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(renamed).toBeVisible();
  await renamed.click();
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Investimentos a longo prazo", exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rendimentos.portfolios.v1")!));
  expect(stored.portfolios[0]).toEqual({ ...original.portfolios[0], name: "Investimentos a longo prazo" });
  await page.screenshot({ path: testInfo.outputPath("sidebar-renomeada.png"), fullPage: true });
});


test("conflito ao renomear mostra erro no diálogo e preserva a versão mais recente", async ({ page }) => {
  await openLocal(page);
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({ name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
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
  await expect(page.getByRole("heading", { name: "Versão mais recente", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("noutro separador");
});

test("entrada sem Supabase conserva acesso explícito ao modo local", async ({ page }) => {
  test.skip(!process.env.TEST_NO_ACCOUNT_CONFIG, "Requer TEST_NO_ACCOUNT_CONFIG=1 e build sem configuração Supabase.");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Rendimentos", exact: true })).toBeVisible();
  await expect(page.getByText(/Supabase não configurado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sessão", exact: true })).toHaveCount(0);
  await expect(page.locator(".metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A minha carteira", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "A minha carteira", exact: true })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "A minha carteira", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "A minha carteira", exact: true })).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(1);
});
