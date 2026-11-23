import { test, expect } from "@playwright/test";
import { navigateTo, selectedPortfolio } from "../../helpers/sidebar-helpers";
import {
  storageKey,
  localJson,
  userA,
  setup,
} from "../../helpers/account/mock-backend";
import {
  accountAction,
  rename,
  assertNoOverflow,
} from "../../helpers/account/actions";

// This suite exercises the real browser Auth SDK against deterministic HTTP mocks.
// Build with the public dummy Supabase config documented in README, then set TEST_ACCOUNT_AUTH=1.
test.skip(
  !process.env.TEST_ACCOUNT_AUTH,
  "Requer build com configuração Supabase fictícia para mocks de Auth.",
);

test("gravar espera pela confirmação da conta, incrementa revisão e não grava localmente", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.delayNextWrite = true;
  await rename(page, "Carteira da Ana", "Conta atualizada");
  await expect(page.getByText("A guardar…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Renomear carteira" }),
  ).toBeVisible();
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].changes[0].expectedRevision).toBe(3);
  state.releaseWrite();
  await expect(
    page.getByRole("dialog", { name: "Renomear carteira" }),
  ).toBeHidden();
  await expect(
    selectedPortfolio(page).getByText("Conta atualizada", { exact: true }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios[0].revision).toBe(4);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
  await page.reload();
  await expect(
    selectedPortfolio(page).getByText("Conta atualizada", { exact: true }),
  ).toBeVisible();
  await assertNoOverflow(page);
});

test("conflito entre dispositivos preserva dados e exige recarga explícita", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.accounts[userA].portfolios[0] = {
    portfolio: {
      ...state.accounts[userA].portfolios[0].portfolio,
      name: "Alterada noutro dispositivo",
    },
    revision: 4,
  };
  await rename(page, "Carteira da Ana", "Alteração antiga");
  await expect(
    page.getByText(/Esta carteira foi alterada noutro dispositivo/),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Renomear carteira" }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios[0].portfolio.name).toBe(
    "Alterada noutro dispositivo",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await accountAction(page, "Recarregar dados da conta");
  await expect(
    selectedPortfolio(page).getByText("Alterada noutro dispositivo", {
      exact: true,
    }),
  ).toBeVisible();
  await rename(page, "Alterada noutro dispositivo", "Nova tentativa");
  await expect(
    selectedPortfolio(page).getByText("Nova tentativa", { exact: true }),
  ).toBeVisible();
  expect(state.requests[1].changes[0].expectedRevision).toBe(4);
});

test("falha de gravação mantém diálogo e valores confirmados", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  state.failNextWrite = 503;
  await rename(page, "Carteira da Ana", "Não guardada");
  await expect(
    page.getByText("Erro ao guardar ou carregar", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByLabel("Nome da carteira"),
  ).toHaveValue("Não guardada");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  expect(state.accounts[userA].portfolios[0].revision).toBe(3);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
});

for (const conflict of [false, true]) {
  test(`remover pela tabela de transações da conta aguarda confirmação e preserva conflitos: ${conflict}`, async ({
    page,
  }) => {
    const state = await setup(page, true);
    state.accounts[userA].portfolios[0].portfolio.orders = [
      {
        id: "buy-first",
        date: "2024-01-01",
        ticker: "TEST",
        name: "Teste",
        pricebuy: 100,
        shares: 10,
        type: "buy",
      },
      {
        id: "buy-second",
        date: "2024-01-02",
        ticker: "TEST",
        name: "Teste",
        pricebuy: 120,
        shares: 2,
        type: "buy",
      },
    ];
    await page.goto("/");
    await navigateTo(page, "Transações");
    const rows = page.locator(".transactions-table tbody tr");
    await expect(rows).toHaveCount(2);
    await page.getByRole("button", { name: "Compras 2", exact: true }).click();
    await page.getByRole("textbox", { name: "Pesquisar ativo" }).fill("TEST");
    await page
      .getByLabel("Ver detalhes de TEST de 2024-01-02", { exact: true })
      .click();
    if (conflict) state.accounts[userA].portfolios[0].revision = 4;
    state.delayNextWrite = true;
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Remover TEST de 2024-01-02", exact: true })
      .click();
    await expect.poll(() => state.requests.length).toBe(1);
    await expect(page.getByText("A guardar…", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(2);
    expect(state.requests[0].changes[0].expectedRevision).toBe(3);
    expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(
      2,
    );
    state.releaseWrite();
    if (conflict) {
      await expect(
        page.getByText(/Esta carteira foi alterada noutro dispositivo/),
      ).toBeVisible();
      await expect(rows).toHaveCount(2);
      expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(
        2,
      );
      await accountAction(page, "Recarregar dados da conta");
      await expect(
        page.getByRole("textbox", { name: "Pesquisar ativo" }),
      ).toHaveValue("");
    } else {
      await expect(rows).toHaveCount(1);
      expect(
        state.accounts[userA].portfolios[0].portfolio.orders.map(
          (order) => order.id,
        ),
      ).toEqual(["buy-first"]);
      expect(state.accounts[userA].portfolios[0].revision).toBe(4);
    }
    await expect(rows).toHaveCount(conflict ? 2 : 1);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), storageKey),
    ).toBe(localJson);
    await assertNoOverflow(page);
  });
}

test("revisão CSV da conta aguarda confirmação e conserva edições perante conflito", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/");
  await expect(
    selectedPortfolio(page).getByText("Carteira da Ana", { exact: true }),
  ).toBeVisible();
  const upload = async (date: string) => {
    await page
      .getByLabel("Importar ficheiro CSV", { exact: true })
      .setInputFiles({
        name: "revisao-conta.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          `date,ticker,name,pricebuy,shares,type\n${date},TEST,Teste,100,10,buy`,
        ),
      });
  };
  await upload("2024-01-01");
  const dialog = page.getByRole("dialog", {
    name: "Rever importação CSV",
    exact: true,
  });
  await expect(dialog).toContainText("Carteira da Ana · EUR");
  expect(state.requests).toHaveLength(0);
  expect(state.marketRequests).toBe(0);
  await dialog.getByLabel("Quantidade da linha 2", { exact: true }).fill("11");
  state.delayNextWrite = true;
  await dialog
    .getByRole("button", { name: "Confirmar importação", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(1);
  await expect(
    dialog.getByLabel("Quantidade da linha 2", { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.locator(".auth-inline-back, .dialog-heading button"),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(0);
  state.releaseWrite();
  await expect(dialog).toBeHidden();
  expect(state.accounts[userA].portfolios[0].portfolio.orders[0].shares).toBe(
    11,
  );
  await upload("2024-01-02");
  await dialog
    .getByLabel("Nome da linha 2", { exact: true })
    .fill("Preservar no conflito");
  state.failNextWrite = 409;
  await dialog
    .getByRole("button", { name: "Confirmar importação", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "As edições foram mantidas",
  );
  await expect(
    dialog.getByLabel("Nome da linha 2", { exact: true }),
  ).toHaveValue("Preservar no conflito");
  expect(state.accounts[userA].portfolios[0].portfolio.orders).toHaveLength(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(localJson);
});
