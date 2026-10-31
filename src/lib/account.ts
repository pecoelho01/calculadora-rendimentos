import type { Portfolio } from "./types";
import { validatePortfolio } from "./validation";
import { MAX_PORTFOLIOS, MAX_WORKSPACE_BYTES } from "./workspace";

export type AccountSnapshot = {
  version: 1;
  portfolios: { portfolio: Portfolio; revision: number }[];
};
export type AccountChange = {
  id: string;
  portfolio: Portfolio | null;
  expectedRevision: number | null;
};
export type AccountWrite = {
  changes: AccountChange[];
  migration?: { key: string; portfolios: Portfolio[] };
};
function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Dados da conta inválidos.");
  return raw as Record<string, unknown>;
}
function identifier(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 200)
    throw new Error("Identificador inválido.");
  return raw;
}
function revision(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || Number(raw) < 1)
    throw new Error("Revisão da carteira inválida.");
  return Number(raw);
}
function checkSize(raw: unknown) {
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_WORKSPACE_BYTES)
    throw new Error("O conjunto de carteiras excede 3 MB.");
}
function portfolio(raw: unknown): Portfolio {
  const input = object(raw);
  identifier(input.id);
  if (!Array.isArray(input.orders)) throw new Error("Transações inválidas.");
  // Account payloads are complete records: never invent missing transaction IDs.
  for (const item of input.orders) identifier(object(item).id);
  return validatePortfolio(input);
}
function list(raw: unknown): Portfolio[] {
  if (!Array.isArray(raw) || raw.length > MAX_PORTFOLIOS)
    throw new Error("Máximo de 30 carteiras.");
  checkSize(raw);
  const result = raw.map(portfolio);
  if (new Set(result.map((p) => p.id)).size !== result.length)
    throw new Error("Identificadores de carteiras duplicados.");
  return result;
}
export function validateAccountSnapshot(raw: unknown): AccountSnapshot {
  const value = object(raw);
  if (value.version !== 1 || !Array.isArray(value.portfolios))
    throw new Error("Versão da conta inválida.");
  const records = value.portfolios.map((record) => {
    const item = object(record);
    return { portfolio: portfolio(item.portfolio), revision: revision(item.revision) };
  });
  list(records.map((item) => item.portfolio));
  return { version: 1, portfolios: records };
}
export function validateAccountWrite(raw: unknown): AccountWrite {
  const value = object(raw);
  if (Object.keys(value).some((key) => !["changes", "migration"].includes(key)))
    throw new Error("Campos da conta inválidos.");
  if (!Array.isArray(value.changes) || value.changes.length > MAX_PORTFOLIOS * 2)
    throw new Error("Alterações inválidas.");
  checkSize(raw);
  const changes = value.changes.map((rawChange): AccountChange => {
    const change = object(rawChange);
    if (Object.keys(change).some((key) => !["id", "portfolio", "expectedRevision"].includes(key)))
      throw new Error("Campos da alteração inválidos.");
    const id = identifier(change.id);
    const next = change.portfolio === null ? null : portfolio(change.portfolio);
    const expectedRevision = change.expectedRevision === null ? null : revision(change.expectedRevision);
    if (next?.id !== id && next !== null) throw new Error("Identificador incompatível.");
    if (next === null && expectedRevision === null) throw new Error("Remoção sem revisão.");
    return { id, portfolio: next, expectedRevision };
  });
  if (new Set(changes.map((c) => c.id)).size !== changes.length)
    throw new Error("Alterações duplicadas.");
  if (value.migration !== undefined) {
    const migration = object(value.migration);
    if (changes.length || typeof migration.key !== "string" || !/^[a-f0-9]{64}$/.test(migration.key))
      throw new Error("Migração inválida.");
    const portfolios = list(migration.portfolios);
    if (!portfolios.length) throw new Error("Não existem carteiras para importar.");
    return { changes, migration: { key: migration.key, portfolios } };
  }
  return { changes };
}
export function buildAccountChanges(snapshot: AccountSnapshot, next: Portfolio[]): AccountChange[] {
  const previous = validateAccountSnapshot(snapshot);
  const validated = list(next);
  const old = new Map(previous.portfolios.map((record) => [record.portfolio.id, record]));
  const changes: AccountChange[] = [];
  for (const item of validated) {
    const prior = old.get(item.id);
    if (!prior || JSON.stringify(prior.portfolio) !== JSON.stringify(item))
      changes.push({ id: item.id, portfolio: item, expectedRevision: prior?.revision ?? null });
    old.delete(item.id);
  }
  for (const [id, prior] of old)
    changes.push({ id, portfolio: null, expectedRevision: prior.revision });
  return changes;
}
