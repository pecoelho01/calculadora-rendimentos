import { test, expect } from "@playwright/test";
import { confirmCsvReview } from "../../../helpers/csv-helpers";
import {
  csv,
  mockMarketAndGeography,
  navigateTo,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";
import { openListFilters } from "../../../helpers/dashboard/list-filters";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("mostrar o resumo apenas na visão geral", async ({ page }) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  await expect(page.locator(".metric")).toHaveCount(4);
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  await expect(
    page.locator(".list-compact").getByLabel("Período da rentabilidade"),
  ).toHaveCount(0);

  for (const tab of ["Posições", "Transações"]) {
    await navigateTo(page, new RegExp(`^${tab}`));
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(page.locator(".charts-grid")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: tab, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".page-heading")).not.toContainText(
      "A minha carteira",
    );
    await expect(page.locator(".summary-strip .metric")).toHaveCount(3);
    if ((page.viewportSize()?.width ?? 1440) > 800)
      await expect(
        page.getByRole("heading", {
          name:
            tab === "Posições" ? "As tuas posições" : "Histórico de transações",
        }),
      ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(
      tab === "Posições" ? 1 : 3,
    );
    await expect(
      page.getByRole("textbox", { name: "Pesquisar ativo" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".metrics")).toHaveCount(0);
    await expect(page.locator("table")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  }

  await navigateTo(page, "Visão geral");
  await expect(page.locator(".metric")).toHaveCount(4);
  await expect(page.locator(".metric").first()).toContainText("2100,00");
  await expect(page.locator(".charts-grid")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Visão Geral", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".page-heading")).not.toContainText(
    "A minha carteira",
  );
});

test("distinguir carteira vazia de posições fechadas", async ({ page }) => {
  await openLocal(page);
  if ((page.viewportSize()?.width ?? 1440) > 800) {
    await page.setViewportSize({ width: 1280, height: 800 });
    const allocationContent = page.locator(".allocation-content");
    const allocationFooter = page.locator(".allocation-footer");
    const distributionTabs = page.getByRole("group", {
      name: "Tipo de distribuição",
    });

    for (const tabName of ["ETFs", "Geografia"]) {
      await distributionTabs.getByRole("button", { name: tabName }).click();
      const contentBounds = await allocationContent.boundingBox();
      const footerBounds = await allocationFooter.boundingBox();

      expect(contentBounds).not.toBeNull();
      expect(footerBounds).not.toBeNull();
      expect(contentBounds!.y + contentBounds!.height).toBeLessThanOrEqual(
        footerBounds!.y,
      );
      expect(
        await allocationContent.evaluate(
          (element) => element.scrollHeight <= element.clientHeight,
        ),
      ).toBe(true);
    }
  }
  await navigateTo(page, /^Posições/);
  await expect(
    page.getByRole("heading", { name: "Ainda não tens posições" }),
  ).toBeVisible();
  await navigateTo(page, "Transações");
  await expect(
    page.getByRole("heading", { name: "Ainda não tens transações" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Adicionar transação", exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "fechada.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-02,TEST,Teste,130,10,sell",
      ),
    });
  await confirmCsvReview(page);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await navigateTo(page, /^Posições/);
  await expect(
    page.getByText("Não tens posições abertas.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await openListFilters(page, "posições");
  await page.getByRole("button", { name: "Fechadas 1", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Fechada");
  await expect(
    page.getByRole("button", { name: "Limpar pesquisa" }),
  ).toHaveCount(0);
});

test("ações agrupadas acessíveis por teclado e metodologia completa na impressão", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  const actions = page.locator(".data-actions");
  const toggle = actions.locator("summary");
  await toggle.focus();
  await toggle.press("Enter");
  await expect(
    page
      .locator(".data-actions")
      .getByRole("button", { name: "Importar CSV", exact: true }),
  ).toBeVisible();
  await expect(
    actions.getByRole("button", {
      name: "Restaurar cópia de segurança",
      exact: true,
    }),
  ).toBeVisible();
  await toggle.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(
    page
      .locator(".data-actions")
      .getByRole("button", { name: "Importar CSV", exact: true }),
  ).toBeHidden();
  await toggle.press("Enter");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar transações CSV", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe("transacoes.csv");
  await expect(actions).not.toHaveAttribute("open");
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "portfolio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await confirmCsvReview(page);
  const methodology = page.locator(".chart-methodology");
  const explanation = methodology.locator(".fine-print");
  await expect(page.locator(".chart-limitations")).toContainText(
    "Sem dividendos, comissões ou câmbio",
  );
  const labels = await page.locator(".chart-date").evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    }),
  );
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
  await page.screenshot({
    path: testInfo.outputPath("relatorio.png"),
    fullPage: true,
  });
});

test("acomodar totais elevados nos cartões e recuperar de um filtro sem vendas", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "valor-elevado.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,1000000000000,1000000000000,buy",
      ),
    });
  await confirmCsvReview(page);
  await navigateTo(page, "Transações");
  await page.getByRole("button", { name: "Vendas 0", exact: true }).click();
  await expect(page.locator(".no-results")).toContainText(
    "Não tens vendas registadas.",
  );
  await page
    .getByRole("button", { name: "Ver todas as transações", exact: true })
    .click();
  await expect(page.locator(".transactions-table tbody tr")).toHaveCount(1);
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page
        .locator(".transactions-view")
        .evaluate((panel) => panel.scrollWidth <= panel.clientWidth),
    ).toBe(true);
    const units = await page
      .locator(".transaction-mobile-description")
      .boundingBox();
    const total = await page.locator(".transaction-total").boundingBox();
    expect(units!.y + units!.height).toBeLessThanOrEqual(total!.y);
    expect(
      await page
        .locator(".transaction-total > strong, .transaction-gain strong")
        .evaluateAll((amounts) =>
          amounts.every((amount) => {
            const range = document.createRange();
            range.selectNodeContents(amount);
            const text = range.getBoundingClientRect();
            const cell = amount.closest("td")!.getBoundingClientRect();
            return (
              text.left >= cell.left - 1 &&
              text.right <= cell.right + 1 &&
              range.getClientRects().length === 1
            );
          }),
        ),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("transactions-large-amount.png"),
    fullPage: true,
  });
});
