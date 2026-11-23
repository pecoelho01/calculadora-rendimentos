import { test, expect } from "@playwright/test";
import {
  mockMarketAndGeography,
  navigateTo,
  openPeriodPreferences,
  positionPeriodGroup,
} from "../helpers/dashboard-helpers";

test.beforeEach(async ({ page }) => {
  await mockMarketAndGeography(page);
});

test("guardar e aplicar o período predefinido do gráfico", async ({
  page,
}, testInfo) => {
  await openPeriodPreferences(page, testInfo);
  const preference = page.getByLabel("Período predefinido do gráfico");
  await preference.selectOption("1A");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("rendimentos-chart-period-v1")),
    )
    .toBe("1A");
  if (testInfo.project.name === "mobile") {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }

  await page.goto("/");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "1A", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Os botões do gráfico mudam só a vista atual, não o período predefinido.
  await page.getByRole("button", { name: "1M", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1M", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rendimentos-chart-period-v1"),
    ),
  ).toBe("1A");

  await page.evaluate(() =>
    localStorage.setItem("rendimentos-chart-period-v1", "max"),
  );
  await page.goto("/");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Máximo", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("preferência das posições é independente do gráfico e das escolhas locais", async ({
  page,
}, testInfo) => {
  await openPeriodPreferences(page, testInfo);

  await page.getByLabel("Período predefinido das posições").selectOption("1A");
  await page.getByLabel("Período predefinido do gráfico").selectOption("6M");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("rendimentos-positions-period-v1"),
      ),
    )
    .toBe("1A");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await navigateTo(page, /^Posições/);
  const positionPeriods = positionPeriodGroup(page);
  const preferredPositionPeriod = positionPeriods.getByRole("button", {
    name: "1A",
    exact: true,
  });
  await expect(preferredPositionPeriod).toHaveAttribute("aria-pressed", "true");

  await positionPeriods
    .getByRole("button", { name: "Máximo", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("rendimentos-positions-period-v1"),
      ),
    )
    .toBe("1A");

  await navigateTo(page, /^Visão geral/);
  await expect(
    page.getByRole("button", { name: "6M", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // A tabela compacta da visão geral não tem seletor de período: não pode
  // rotular a rentabilidade desde a aquisição com o período da preferência.
  await expect(page.locator(".list-compact")).not.toContainText("(1A)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
