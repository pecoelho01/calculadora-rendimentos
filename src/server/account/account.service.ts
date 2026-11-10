import { createHash } from "node:crypto";
import { validateAccountSnapshot, validateAccountWrite, type AccountSnapshot } from "../../lib/account";
import { encodeStorage } from "../../lib/storage";
import { AccountError } from "./account.errors";
import type { AccountRepository } from "./account.repository";

export type AccountService = {
  snapshot(): Promise<AccountSnapshot>;
  apply(input: unknown): Promise<AccountSnapshot>;
};

export function createAccountService(repository: AccountRepository): AccountService {
  return {
    async snapshot() {
      return validateAccountSnapshot(await repository.snapshot());
    },
    async apply(input) {
      let write;
      try {
        write = validateAccountWrite(input);
        if (write.migration) {
          const expected = createHash("sha256").update(encodeStorage(write.migration.portfolios)).digest("hex");
          if (expected !== write.migration.key) throw new Error("Chave de migração inválida.");
        }
      } catch (error) {
        throw new AccountError(error instanceof RangeError ? "write-too-large" : "invalid-write");
      }
      return validateAccountSnapshot(await repository.apply(write));
    },
  };
}
