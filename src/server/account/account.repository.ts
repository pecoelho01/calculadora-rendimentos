import type { AccountWrite } from "../../lib/account";
import type { SupabaseBackend } from "../shared/supabase/create-client";
import { AccountError } from "./account.errors";

export type AccountRepository = {
  snapshot(): Promise<unknown>;
  apply(write: AccountWrite): Promise<unknown>;
};

function databaseError(code: string | undefined): AccountError {
  if (code === "PT429") return new AccountError("rate-limit");
  if (code === "PT409" || code === "40001") return new AccountError("conflict");
  if (code?.startsWith("22") || code === "23514") {
    return new AccountError("invalid-data");
  }
  if (code === "42501") return new AccountError("session-expired");
  return new AccountError("unavailable");
}

export function createAccountRepository(
  backend: Pick<SupabaseBackend, "rpc">,
): AccountRepository {
  async function execute(
    name: "get_account_portfolios" | "apply_account_changes",
    args?: Record<string, unknown>,
  ) {
    const result = await backend.rpc(name, args);
    if (result.error) {
      throw databaseError(result.error.code);
    }
    return result.data;
  }
  return {
    snapshot() {
      return execute("get_account_portfolios");
    },
    apply(write) {
      return execute("apply_account_changes", {
        p_changes: write.changes,
        p_migration: write.migration ?? null,
      });
    },
  };
}
