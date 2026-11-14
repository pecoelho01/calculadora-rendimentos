import { createClient } from "@supabase/supabase-js";
import { validateSupabaseUrl } from "../../../lib/supabase-url";

export type SupabaseBackend = {
  getUser(
    token: string,
  ): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string } | null;
  }>;
};
export type SupabaseBackendFactory = (token: string) => SupabaseBackend | null;

function fetchWithoutCache(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export function createSupabaseClient(token: string): SupabaseBackend | null {
  const url = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // Request-scoped client; the user JWT is checked by Auth and forwarded to RLS/RPC.
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: fetchWithoutCache,
    },
  });
  return {
    async getUser(accessToken) {
      return client.auth.getUser(accessToken);
    },
    async rpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  };
}
