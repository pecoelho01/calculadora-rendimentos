import { expect, type Page } from "@playwright/test";

export async function openSidebar(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    if (!(await page.locator("#workspace-drawer").evaluate((element) => (element as HTMLDialogElement).open))) {
      await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    }
  } else if (await page.locator(".app-shell").evaluate((element) => element.classList.contains("sidebar-closed"))) {
    await page.getByRole("button", { name: "Abrir sidebar", exact: true }).click();
  }
}

export async function navigateTo(page: Page, name: string | RegExp) {
  await openSidebar(page);
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: typeof name === "string" }).click();
  if ((page.viewportSize()?.width ?? 1440) <= 800) await expect(page.locator("#workspace-drawer")).not.toHaveAttribute("open");
}

export function selectedPortfolio(page: Page) {
  return page.locator((page.viewportSize()?.width ?? 1440) <= 800 ? ".mobile-workspace-title" : ".portfolio-link[aria-current='true']");
}
