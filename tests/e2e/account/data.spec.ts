import { test, expect } from "@playwright/test";
import type { Portfolio } from "../../../src/lib/types";
import { confirmCsvReview } from "../../helpers/csv-helpers";
import { navigateTo, selectedPortfolio } from "../../helpers/sidebar-helpers";
import {
  storageKey,
  localPortfolio,
  localJson,
  userA,
  setup,
} from "../../helpers/account/mock-backend";
import {
  openAccountSettings,
  accountAction,
  assertNoOverflow,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test("migração local explícita é repetível e conserva dados dos dois modos", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await accountAction(page, "Copiar carteiras locais para a conta");
  expect(state.requests).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await accountAction(page, "Copiar carteiras locais para a conta");
  await expect(page.locator(".portfolio-row")).toHaveCount(2);
  expect(state.requests[0].changes).toEqual([]);
  expect(state.requests[0].migration?.key).toMatch(/^[a-f0-9]{64}$/);
  expect(state.requests[0].migration?.portfolios).toEqual([localPortfolio]);
  page.once("dialog", (dialog) => dialog.accept());
  await accountAction(page, "Copiar carteiras locais para a conta");
  await expect.poll(() => state.requests.length).toBe(2);
  await expect(
    page.getByText(/Carteiras locais copiadas para a conta/),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(2);
  expect(state.requests[1].migration?.key).toBe(
    state.requests[0].migration?.key,
  );
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
    "Carteira da Ana",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await assertNoOverflow(page);
});

test("conta vazia permite criar a primeira carteira sem copiar dados locais", async ({
  page,
}, testInfo) => {
  const state = await setup(page, true);
  state.accounts[userA] = { version: 1, portfolios: [] };
  await page.goto("/");
  await openAccountSettings(page);
  await expect(
    page.getByRole("button", {
      name: "Copiar carteiras locais para a conta",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("link", { name: "Voltar às carteiras", exact: true })
    .click();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adicionar transação", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nova transação", exact: true }),
  ).toBeDisabled();
  await assertNoOverflow(page);
  const noticeText = await page
    .locator(".account-empty-notice > span")
    .boundingBox();
  const noticeButton = await page
    .locator(".account-empty-notice .button")
    .boundingBox();
  expect(noticeText && noticeButton).toBeTruthy();
  expect(
    noticeText!.x + noticeText!.width <= noticeButton!.x ||
      noticeText!.y + noticeText!.height <= noticeButton!.y,
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("conta-vazia.png"),
    fullPage: true,
  });
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nova transação", exact: true }),
  ).toHaveCount(0);
  const dialog = page.getByRole("dialog", {
    name: "Criar carteira",
    exact: true,
  });
  await dialog
    .getByLabel("Nome da carteira")
    .fill("Primeira carteira na conta");
  await dialog
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    selectedPortfolio(page).getByText("Primeira carteira na conta", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.requests[0].changes).toHaveLength(1);
  expect(state.requests[0].changes[0].expectedRevision).toBe(null);
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .click();
  const orderDialog = page.getByRole("dialog", {
    name: "Nova transação",
    exact: true,
  });
  await expect(orderDialog).toBeVisible();
  await orderDialog.getByLabel("Ticker Yahoo").fill("TEST");
  await orderDialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await orderDialog.getByLabel("Preço por unidade").fill("100");
  await orderDialog
    .getByRole("button", { name: "Guardar transação", exact: true })
    .click();
  await expect(orderDialog).toBeHidden();
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(1);
  expect(state.accounts[userA].portfolios[0].revision).toBe(2);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await assertNoOverflow(page);
});

test("eliminar a última carteira da conta mantém a conta vazia após confirmação e recarga", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.delayNextWrite = true;
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".data-actions summary").click();
  await page
    .locator(".data-actions")
    .getByRole("button", { name: "Eliminar carteira", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].changes).toEqual([
    { id: "remote-a", portfolio: null, expectedRevision: 3 },
  ]);
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.releaseWrite();
  await expect(
    page.getByText("A tua conta ainda não tem carteiras.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  expect(state.accounts[userA].portfolios).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Criar a primeira carteira",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".portfolio-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Adicionar transação", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Criar carteira",
    exact: true,
  });
  await dialog
    .getByLabel("Nome da carteira")
    .fill("Nova carteira após eliminação");
  await dialog
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    selectedPortfolio(page).getByText("Nova carteira após eliminação", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios).toHaveLength(1);
  await assertNoOverflow(page);
});

test("recarregar conta limpa as pesquisas de todos os separadores e preserva os títulos", async ({
  page,
}) => {
  const state = await setup(page, true);
  state.accounts[userA].portfolios[0].portfolio.orders = [
    {
      id: "buy-test",
      date: "2024-01-01",
      ticker: "TEST",
      name: "Teste",
      pricebuy: 100,
      shares: 10,
      type: "buy",
    },
  ];
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Pesquisar ativo" });
  for (const tab of (page.viewportSize()?.width ?? 1440) <= 800
    ? ["Posições", "Transações"]
    : ["Visão geral", "Posições", "Transações"]) {
    await navigateTo(page, new RegExp(`^${tab}`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(`^${tab}$`, "i"),
      }),
    ).toBeVisible();
    await search.fill("sem resultado");
  }
  await accountAction(page, "Recarregar dados da conta");
  await expect(search).toHaveValue("");
  for (const tab of (page.viewportSize()?.width ?? 1440) <= 800
    ? ["Posições", "Transações"]
    : ["Visão geral", "Posições", "Transações"]) {
    await navigateTo(page, new RegExp(`^${tab}`));
    await expect(search).toHaveValue("");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  }
  expect(state.requests).toHaveLength(0);
  await assertNoOverflow(page);
});

test(
  "CSV remoto é atómico, conserva ordem no mesmo dia e só envia tickers/data ao mercado",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    const marketRequests: URL[] = [];
    const geographyRequests: URL[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/market?"))
        marketRequests.push(new URL(request.url()));
      if (request.url().includes("/api/geography?"))
        geographyRequests.push(new URL(request.url()));
    });
    await page.goto("/");
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    const csv =
      "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy\n2024-01-01,TEST,Teste,120,3,sell";
    await page
      .getByLabel("Importar ficheiro CSV", { exact: true })
      .setInputFiles({
        name: "ordens.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
    await confirmCsvReview(page);
    await expect
      .poll(() => state.accounts[userA].portfolios[0].portfolio.orders.length)
      .toBe(2);
    expect(
      state.accounts[userA].portfolios[0].portfolio.orders.map(
        (order) => order.type,
      ),
    ).toEqual(["buy", "sell"]);
    expect(state.requests[0].changes[0].expectedRevision).toBe(3);
    await expect.poll(() => marketRequests.length).toBeGreaterThan(0);
    expect([...marketRequests[0].searchParams.keys()].sort()).toEqual([
      "start",
      "tickers",
    ]);
    expect(marketRequests[0].searchParams.get("tickers")).toBe("TEST");
    await expect.poll(() => geographyRequests.length).toBeGreaterThan(0);
    for (const url of geographyRequests) {
      expect([...url.searchParams.keys()]).toEqual(["tickers"]);
      expect(url.searchParams.get("tickers")).toBe("TEST");
    }
    const invalid =
      "date,ticker,name,pricebuy,shares,type\n2024-01-02,TEST,Teste,120,8,sell\n2024-01-03,TEST,Teste,120,1,buy";
    await page
      .getByLabel("Importar ficheiro CSV", { exact: true })
      .setInputFiles({
        name: "venda-invalida.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(invalid),
      });
    await expect(
      page.getByText(/venda superior à posição disponível/),
    ).toBeVisible();
    expect(state.requests).toHaveLength(1);
    expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(
      2,
    );
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
  },
);

test(
  "restauro JSON na conta valida todas as carteiras antes do lote com revisões",
  { tag: "@desktop-only" },
  async ({ page }) => {
    const state = await setup(page, true);
    await page.goto("/");
    await expect(
      selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
    ).toBeVisible();
    const restored: Portfolio = {
      id: "backup-one",
      name: "Carteira restaurada",
      currency: "USD",
      orders: [],
    };
    const invalid = JSON.stringify({
      version: 1,
      portfolios: [
        restored,
        { ...restored, id: "backup-two", currency: "INVALID" },
      ],
    });
    await page
      .getByLabel("Restaurar cópia de segurança", { exact: true })
      .setInputFiles({
        name: "invalido.json",
        mimeType: "application/json",
        buffer: Buffer.from(invalid),
      });
    await expect(
      page.getByText("Carteira inválida.", { exact: true }),
    ).toBeVisible();
    expect(state.requests).toHaveLength(0);
    expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
      "Carteira da Ana",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByLabel("Restaurar cópia de segurança", { exact: true })
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ version: 1, portfolios: [restored] }),
        ),
      });
    await expect(
      selectedPortfolio(page).getByText(restored.name, { exact: true }),
    ).toBeVisible();
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].changes).toHaveLength(2);
    expect(state.requests[0].changes).toEqual(
      expect.arrayContaining([
        { id: "remote-a", portfolio: null, expectedRevision: 3 },
        { id: restored.id, portfolio: restored, expectedRevision: null },
      ]),
    );
    expect(state.accounts[userA].portfolios).toHaveLength(1);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
  },
);
