import type { Page } from "@playwright/test";

export async function openListFilters(
  page: Page,
  kind: "posições" | "transações",
) {
  if ((page.viewportSize()?.width ?? 1440) > 800) return;
  const summary = page.getByLabel(`Filtrar ${kind}`, { exact: true });
  if (
    !(await summary
      .locator("..")
      .evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await summary.click();
}
