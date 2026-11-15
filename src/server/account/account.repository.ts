import type { AccountWrite } from "../../lib/account";
import type { SupabaseBackend } from "../shared/supabase/create-client";
import { AccountError } from "./account.errors";

export type AccountRepository = {
  snapshot(): Promise<unknown>;
  apply(write: AccountWrite): Promise<unknown>;
};

export function createAccountRepository(
  backend: Pick<SupabaseBackend, "rpc">,
): AccountRepository {
  async function execute(
    name: "get_account_portfolios" | "apply_account_changes",
    args?: Record<string, unknown>,
  ) {
    const result = await backend.rpc(name, args);
    if (result.error) {
      const code = result.error.code;
      if (code === "PT429") throw new AccountError("rate-limit");
      if (code === "PT409" || code === "40001")
        throw new AccountError("conflict");
      if (code?.startsWith("22") || code === "23514")
        throw new AccountError("invalid-data");
      if (code === "42501") throw new AccountError("session-expired");
      throw new AccountError("unavailable");
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
