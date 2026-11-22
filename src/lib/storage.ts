import type { Portfolio } from "./types";
import { validatePortfolio } from "./validation";
export const STORAGE_KEY = "rendimentos.portfolios.v1";
export const LAST_PORTFOLIO_KEY = "rendimentos.last-portfolio.v1";
export type LastPortfolioIds = { local?: string; account?: string };

export function readLastPortfolioIds(
  storage?: Storage,
): LastPortfolioIds | null {
  try {
    const target = storage ?? window.localStorage;
    const raw = target.getItem(LAST_PORTFOLIO_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    const isValidId = (id: unknown) =>
      typeof id === "string" && id.trim().length > 0 && id.length <= 200;
    const result: LastPortfolioIds = {};
    if (isValidId(record.local)) result.local = record.local as string;
    if (isValidId(record.account)) result.account = record.account as string;
    return result.local || result.account ? result : null;
  } catch {
    return null;
  }
}

export function writeLastPortfolioId(
  mode: "local" | "account",
  id: string,
  storage?: Storage,
): boolean {
  if (!id.trim() || id.length > 200) return false;
  try {
    const target = storage ?? window.localStorage;
    const current = readLastPortfolioIds(target) ?? {};
    current[mode] = id;
    target.setItem(LAST_PORTFOLIO_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}
export function decodeStorage(text: string): Portfolio[] {
  const raw = JSON.parse(text);
  if (
    raw.version !== 1 ||
    !Array.isArray(raw.portfolios) ||
    raw.portfolios.length > 30
  )
    throw new Error("Formato de armazenamento incompatível.");
  const portfolios = raw.portfolios.map(validatePortfolio);
  if (
    new Set(portfolios.map((p: Portfolio) => p.id)).size !==
      portfolios.length ||
    !portfolios.length
  )
    throw new Error("Carteiras inválidas.");
  return portfolios;
}
export function encodeStorage(portfolios: Portfolio[]): string {
  return JSON.stringify({ version: 1, portfolios });
}
