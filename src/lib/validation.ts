import type { Order, Portfolio } from "./types";
export const MAX_ORDERS = 5000;
export const MAX_TICKERS = 20;
export const tickerPattern = /^[A-Z0-9^][A-Z0-9.^=\-]{0,24}$/;
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(new Date(value + "T00:00:00Z").getTime()) &&
    value >= "2000-01-01" &&
    value <= new Date().toISOString().slice(0, 10) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function numberValue(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || value > 1e12)
      throw new Error("Número inválido.");
    return value;
  }
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(raw))
    throw new Error(
      "Introduz um número positivo, com ponto ou vírgula decimal.",
    );
  const result = Number(raw);
  if (!Number.isFinite(result) || result <= 0 || result > 1e12)
    throw new Error("O número deve ser positivo e inferior ou igual a 10¹².");
  return result;
}
export function validateOrder(raw: Record<string, unknown>): Order {
  const date = String(raw.date ?? "").trim();
  const ticker = String(raw.ticker ?? "")
    .trim()
    .toUpperCase();
  const type = String(raw.type ?? "buy")
    .trim()
    .toLowerCase();
  if (!validDate(date))
    throw new Error("Data inválida: usa YYYY-MM-DD, entre 2000-01-01 e hoje.");
  if (!tickerPattern.test(ticker))
    throw new Error("Ticker inválido. Exemplo: AAPL ou SXR8.DE.");
  if (type !== "buy" && type !== "sell")
    throw new Error("O tipo deve ser buy ou sell.");
  const shares = numberValue(raw.shares);
  if (shares < 1e-8 || Number(shares.toFixed(8)) !== shares)
    throw new Error(
      "A quantidade aceita até 8 casas decimais (mínimo 0,00000001).",
    );
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    date,
    ticker,
    type,
    name: String(raw.name ?? "")
      .trim()
      .slice(0, 100),
    pricebuy: numberValue(raw.pricebuy),
    shares,
  };
}
export function chronological(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => a.date.localeCompare(b.date));
}
export function validateOrders(orders: Order[]): void {
  if (orders.length > MAX_ORDERS)
    throw new Error(`Máximo de ${MAX_ORDERS} transações por carteira.`);
  if (new Set(orders.map((o) => o.ticker)).size > MAX_TICKERS)
    throw new Error(`Máximo de ${MAX_TICKERS} ativos por carteira.`);
  const positions = new Map<string, bigint>();
  for (const order of chronological(orders)) {
    const shares = positions.get(order.ticker) ?? 0n;
    const units = shareUnits(order.shares);
    if (order.type === "sell" && units > shares)
      throw new Error(
        `${order.ticker}, ${order.date}: venda superior à posição disponível (${Number(shares) / 1e8}).`,
      );
    positions.set(
      order.ticker,
      order.type === "buy" ? shares + units : shares - units,
    );
  }
}
export function validatePortfolio(raw: unknown): Portfolio {
  if (!raw || typeof raw !== "object") throw new Error("Carteira inválida.");
  const p = raw as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 60 ||
    !["EUR", "USD", "GBP"].includes(String(p.currency)) ||
    !Array.isArray(p.orders)
  )
    throw new Error("Carteira inválida.");
  const orders = p.orders.map((o) =>
    validateOrder(o as Record<string, unknown>),
  );
  if (new Set(orders.map((o) => o.id)).size !== orders.length)
    throw new Error("Transações duplicadas.");
  validateOrders(orders);
  return {
    id: p.id,
    name: p.name,
    currency: p.currency as Portfolio["currency"],
    orders,
  };
}

export function shareUnits(shares: number): bigint {
  if (
    !Number.isFinite(shares) ||
    shares < 1e-8 ||
    shares > 1e12 ||
    Number(shares.toFixed(8)) !== shares
  )
    throw new Error("Quantidade inválida: até 8 casas decimais.");
  return BigInt(shares.toFixed(8).replace(".", ""));
}
