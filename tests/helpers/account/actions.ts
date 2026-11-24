import { expect, type Page } from "@playwright/test";
import { openSidebar } from "../sidebar-helpers";

export async function openAccountSettings(page: Page) {
  // The loading screen also uses .entry-page; wait before deciding to skip navigation.
  await expect(page.locator('.entry-page[aria-busy="true"]')).toBeHidden();
  if (
    new URL(page.url()).pathname === "/definicoes" ||
    (await page.locator(".entry-page").count())
  )
    return;
  await openSidebar(page);
  await page
    .getByRole("link", { name: "Definições da conta", exact: true })
    .click();
  await expect(page).toHaveURL(/\/definicoes$/);
  await expect(
    page.getByRole("heading", { name: "Definições da conta", exact: true }),
  ).toBeVisible();
}
export async function accountAction(page: Page, name: string) {
  await openAccountSettings(page);
  await page
    .locator(".account-actions")
    .getByRole("button", { name, exact: true })
    .click();
  if (name !== "Sair da conta") {
    await page
      .getByRole("link", { name: "Voltar às carteiras", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/carteira(\/[^/?]+\/(geral|posicoes|transacoes))?$/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
}

export function authSurface(page: Page, title?: string) {
  const surface = page.locator(".entry-auth-card, dialog.auth-dialog");
  return title
    ? surface.filter({
        has: page.getByRole("heading", { name: title, exact: true }),
      })
    : surface;
}
export async function login(
  page: Page,
  email = "ana@example.test",
  waitForCompletion = true,
) {
  if (await page.locator(".app-shell").count()) await openSidebar(page);
  await page
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  const dialog = authSurface(page, "Iniciar sessão");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog
    .getByLabel("Palavra-passe", { exact: true })
    .fill("password-test");
  await dialog
    .getByRole("button", { name: "Iniciar sessão", exact: true })
    .click();
  if (waitForCompletion) {
    await expect(dialog).toBeHidden();
    if (new URL(page.url()).pathname === "/definicoes") {
      await page
        .getByRole("link", { name: "Voltar às carteiras", exact: true })
        .click();
      await expect(page).toHaveURL(
        /\/carteira(\/[^/?]+\/(geral|posicoes|transacoes))?$/,
      );
    }
  }
}
export async function rename(page: Page, oldName: string, nextName: string) {
  await openSidebar(page);
  await page
    .getByRole("button", { name: `Renomear carteira ${oldName}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Renomear carteira",
    exact: true,
  });
  await dialog.getByLabel("Nome da carteira").fill(nextName);
  await dialog
    .getByRole("button", { name: "Guardar nome", exact: true })
    .click();
}
export async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

/**
 * Waits until the entry redirect (`/` → `/carteira` → `/carteira/<id>/geral`)
 * has settled. The sidebar and the recovery dialog already render on `/`, but
 * submitting a new password there calls `history.replaceState`, which makes
 * Next discard the pending redirect and leaves `/` without content (app bug,
 * still to fix). Requires an account with at least one portfolio.
 */
export async function waitForPortfolioOverviewRoute(page: Page) {
  await expect(page).toHaveURL(/\/carteira\/[^/?]+\/geral(?:\?.*)?$/);
}
