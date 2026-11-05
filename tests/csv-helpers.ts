import { expect, type Page } from "@playwright/test";

/** Existing workflow fixtures explicitly confirm the new review step. */
export async function confirmCsvReview(page: Page) {
  const review = page.getByRole("dialog", { name: "Rever importação CSV", exact: true });
  await expect(review).toBeVisible();
  const duplicates = review.getByRole("checkbox", { name: "Confirmo que pretendo importar os possíveis duplicados selecionados." });
  if (await duplicates.count()) await duplicates.check();
  await review.getByRole("button", { name: "Confirmar importação", exact: true }).click();
}
