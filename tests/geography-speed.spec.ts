import { test, expect } from "@playwright/test";
const asset = (price: number) => ({
  price,
  previousClose: price,
  currency: "EUR",
  name: "Teste",
  asOf: null,
  history: [],
});
const composition = (country: string) => ({
  allocations: [{ country, weight: 1 }],
  asOf: "2026-10-30",
  source: "https://www.justetf.com/en/etf-profile.html?isin=IE00B4L5Y983",
});
const order = (id: string, ticker: string, type = "buy") => ({
  id,
  ticker,
  type,
  name: ticker,
  date: "2024-01-01",
  shares: 10,
  pricebuy: 100,
});
const portfolios = [
  {
    id: "one",
    name: "Primeira",
    currency: "EUR",
    orders: [
      order("t1", "TEST"),
      order("c1", "CLOSED"),
      order("c2", "CLOSED", "sell"),
    ],
  },
  {
    id: "two",
    name: "Segunda",
    currency: "EUR",
    orders: [order("t2", "TEST")],
  },
  {
    id: "other",
    name: "Outra",
    currency: "EUR",
    orders: [order("t3", "OTHER")],
  },
];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (data) =>
      localStorage.setItem(
        "rendimentos.portfolios.v1",
        JSON.stringify({ version: 1, portfolios: data }),
      ),
    portfolios,
  );
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: { assets: { TEST: asset(140), OTHER: asset(200) } },
    }),
  );
});
test("mostrar preços antes da geografia e reutilizar pedidos pendentes e resultados", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: URL[] = [];
  await page.route("**/api/geography?*", async (route) => {
    requests.push(new URL(route.request().url()));
    await gate;
    await route.fulfill({ json: { geographies: { TEST: composition("US") } } });
  });
  await page.goto("/");
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart).toContainText("A obter a distribuição por continente");
  await expect(chart.getByRole("img")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect([...requests[0].searchParams.keys()]).toEqual(["tickers"]);
  expect(requests[0].searchParams.get("tickers")).toBe("TEST");
  await page.getByRole("button", { name: "Atualizar preços" }).click();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: /^Posições/ }).click();
  await nav.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(chart).toContainText("A obter a distribuição por continente");
  expect(requests).toHaveLength(1);
  release();
  await expect(chart.locator(".allocation-list")).toContainText(
    "América do Norte",
  );
  await page.locator(".portfolio-link").filter({ hasText: "Segunda" }).click();
  await expect(page.locator(".portfolio-link.selected")).toContainText(
    "Segunda",
  );
  await expect(chart.locator(".donut")).toContainText("100%");
  await page.getByRole("button", { name: "Atualizar preços" }).click();
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  expect(requests).toHaveLength(1);
});
test("resposta antiga não altera a geografia da carteira selecionada", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/geography?*", async (route) => {
    const tickers = new URL(route.request().url()).searchParams.get("tickers");
    if (tickers === "TEST") await gate;
    await route.fulfill({
      json: {
        geographies:
          tickers === "TEST"
            ? { TEST: composition("US") }
            : { OTHER: composition("JP") },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart).toContainText("A obter a distribuição por continente");
  await page.locator(".portfolio-link").filter({ hasText: "Outra" }).click();
  await expect(chart.locator(".allocation-list")).toContainText("Ásia");
  release();
  await expect(chart.locator(".allocation-list")).not.toContainText(
    "América do Norte",
  );
  await page.locator(".portfolio-link").filter({ hasText: "Primeira" }).click();
  await expect(chart.locator(".allocation-list")).toContainText(
    "América do Norte",
  );
});
test("falha geográfica não bloqueia preços nem é repetida ao atualizar", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/geography?*", (route) => {
    requests++;
    return route.fulfill({ status: 503, json: { error: "indisponível" } });
  });
  await page.goto("/");
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  await page.getByRole("button", { name: "Geografia", exact: true }).click();
  const chart = page.getByRole("region", {
    name: "Distribuição por continente",
    exact: true,
  });
  await expect(chart.locator(".allocation-list")).toContainText(
    "Sem classificação",
  );
  await page.getByRole("button", { name: "Atualizar preços" }).click();
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  expect(requests).toBe(1);
});
test("validar pedidos geográficos antes de consultar fontes", async ({
  request,
}) => {
  for (const query of [
    "",
    "tickers=bad%2Fsymbol",
    `tickers=${Array.from({ length: 21 }, (_, i) => `T${i}`).join(",")}`,
  ]) {
    const response = await request.get(`/api/geography?${query}`);
    expect(response.status()).toBe(400);
  }
});
