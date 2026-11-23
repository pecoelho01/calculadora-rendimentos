import { test, expect } from "@playwright/test";
import {
  openSidebar,
  selectedPortfolio,
} from "../../../helpers/sidebar-helpers";
import {
  mockMarketAndGeography,
  navigateTo,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("recolher navegação mantém atalhos no desktop e devolve foco no telemóvel", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  const mobile = testInfo.project.name === "mobile";
  const sidebar = page.locator("#workspace-sidebar");
  const drawer = page.locator("#workspace-drawer");
  if (mobile) {
    await expect(sidebar).toBeHidden();
    await expect(page.locator(".mobile-workspace-title")).toContainText(
      "A minha carteira",
    );
    await openSidebar(page);
    await expect(drawer).toHaveJSProperty("open", true);
    await page
      .getByRole("button", { name: "Fechar menu", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Abrir menu", exact: true }),
    ).toBeFocused();
    await expect(sidebar).toBeHidden();
    await openSidebar(page);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Abrir menu", exact: true }),
    ).toBeFocused();
    await navigateTo(page, "Posições");
    await expect(
      page.getByRole("heading", { name: "Posições", level: 1, exact: true }),
    ).toBeVisible();
  } else {
    await page
      .getByRole("button", { name: "Fechar sidebar", exact: true })
      .click();
    await expect(sidebar).toBeVisible();
    await expect(page.locator(".main-area")).toHaveCSS("margin-left", "72px");
    const reopen = page.getByRole("button", {
      name: "Abrir sidebar",
      exact: true,
    });
    await expect(reopen).toBeFocused();
    await expect(reopen).toHaveAttribute("aria-expanded", "false");
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: "Transações", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Transações", level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sidebar-portfolios")).toBeHidden();
    await expect(
      page.getByRole("separator", { name: "Largura da sidebar" }),
    ).toBeHidden();
    await reopen.press("Enter");
    await expect(
      page.getByRole("button", { name: "Fechar sidebar", exact: true }),
    ).toBeFocused();
    await expect(page.locator(".main-area")).toHaveCSS("margin-left", "248px");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("navegacao.png"),
    fullPage: true,
  });
  await openSidebar(page);
  await page.emulateMedia({ media: "print" });
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sidebar com dez carteiras mantém navegação, lista e rodapé alcançáveis", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Verificação exclusiva do desktop.",
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "rendimentos.portfolios.v1",
      JSON.stringify({
        version: 1,
        portfolios: Array.from({ length: 10 }, (_, index) => ({
          id: `portfolio-${index}`,
          name: `Carteira ${index + 1} com um nome mais longo`,
          currency: "EUR",
          orders: [],
        })),
      }),
    );
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLocal(page);
  await openSidebar(page);

  const content = page.locator(".sidebar-content");
  const portfolios = page.locator(".sidebar-portfolios");
  const navigation = page.getByRole("navigation", {
    name: "Navegação principal",
  });
  const creditLink = page.locator(
    '.sidebar-bottom a:has-text("Feito por Pedro")',
  );

  for (const height of [800, 600, 480]) {
    await page.setViewportSize({ width: 1280, height });
    expect(
      await content.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await portfolios.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await portfolios.locator(".portfolio-link").last().scrollIntoViewIfNeeded();
    await expect(portfolios.locator(".portfolio-link").last()).toBeInViewport();
    // With the list scrolled, the heading must sit flush with the list's top
    // edge, leaving no strip where scrolled rows could show above it.
    const headingTop = await page
      .locator(".side-heading")
      .evaluate((element) => element.getBoundingClientRect().top);
    const listTop = await portfolios.evaluate(
      (element) => element.getBoundingClientRect().top + element.clientTop,
    );
    expect(Math.abs(headingTop - listTop)).toBeLessThanOrEqual(1);
    await creditLink.scrollIntoViewIfNeeded();
    await expect(creditLink).toBeInViewport();
    await navigation.scrollIntoViewIfNeeded();
    await expect(navigation).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("percorrer muitas carteiras sem sobrepor navegação e rodapé", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "rendimentos.portfolios.v1",
      JSON.stringify({
        version: 1,
        portfolios: Array.from({ length: 30 }, (_, index) => ({
          id: `portfolio-${index}`,
          name: `Carteira ${index + 1} com um nome mais longo`,
          currency: "EUR",
          orders: [],
        })),
      }),
    );
  });
  await page.setViewportSize({
    width: testInfo.project.name === "mobile" ? 390 : 1280,
    height: 600,
  });
  await openLocal(page);
  await openSidebar(page);
  const content = page.locator(".sidebar-content");
  const portfolios = page.locator(".sidebar-portfolios");
  const last = page.locator(".portfolio-link").last();

  if (testInfo.project.name === "mobile") {
    expect(
      await content.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await page.locator(".sidebar-bottom").scrollIntoViewIfNeeded();
    await expect(
      page.locator('.sidebar-bottom a:has-text("Feito por Pedro")'),
    ).toBeInViewport();
  } else {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".sidebar-bottom")).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 1280, height: 600 });
    expect(
      await portfolios.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".sidebar-bottom")).toBeInViewport({ ratio: 1 });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await expect(page.locator(".side-heading")).toHaveCSS("position", "sticky");
    expect(
      await portfolios.evaluate(
        (element) => getComputedStyle(element).paddingTop,
      ),
    ).toBe("0px");
  }

  await last.click();
  await expect(selectedPortfolio(page)).toContainText("Carteira 30");
  await openSidebar(page);
  if (testInfo.project.name === "desktop") {
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.locator(".sidebar-bottom").scrollIntoViewIfNeeded();
    await expect(
      page.locator('.sidebar-bottom a:has-text("Feito por Pedro")'),
    ).toBeInViewport();
    await expect(page.locator(".sidebar-bottom")).toBeInViewport({ ratio: 1 });
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toBeInViewport({ ratio: 1 });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("dimensionar sidebar por arrasto e teclado respeita limites e mantém o conteúdo alinhado", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "A sidebar móvel ocupa a largura disponível.",
  );
  await openLocal(page);
  const handle = page.getByRole("separator", { name: "Largura da sidebar" });
  const sidebar = page.locator("#workspace-sidebar");
  const drag = async (delta: number) => {
    const bounds = (await handle.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 160);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + delta, bounds.y + 160, {
      steps: 8,
    });
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("sidebar-larga.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Fechar sidebar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir sidebar", exact: true })
    .click();
  await expect(sidebar).toHaveCSS("width", "420px");
  await handle.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "224");
  await handle.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "224");
  // The sidebar scrolls internally, so a horizontal overflow there does not
  // widen the document and must be checked on the scroll container itself.
  expect(
    await page
      .locator(".sidebar-content")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toBeHidden();
  await expect(sidebar).toBeHidden();
  await openSidebar(page);
  await expect(sidebar).toHaveCSS("width", "340px");
});
