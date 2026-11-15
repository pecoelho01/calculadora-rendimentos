import { validateSupabaseUrl } from "../../lib/supabase-url";

export async function checkAccountSchema(
  environment: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<"enabled" | "disabled"> {
  const rawUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const key = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!rawUrl && !key) return "disabled";

  const url = validateSupabaseUrl(rawUrl);
  if (!url || !key) {
    throw new Error("Configuração pública Supabase incompleta ou inválida.");
  }

  // Only public keys may reach this metadata RPC; never accept an admin key.
  if (!isPublicKey(key)) {
    throw new Error("O preflight exige uma publishable key ou chave anon.");
  }

  try {
    const response = await request(
      new URL("/rest/v1/rpc/get_account_schema_contract", url),
      {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("RPC indisponível.");

    const contract: unknown = await response.json();
    if (!isCompatibleContract(contract)) {
      throw new Error("Contrato incompatível.");
    }
    return "enabled";
  } catch {
    // Do not propagate URLs, headers, keys or remote response bodies into logs.
    throw new Error(
      "Preflight da conta falhou: verificar disponibilidade e migration 008 antes de publicar.",
    );
  }
}

function isCompatibleContract(contract: unknown): boolean {
  return (
    typeof contract === "object" &&
    contract !== null &&
    "version" in contract &&
    contract.version === 8 &&
    "accountRpcVersion" in contract &&
    contract.accountRpcVersion === 1 &&
    "legacyRpcAliases" in contract &&
    contract.legacyRpcAliases === true
  );
}

function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return false;
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return (
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === "anon"
    );
  } catch {
    return false;
  }
}
