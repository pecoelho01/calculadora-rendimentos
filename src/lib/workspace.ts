import type { Portfolio } from "./types";
import { validatePortfolio } from "./validation";

export const MAX_PORTFOLIOS = 30;
export const MAX_WORKSPACE_BYTES = 3_000_000;
export type WorkspaceSnapshot = {
  version: 1;
  revision: number;
  portfolios: Portfolio[];
};

/** Shared by the future authenticated API and its client; no auth/provider state lives here. */
export function validateSnapshot(raw: unknown): WorkspaceSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("Snapshot inválido.");
  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0
  )
    throw new Error("Versão ou revisão do workspace inválida.");
  if (
    !Array.isArray(value.portfolios) ||
    !value.portfolios.length ||
    value.portfolios.length > MAX_PORTFOLIOS
  )
    throw new Error(
      `O workspace deve conter entre 1 e ${MAX_PORTFOLIOS} carteiras.`,
    );
  if (
    new TextEncoder().encode(JSON.stringify(value.portfolios)).byteLength >
    MAX_WORKSPACE_BYTES
  )
    throw new Error("O conjunto de carteiras excede 3 MB.");
  const portfolios = value.portfolios.map(validatePortfolio);
  if (new Set(portfolios.map((p) => p.id)).size !== portfolios.length)
    throw new Error("Identificadores de carteiras duplicados.");
  return { version: 1, revision: Number(value.revision), portfolios };
}

/** Import as new records. The caller must explicitly confirm and persist against a revision. */
export function appendLocalPortfolios(
  remote: WorkspaceSnapshot,
  local: Portfolio[],
  newId = () => crypto.randomUUID(),
): WorkspaceSnapshot {
  const source = validateSnapshot(remote);
  const imported = local
    .map(validatePortfolio)
    .map((p) => ({
      ...p,
      id: newId(),
      orders: p.orders.map((o) => ({ ...o, id: newId() })),
    }));
  return validateSnapshot({
    ...source,
    portfolios: [...source.portfolios, ...imported],
  });
}
