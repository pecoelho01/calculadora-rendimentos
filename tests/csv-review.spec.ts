import { test, expect, type Page } from "@playwright/test";
import { confirmCsvReview } from "./csv-helpers";

const storageKey = "rendimentos.portfolios.v1";
const header = "date,ticker,name,pricebuy,shares,type\n";
const reviewDialog = (page: Page) => page.getByRole("dialog", { name: "Rever importação CSV", exact: true });
async function choose(page: Page, text: string) {
  await page.getByLabel("Importar ficheiro CSV", { exact: true }).setInputFiles({name: "revisao.csv", mimeType: "text/csv", buffer: Buffer.from(text)});
  await expect(reviewDialog(page)).toBeVisible();
}
async function stored(page: Page) { return page.evaluate((key) => localStorage.getItem(key), storageKey); }
async function orders(page: Page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).portfolios[0].orders, storageKey); }

test.beforeEach(async ({ page }) => {
  await page.route("**/api/market?*", (route) => route.fulfill({ json: { assets: {} } }));
  await page.route("**/api/geography?*", (route) => route.fulfill({ json: { geographies: {} } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar sem sessão", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visão Geral", exact: true })).toBeVisible();
});

test("rever e cancelar não grava nem consulta o mercado", async ({ page }, testInfo) => {
  const before = await stored(page);
  const requests: string[] = [];
  page.on("request", (request) => { if (/\/api\/(market|geography)\?/.test(request.url())) requests.push(request.url()); });
  await choose(page, header + "2024-01-01,TEST,Teste,100,10,buy");
  const dialog = reviewDialog(page);
  await expect(dialog).toContainText("A minha carteira · EUR");
  await expect(dialog.getByRole("textbox", { name: "Ticker da linha 2", exact: true })).toHaveValue("TEST");
  expect(await stored(page)).toBe(before);
  expect(requests).toEqual([]);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: testInfo.outputPath("revisao-csv.png"), fullPage: true});
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await stored(page)).toBe(before);
});

test("corrigir todos os campos e validar vendas antes de importar atomicamente", async ({ page }) => {
  const before = await stored(page);
  await choose(page, header + "2024-01-01,TEST,Original,100,10,buy\n2024-01-02,TEST,Original,0,99,unknown");
  const dialog = reviewDialog(page);
  const confirm = dialog.getByRole("button", { name: "Confirmar importação", exact: true });
  await expect(confirm).toBeDisabled();
  expect(await stored(page)).toBe(before);
  await dialog.getByLabel("Ticker da linha 2", {exact:true}).fill("aaa");
  await dialog.getByLabel("Nome da linha 2", {exact:true}).fill("Nome editado");
  await dialog.getByLabel("Preço (EUR) da linha 2", {exact:true}).fill("100,25");
  await dialog.getByLabel("Quantidade da linha 2", {exact:true}).fill("8");
  await dialog.getByLabel("Data da linha 3", {exact:true}).fill("2024-01-01");
  await dialog.getByLabel("Ticker da linha 3", {exact:true}).fill("AAA");
  await dialog.getByLabel("Operação da linha 3", {exact:true}).selectOption("sell");
  await dialog.getByLabel("Preço (EUR) da linha 3", {exact:true}).fill("120");
  await expect(dialog.getByRole("alert")).toContainText("venda superior");
  await expect(confirm).toBeDisabled();
  expect(await stored(page)).toBe(before);
  await dialog.getByLabel("Quantidade da linha 3", {exact:true}).fill("2");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
  const result = await orders(page);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({date:"2024-01-01",ticker:"AAA",name:"Nome editado",pricebuy:100.25,shares:8,type:"buy"});
  expect(result[1]).toMatchObject({date:"2024-01-01",ticker:"AAA",pricebuy:120,shares:2,type:"sell"});
});

test("duplicados existentes e internos exigem decisão e atualizam ao editar ou excluir", async ({ page }) => {
  await choose(page, header + "2024-01-01,TEST,Teste,100,10,buy");
  await confirmCsvReview(page);
  await expect(reviewDialog(page)).toBeHidden();
  const before = await stored(page);
  await choose(page, header + "2024-01-01,TEST,Outro nome,100,10,buy\n2024-01-02,TEST,Teste,100,5,buy\n2024-01-02,TEST,Teste,100,5,buy");
  const dialog = reviewDialog(page);
  const confirm = dialog.getByRole("button", {name:"Confirmar importação",exact:true});
  await expect(dialog).toContainText("3 possíveis duplicados");
  await expect(dialog).toContainText("Já existe na carteira.");
  await expect(confirm).toBeDisabled();
  expect(await stored(page)).toBe(before);
  await dialog.getByLabel("Incluir linha 2", {exact:true}).uncheck();
  await expect(dialog).toContainText("2 possíveis duplicados");
  await dialog.getByLabel("Quantidade da linha 4", {exact:true}).fill("6");
  await expect(dialog.getByRole("checkbox", {name:/Confirmo que/})).toHaveCount(0);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
  expect(await orders(page)).toHaveLength(3);
  await choose(page, header + "2024-01-01,TEST,Teste,100,10,buy");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("checkbox", {name:/Confirmo que/}).check();
  await confirm.click();
  await expect(dialog).toBeHidden();
  expect(await orders(page)).toHaveLength(4);
});

test("paginar conserva edições e exclusões e encontra erros fora da primeira página", async ({ page }) => {
  const lines = Array.from({length:26}, (_,i) => `2024-01-01,TEST,Ativo ${i},${i + 1},1,buy`);
  lines[25] = "2024-01-01,TEST,Corrigir,0,1,buy";
  await choose(page, header + lines.join("\n"));
  const dialog = reviewDialog(page);
  await expect(dialog.locator("tbody tr")).toHaveCount(25);
  await dialog.getByLabel("Nome da linha 2", {exact:true}).fill("Edição preservada");
  await dialog.getByLabel("Incluir linha 3", {exact:true}).uncheck();
  await dialog.getByRole("button", {name:"Ver primeiro erro",exact:true}).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await dialog.getByLabel("Preço (EUR) da linha 27", {exact:true}).fill("26");
  await dialog.getByRole("button", {name:"Anterior",exact:true}).click();
  await expect(dialog.getByLabel("Nome da linha 2", {exact:true})).toHaveValue("Edição preservada");
  await expect(dialog.getByLabel("Incluir linha 3", {exact:true})).not.toBeChecked();
  await confirmCsvReview(page);
  await expect(dialog).toBeHidden();
  expect(await orders(page)).toHaveLength(25);
});

test("falha de gravação conserva o editor e as edições", async ({ page }) => {
  const before = await stored(page);
  await choose(page, header + "2024-01-01,TEST,Teste,100,10,buy");
  const dialog = reviewDialog(page);
  await dialog.getByLabel("Nome da linha 2", {exact:true}).fill("Preservar edição");
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if(name === key) throw new Error("blocked"); original.call(this,name,value); };
  }, storageKey);
  await dialog.getByRole("button",{name:"Confirmar importação",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("As edições foram mantidas");
  await expect(dialog.getByLabel("Nome da linha 2", {exact:true})).toHaveValue("Preservar edição");
  expect(await stored(page)).toBe(before);
});

test("destino fica fixo mesmo que a seleção mude durante a leitura do ficheiro", async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({version:1,portfolios:[
    {id:"destino",name:"Destino original",currency:"EUR",orders:[]},
    {id:"outra",name:"Outra carteira",currency:"USD",orders:[]},
  ]})), storageKey);
  await page.reload();
  await expect(page.locator(".portfolio-context")).toContainText("Destino original");
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function() {
      await new Promise<void>((resolve) => { (window as Window & {continueCsvRead?:()=>void}).continueCsvRead = resolve; });
      return original.call(this);
    };
  });
  await page.getByLabel("Importar ficheiro CSV", {exact:true}).setInputFiles({name:"destino.csv",mimeType:"text/csv",buffer:Buffer.from(header+"2024-01-01,TEST,Teste,100,1,buy")});
  if ((page.viewportSize()?.width ?? 1440) <= 800) await page.getByRole("button",{name:"Abrir menu",exact:true}).click();
  await page.locator(".portfolio-link").filter({hasText:"Outra carteira"}).click();
  await expect(page.locator(".portfolio-context")).toContainText("Outra carteira");
  await page.evaluate(() => (window as Window & {continueCsvRead?:()=>void}).continueCsvRead?.());
  await expect(reviewDialog(page)).toContainText("Destino original · EUR");
  await confirmCsvReview(page);
  await expect(reviewDialog(page)).toBeHidden();
  const portfolios = JSON.parse((await stored(page))!).portfolios;
  expect(portfolios[0].orders).toHaveLength(1);
  expect(portfolios[1].orders).toHaveLength(0);
});

test("revisão mantém tabela utilizável nos dois temas e fica fora da impressão", async ({ page }, testInfo) => {
  await choose(page, header + "2024-01-01,TEST,Repetida,100,10,buy\n2024-01-01,TEST,Repetida,100,10,buy\n2024-01-02,TEST,Corrigir,0,1,buy");
  const dialog = reviewDialog(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await dialog.getByLabel("Preço (EUR) da linha 2", {exact:true}).focus();
      await expect(dialog.getByLabel("Preço (EUR) da linha 2", {exact:true})).toBeFocused();
    }
    await page.screenshot({path:testInfo.outputPath(`revisao-${colorScheme}.png`),fullPage:true});
  }
  await page.emulateMedia({media:"print"});
  await expect(dialog).toBeHidden();
  await expect(page.locator(".metrics")).toBeVisible();
  await page.emulateMedia({media:"screen"});
  await expect(dialog).toBeVisible();
});
