import type { Order } from "./types";
import { MAX_ORDERS, validateOrder } from "./validation";
export type CsvDraftOrder = {
  id: string;
  date: string;
  ticker: string;
  name: string;
  pricebuy: string;
  shares: string;
  type: string;
};
function rows(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const delimiter = text
    .split(/\r?\n/)
    .find((line) => line.includes("pricebuy"))
    ?.includes(";")
    ? ";"
    : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw new Error("Aspas inválidas no CSV.");
    } else if (c === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) result.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Aspas por fechar no CSV.");
  row.push(cell.trim());
  if (row.some(Boolean)) result.push(row);
  return result;
}
export function parseCsvDraft(text: string): CsvDraftOrder[] {
  if (text.length > 2_000_000) throw new Error("O CSV excede 2 MB.");
  const data = rows(text.replace(/^\uFEFF/, ""));
  const header = data.shift()?.map((s) => s.toLowerCase());
  if (
    !header ||
    !["date", "ticker", "pricebuy", "shares"].every((k) => header.includes(k))
  )
    throw new Error("Colunas necessárias: date, ticker, pricebuy, shares.");
  if (new Set(header.filter(Boolean)).size !== header.filter(Boolean).length)
    throw new Error("Cabeçalhos duplicados.");
  if (data.length > MAX_ORDERS)
    throw new Error(`Máximo de ${MAX_ORDERS} transações por ficheiro.`);
  const orders = data.map((row, i) => {
    try {
      if (row.length > header.length)
        throw new Error(
          "Número de colunas inválido; coloca decimais com vírgula entre aspas.",
        );
      const raw = Object.fromEntries(
        header.map((h, j) => [h, row[j] ?? ""]).filter(([h]) => h),
      );
      return {
        id: crypto.randomUUID(),
        date: raw.date ?? "",
        ticker: raw.ticker ?? "",
        name: raw.name ?? "",
        pricebuy: raw.pricebuy ?? "",
        shares: raw.shares ?? "",
        type: raw.type || "buy",
      };
    } catch (e) {
      throw new Error(`Linha ${i + 2}: ${(e as Error).message}`);
    }
  });
  if (!orders.length) throw new Error("O CSV não contém transações.");
  return orders;
}
export function parseCsv(text: string): Order[] {
  return parseCsvDraft(text).map((raw, i) => {
    try {
      return validateOrder(raw);
    } catch (error) {
      throw new Error(`Linha ${i + 2}: ${(error as Error).message}`);
    }
  });
}

// Names and generated IDs do not distinguish otherwise identical transactions.
export function csvDuplicateKey(order: Order): string {
  return JSON.stringify([order.date, order.ticker, order.type, order.pricebuy, order.shares]);
}
export function exportCsv(orders: Order[]): string {
  const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  return (
    "date,ticker,name,pricebuy,shares,type\r\n" +
    orders
      .map((o) =>
        [o.date, o.ticker, o.name, o.pricebuy, o.shares, o.type]
          .map(escape)
          .join(","),
      )
      .join("\r\n")
  );
}
