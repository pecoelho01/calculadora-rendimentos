import "server-only";
import {
  createAccountHandler,
  type AccountSession,
} from "@/server/account/account.controller";
import { createAccountRepository } from "@/server/account/account.repository";
import { createAccountService } from "@/server/account/account.service";
import { authenticate } from "@/server/shared/auth/authenticate";
import { createSupabaseClient } from "@/server/shared/supabase/create-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createRequestSession(token: string): AccountSession | null {
  const client = createSupabaseClient(token);
  if (!client) return null;

  const repository = createAccountRepository(client);
  const service = createAccountService(repository);
  return {
    authenticate: () => authenticate(client, token),
    service,
  };
}

const handle = createAccountHandler(createRequestSession);
export const GET = handle;
export const POST = handle;
