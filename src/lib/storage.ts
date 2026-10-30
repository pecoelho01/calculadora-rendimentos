import type { Portfolio } from "./types";
import { validatePortfolio } from "./validation";
export const STORAGE_KEY = "rendimentos.portfolios.v1";
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
