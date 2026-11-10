import "server-only";
import { createAccountHandler } from "@/server/account/account.controller";
import { createAccountRepository } from "@/server/account/account.repository";
import { createAccountService } from "@/server/account/account.service";
import { authenticate } from "@/server/shared/auth/authenticate";
import { createSupabaseClient } from "@/server/shared/supabase/create-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createAccountHandler((token) => {
  const client = createSupabaseClient(token);
  return client && {
    authenticate: () => authenticate(client, token),
    service: createAccountService(createAccountRepository(client)),
  };
});
export const GET = handle;
export const POST = handle;
