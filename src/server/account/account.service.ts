import { createHash } from "node:crypto";
import {
  validateAccountSnapshot,
  validateAccountWrite,
  type AccountSnapshot,
  type AccountWrite,
} from "../../lib/account/account";
import { encodeStorage } from "../../lib/storage";
import { AccountError } from "./account.errors";
import type { AccountRepository } from "./account.repository";

export type AccountService = {
  snapshot(): Promise<AccountSnapshot>;
  apply(input: unknown): Promise<AccountSnapshot>;
};

function validateWrite(input: unknown): AccountWrite {
  try {
    const write = validateAccountWrite(input);

    if (write.migration) {
      const encodedPortfolios = encodeStorage(write.migration.portfolios);
      const expectedKey = createHash("sha256")
        .update(encodedPortfolios)
        .digest("hex");
      if (expectedKey !== write.migration.key) {
        throw new Error("Chave de migração inválida.");
      }
    }

    return write;
  } catch (error) {
    const kind =
      error instanceof RangeError ? "write-too-large" : "invalid-write";
    throw new AccountError(kind);
  }
}

export function createAccountService(
  repository: AccountRepository,
): AccountService {
  return {
    async snapshot() {
      return validateAccountSnapshot(await repository.snapshot());
    },
    async apply(input) {
      const write = validateWrite(input);
      return validateAccountSnapshot(await repository.apply(write));
    },
  };
}
