import { test, expect } from "@playwright/test";
import { openSidebar } from "../../../helpers/sidebar-helpers";
import {
  mockMarketAndGeography,
  navigateTo,
  openLocal,
} from "../../../helpers/dashboard/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("barra inferior permite navegar e mantém o conteúdo acessível no telemóvel", async ({
  page,
}, testInfo) => {
  await openLocal(page);
  const navigation = page.locator(".mobile-navigation");
  if (testInfo.project.name === "desktop") {
    await expect(navigation).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toBeVisible();
    return;
  }
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("link", {
      name: /^(Posições|Transações|Visão geral)$/,
    }),
  ).toHaveCount(3);
  for (const [name, heading] of [
    ["Posições", "Posições"],
    ["Transações", "Transações"],
    ["Visão geral", "Visão Geral"],
  ]) {
    const target = navigation.getByRole("link", { name, exact: true });
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(target).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: heading, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.locator("#workspace-drawer")).not.toHaveAttribute("open");
  }
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const lastAction = page.locator(".data-actions summary");
  await lastAction.scrollIntoViewIfNeeded();
  await expect(lastAction).toBeInViewport();
  expect(
    (await lastAction.boundingBox())!.y +
      (await lastAction.boundingBox())!.height,
  ).toBeLessThanOrEqual((await navigation.boundingBox())!.y);
  await navigation.getByRole("link", { name: "Posições", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await navigateTo(page, "Notas explicativas");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(0);
  await navigation
    .getByRole("link", { name: "Transações", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transações", level: 1, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("barra-inferior.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(navigation).toBeHidden();
  await expect(page.locator(".main-area")).toHaveCSS("padding-bottom", "0px");
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(navigation).toBeHidden();
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: "Transações", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("gaveta móvel contém o foco, fecha pelo fundo e adapta-se ao desktop", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Fluxo da gaveta móvel.");
  await openLocal(page);
  await openSidebar(page);
  const drawer = page.getByRole("dialog", { name: "Navegação e carteiras" });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Tab");
    // Native modal navigation can visit browser chrome between the last and first control.
    expect(
      await page
        .locator("#workspace-drawer")
        .evaluate(
          (element) =>
            document.activeElement === document.body ||
            element.contains(document.activeElement),
        ),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("gaveta-mobile.png"),
    fullPage: true,
  });
  await page.mouse.click(380, 400);
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeFocused();
  await openSidebar(page);
  await page
    .getByRole("button", { name: "Criar carteira", exact: true })
    .click();
  await expect(page.locator("dialog:modal")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeFocused();
  await openSidebar(page);
  await page
    .getByRole("button", {
      name: "Renomear carteira A minha carteira",
      exact: true,
    })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeFocused();
  await openSidebar(page);
  await page
    .getByRole("button", {
      name: "Renomear carteira A minha carteira",
      exact: true,
    })
    .click();
  await page.getByLabel("Nome da carteira").fill("Carteira renomeada");
  await page.getByRole("button", { name: "Guardar nome", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".mobile-workspace-title")).toContainText(
    "Carteira renomeada",
  );
  await openSidebar(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#workspace-sidebar")).toBeVisible();
  await expect(page.locator("#workspace-drawer")).toHaveJSProperty(
    "open",
    true,
  );
  await expect
    .poll(() =>
      page
        .locator("#workspace-drawer")
        .evaluate((element) => element.matches(":modal")),
    )
    .toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#workspace-sidebar")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
