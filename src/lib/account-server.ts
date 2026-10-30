import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { validateAccountSnapshot, validateAccountWrite } from "./account";
import { encodeStorage } from "./storage";

export type AccountBackend = {
  getUser(token: string): Promise<{ id: string } | null>;
  rpc(name: "account_snapshot" | "account_apply", args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string } | null;
  }>;
};
export type AccountBackendFactory = (token: string) => AccountBackend | null;

export function supabaseAccountBackend(token: string): AccountBackend | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // Request-scoped client; the user JWT is checked by Auth and forwarded to RLS/RPC.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) }) },
  });
  return {
    async getUser(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      return !error && data.user ? { id: data.user.id } : null;
    },
    async rpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  };
}
const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}
async function readBody(request: Request): Promise<unknown> {
  const maxBytes = 3_100_000;
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new RangeError("Corpo demasiado grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Corpo vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RangeError("Corpo demasiado grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Injected only in deterministic tests; production always uses Supabase Auth + Postgres. */
export function createAccountHandler(factory: AccountBackendFactory = supabaseAccountBackend) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const authorization = request.headers.get("authorization");
      const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return response({ error: "Inicia sessão para aceder às carteiras da conta." }, 401);
      const backend = factory(token);
      if (!backend) return response({ error: "O modo de conta não está configurado." }, 503);
      const user = await backend.getUser(token);
      if (!user) return response({ error: "A sessão expirou. Inicia sessão novamente." }, 401);
      let args: Record<string, unknown> | undefined;
      if (request.method === "POST") {
        try {
          const write = validateAccountWrite(await readBody(request));
          if (write.migration) {
            const expected = createHash("sha256").update(encodeStorage(write.migration.portfolios)).digest("hex");
            if (expected !== write.migration.key) throw new Error("Chave de migração inválida.");
          }
          args = { p_changes: write.changes, p_migration: write.migration ?? null };
        } catch (error) {
          if (error instanceof RangeError) return response({ error: "O pedido excede o tamanho permitido." }, 413);
          return response({ error: "Dados inválidos. Nenhuma alteração foi guardada." }, 400);
        }
      } else if (request.method !== "GET") {
        return response({ error: "Método não permitido." }, 405);
      }
      const result = await backend.rpc(request.method === "POST" ? "account_apply" : "account_snapshot", args);
      if (result.error) {
        if (result.error.code === "PT409" || result.error.code === "40001") return response({ error: "Esta carteira foi alterada noutro dispositivo. Recarrega os dados antes de repetir a operação." }, 409);
        if (result.error.code?.startsWith("22") || result.error.code === "23514") return response({ error: "Dados inválidos ou limites excedidos. Nenhuma alteração foi guardada." }, 400);
        if (result.error.code === "42501") return response({ error: "A sessão expirou. Inicia sessão novamente." }, 401);
        return response({ error: "Não foi possível aceder à conta. Tenta novamente." }, 503);
      }
      return response(validateAccountSnapshot(result.data));
    } catch {
      return response({ error: "Não foi possível aceder à conta. Tenta novamente." }, 503);
    }
  };
}
