import { expect, type Page } from "@playwright/test";

async function waitForMobileDrawerSettled(page: Page) {
  const drawer = page.locator("#workspace-drawer");

  // Após um resize, o drawer pode manter a abertura não modal do desktop até o React reagir ao matchMedia.
  await expect
    .poll(() =>
      drawer.evaluate((element) => {
        const dialog = element as HTMLDialogElement;
        return !dialog.open || dialog.matches(":modal");
      }),
    )
    .toBe(true);
}

export async function openSidebar(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    await waitForMobileDrawerSettled(page);
    if (
      !(await page
        .locator("#workspace-drawer")
        .evaluate((element) => (element as HTMLDialogElement).open))
    ) {
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    }
  } else if (
    await page
      .locator(".app-shell")
      .evaluate((element) => element.classList.contains("sidebar-closed"))
  ) {
    await page
      .getByRole("button", { name: "Abrir sidebar", exact: true })
      .click();
  }
}

export async function navigateTo(page: Page, name: string | RegExp) {
  const routePattern =
    name === "Posições"
      ? /\/carteira\/[^/?]+\/posicoes(?:\?.*)?$/
      : name === "Transações"
        ? /\/carteira\/[^/?]+\/transacoes(?:\?.*)?$/
        : null;

  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    await waitForMobileDrawerSettled(page);
    if (
      await page
        .locator("#workspace-drawer")
        .evaluate((element) => (element as HTMLDialogElement).open)
    ) {
      await page
        .getByRole("button", { name: "Fechar menu", exact: true })
        .click();
    }
    const mobileTarget = page
      .getByRole("navigation", { name: "Navegação móvel" })
      .getByRole("link", { name, exact: typeof name === "string" });
    if (await mobileTarget.count()) {
      await mobileTarget.click();
      if (routePattern) await expect(page).toHaveURL(routePattern);
      await expect(page.locator("#workspace-drawer")).not.toHaveAttribute(
        "open",
      );
      return;
    }
  }
  await openSidebar(page);
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name, exact: typeof name === "string" })
    .click();
  if (routePattern) await expect(page).toHaveURL(routePattern);
  if ((page.viewportSize()?.width ?? 1440) <= 800)
    await expect(page.locator("#workspace-drawer")).not.toHaveAttribute("open");
}

export function selectedPortfolio(page: Page) {
  return page.locator(
    (page.viewportSize()?.width ?? 1440) <= 800
      ? ".portfolio-selection-label"
      : ".portfolio-link[aria-current='true']",
  );
}
