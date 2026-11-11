import { csvDuplicateKey, type CsvDraftOrder } from "./csv";
import type { Order } from "./types";
import { validateOrder, validateOrders } from "./validation";

export type CsvReviewRow = CsvDraftOrder & { include: boolean };

// Review never persists: the caller confirms the selected, validated batch atomically.
export function reviewCsvOrders(rows: CsvReviewRow[], existingOrders: Order[]) {
  const errors = new Map<string, string>();
  const orders: Order[] = [];
  for (const row of rows) {
    if (!row.include) continue;
    try {
      orders.push(validateOrder(row));
    } catch (error) {
      errors.set(row.id, (error as Error).message);
    }
  }

  const existingKeys = new Set(existingOrders.map(csvDuplicateKey));
  const selectedKeyCounts = new Map<string, number>();
  for (const order of orders) {
    const key = csvDuplicateKey(order);
    selectedKeyCounts.set(key, (selectedKeyCounts.get(key) ?? 0) + 1);
  }

  const duplicates = new Map<string, string>();
  for (const order of orders) {
    const key = csvDuplicateKey(order);
    const inPortfolio = existingKeys.has(key);
    const inFile = selectedKeyCounts.get(key)! > 1;
    if (!inPortfolio && !inFile) continue;

    let message = "Repete-se no ficheiro.";
    if (inPortfolio && inFile) {
      message = "Já existe na carteira e repete-se no ficheiro.";
    } else if (inPortfolio) {
      message = "Já existe na carteira.";
    }
    duplicates.set(order.id, message);
  }

  let error = "";
  if (!orders.length && !errors.size) {
    error = "Seleciona pelo menos uma transação para importar.";
  } else if (errors.size) {
    const invalidRowsLabel =
      errors.size === 1 ? "transação inválida" : "transações inválidas";
    error = `Corrige os campos de ${errors.size} ${invalidRowsLabel} ou desmarca essas linhas.`;
  } else {
    try {
      validateOrders([...existingOrders, ...orders]);
    } catch (cause) {
      error = (cause as Error).message;
    }
  }

  return { orders, errors, duplicates, error };
}
