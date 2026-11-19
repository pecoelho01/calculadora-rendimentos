import { confirmCsvReview } from "../helpers/csv-helpers";
import { test, expect } from "@playwright/test";

const themeKey = "rendimentos-theme-v1";
const scheme = (page: import("@playwright/test").Page) =>
  page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme);

async function openSettings(
  page: import("@playwright/test").Page,
  continueWithoutSession = true,
) {
  if (continueWithoutSession) {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Continuar sem sessão", exact: true })
      .click();
  }
  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    await page.getByRole("link", { name: "Conta", exact: true }).click();
  } else {
    await page
      .getByRole("link", { name: "Definições da conta", exact: true })
      .click();
  }
}

test("seguir o sistema por omissão e voltar a segui-lo nas definições", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-theme",
    /^(light|dark)$/,
  );
  const initialSystemBackground = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  expect(initialSystemBackground).toBe("rgb(11, 20, 30)");
  await openSettings(page);
  const system = page.getByRole("radio", { name: "Sistema", exact: true });
  await expect(system).toBeChecked();
  await system.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Claro" })).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(system).toBeChecked();
  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
    )
    .toBe("rgb(245, 247, 249)");
  await page.getByRole("radio", { name: "Escuro", exact: true }).check();
  await expect.poll(() => scheme(page)).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => scheme(page)).toBe("dark");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
  await page.getByRole("radio", { name: "Claro", exact: true }).check();
  await expect.poll(() => scheme(page)).toBe("light");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Claro" })).toBeChecked();
  await expect.poll(() => scheme(page)).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => scheme(page)).toBe("light");
  await page.getByRole("radio", { name: "Sistema", exact: true }).check();
  await expect(
    page.evaluate(() => localStorage.getItem("rendimentos-theme-v1")),
  ).resolves.toBeNull();
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
    )
    .toBe("rgb(11, 20, 30)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
    )
    .toBe("rgb(245, 247, 249)");
  expect(errors).toEqual([]);
});

test("ignorar preferência inválida e sincronizar entre separadores", async ({
  page,
  context,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "invalid"),
    themeKey,
  );
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Sistema" })).toBeChecked();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-theme",
    /^(light|dark)$/,
  );
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await openSettings(other, false);
  await other.getByRole("radio", { name: "Escuro", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
  await expect.poll(() => scheme(page)).toBe("dark");
  await other.evaluate(() => localStorage.clear());
  await expect(page.getByRole("radio", { name: "Sistema" })).toBeChecked();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-theme",
    /^(light|dark)$/,
  );
});

test("sincronizar tema com dashboard aberto noutro separador", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
    )
    .toBe("rgb(245, 247, 249)");

  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/");
  await other
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await openSettings(other, false);

  await other.getByRole("radio", { name: "Escuro", exact: true }).check();
  await expect.poll(() => scheme(page)).toBe("dark");
  await openSettings(page, false);
  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();

  await other.getByRole("radio", { name: "Sistema", exact: true }).check();
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
    )
    .toBe("rgb(245, 247, 249)");
  await expect(page.getByRole("radio", { name: "Sistema" })).toBeChecked();
});

test("sincronizar o botão rápido da entrada com o seletor", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ativar tema escuro", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();

  await openSettings(page, false);

  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
});

test("permitir mudar tema quando o armazenamento está bloqueado", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "rendimentos-theme-v1") throw new Error("blocked");
      return original.call(this, key);
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "rendimentos-theme-v1") throw new Error("blocked");
      set.call(this, key, value);
    };
  });
  await openSettings(page);
  await page.getByRole("radio", { name: "Escuro", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
  await expect.poll(() => scheme(page)).toBe("dark");
});

test("manter a preferência entre controlos quando a escrita no armazenamento falha", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "rendimentos-theme-v1") throw new Error("blocked");
      originalSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (key === "rendimentos-theme-v1") throw new Error("blocked");
      originalRemoveItem.call(this, key);
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ativar tema escuro" })
    .first()
    .click();
  await expect(page.locator(".theme-control").first()).toHaveAccessibleName(
    "Ativar tema claro",
  );
  const createAccountButton = page.getByRole("button", {
    name: "Criar conta",
    exact: true,
  });
  if (await createAccountButton.isVisible().catch(() => false)) {
    await createAccountButton.click();
    await expect(page.locator(".theme-control")).toHaveCount(2);
    await expect(page.locator(".theme-control").nth(1)).toHaveAccessibleName(
      "Ativar tema claro",
    );
    await expect(page.locator(".theme-control").first()).toHaveAccessibleName(
      "Ativar tema claro",
    );
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Continuar sem sessão", exact: true })
    .click();
  await openSettings(page, false);
  await expect(page.getByRole("radio", { name: "Escuro" })).toBeChecked();
  await expect.poll(() => scheme(page)).toBe("dark");
});

test("apresentar dados e diálogos em escuro e imprimir em claro", async ({
  page,
}, testInfo) => {
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({ json: { geographies: {} } }),
  );
  await page.route("**/api/market?*", (route) =>
    route.fulfill({
      json: {
        assets: {
          TEST: {
            price: 140,
            previousClose: 130,
            currency: "EUR",
            name: "Teste",
            asOf: null,
            history: [
              { date: "2024-01-05", close: 100 },
              { date: "2024-01-12", close: 140 },
            ],
          },
        },
      },
    }),
  );
  await openSettings(page);
  await page.getByText("Escuro", { exact: true }).click();
  await expect.poll(() => scheme(page)).toBe("dark");
  await page.getByRole("button", { name: "Posições", exact: true }).click();
  await page
    .getByLabel("Importar ficheiro CSV", { exact: true })
    .setInputFiles({
      name: "theme.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy",
      ),
    });
  await confirmCsvReview(page);
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(page.locator(".performance-current")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("tema-escuro.png"),
    fullPage: true,
  });
  await page.locator(".data-actions summary").click();
  await page
    .locator(".data-actions")
    .getByRole("button", { name: "Importar CSV", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("dialogo-escuro.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => scheme(page)).toBe("light");
  await expect(page.locator(".theme-selector")).toBeHidden();
  await expect(page.locator(".theme-control").first()).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("impressao-clara.png"),
    fullPage: true,
  });
});
