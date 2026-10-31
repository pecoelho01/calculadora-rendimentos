import { test, expect } from "@playwright/test";

const themeKey = "rendimentos-theme-v1";
const scheme = (page: import("@playwright/test").Page) =>
  page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme);

test("seguir o sistema e manter a escolha explícita após recarregar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const theme = page.getByRole("button", { name: /^Ativar tema/ });
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /^(light|dark)$/);
  const darkBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor)).not.toBe(darkBackground);
  await expect(theme).toHaveAccessibleName("Ativar tema escuro");
  await theme.click();
  await expect.poll(() => scheme(page)).toBe("dark");
  await page.reload();
  await expect(theme).toHaveAccessibleName("Ativar tema claro");
  await expect.poll(() => scheme(page)).toBe("dark");
  await page.getByRole("button", { name: "Ativar tema claro", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => scheme(page)).toBe("light");
  await page.reload();
  await expect(theme).toHaveAccessibleName("Ativar tema escuro");
  await theme.focus();
  await page.keyboard.press("Enter");
  await expect(theme).toHaveAccessibleName("Ativar tema claro");
  await expect.poll(() => scheme(page)).toBe("dark");
  await expect(theme.locator(".theme-sun")).toBeVisible();
  await expect(theme.locator(".theme-moon")).toBeHidden();
  await page.getByRole("button", { name: "Fechar sidebar", exact: true }).click();
  await expect(theme).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("ignorar preferência inválida e sincronizar entre separadores", async ({ page, context }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "invalid"), themeKey);
  await page.goto("/");
  const theme = page.getByRole("button", { name: /^Ativar tema/ });
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /^(light|dark)$/);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Ativar tema escuro", exact: true }).click();
  await expect(theme).toHaveAccessibleName("Ativar tema claro");
  await expect.poll(() => scheme(page)).toBe("dark");
  await other.evaluate(() => localStorage.clear());
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /^(light|dark)$/);
});

test("permitir mudar tema quando o armazenamento está bloqueado", async ({ page }) => {
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
  await page.goto("/");
  const theme = page.getByRole("button", { name: /^Ativar tema/ });
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /^(light|dark)$/);
  await expect(theme).toHaveAccessibleName("Ativar tema escuro");
  await theme.click();
  await expect.poll(() => scheme(page)).toBe("dark");
});

test("apresentar dados e diálogos em escuro e imprimir em claro", async ({ page }, testInfo) => {
  await page.route("**/api/market?*", (route) => route.fulfill({ json: { assets: {
    TEST: { price: 140, previousClose: 130, currency: "EUR", name: "Teste", asOf: null,
      history: [{ date: "2024-01-05", close: 100 }, { date: "2024-01-12", close: 140 }] },
    "^GSPC": { price: 4400, previousClose: 4300, currency: "USD", name: "S&P 500", asOf: null,
      history: [{ date: "2024-01-05", close: 4000 }, { date: "2024-01-12", close: 4400 }] },
  } } }));
  await page.goto("/");
  const theme = page.getByRole("button", { name: /^Ativar tema/ });
  await expect(theme).toHaveAccessibleName("Ativar tema escuro");
  await theme.click();
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({
    name: "theme.csv", mimeType: "text/csv",
    buffer: Buffer.from("date,ticker,name,pricebuy,shares,type\n2024-01-01,TEST,Teste,100,10,buy"),
  });
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  await expect(page.locator(".performance svg").last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tema-escuro.png"), fullPage: true });
  await page.locator(".data-actions summary").click();
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("dialogo-escuro.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => scheme(page)).toBe("light");
  await expect(theme).toBeHidden();
  await expect(page.locator(".metric").first()).toContainText("1400,00");
  await page.screenshot({ path: testInfo.outputPath("impressao-clara.png"), fullPage: true });
});
