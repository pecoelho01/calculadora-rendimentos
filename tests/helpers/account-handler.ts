import { createAccountHandler as createController } from "../../src/server/account/account.controller";
import { createAccountRepository } from "../../src/server/account/account.repository";
import { createAccountService } from "../../src/server/account/account.service";
import { authenticate } from "../../src/server/shared/auth/authenticate";
import { createSupabaseClient, type SupabaseBackendFactory } from "../../src/server/shared/supabase/create-client";

export type AccountBackendFactory = SupabaseBackendFactory;

/** Real layers, with only Auth/RPC transport replaced in deterministic tests. */
export function createAccountHandler(factory: AccountBackendFactory = createSupabaseClient) {
  return createController((token) => {
    const backend = factory(token);
    return backend && {
      authenticate: () => authenticate(backend, token),
      service: createAccountService(createAccountRepository(backend)),
    };
  });
}
