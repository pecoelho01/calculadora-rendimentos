"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecoverySession, type RecoverySession } from "./recovery-session";

const AUTH_LOCK = "rendimentos.auth.mutation.v1";
export const AUTH_BUSY_MESSAGE = "Há um pedido de conta em curso neste navegador. Aguarda a conclusão e tenta novamente.";
export const AUTH_BROWSER_MESSAGE = "Este navegador não permite proteger os pedidos da conta entre separadores. Atualiza o navegador ou continua sem sessão.";
export const AUTH_RECOVERY_CHANGED = "A sessão de recuperação mudou. Pede uma nova ligação antes de alterar a palavra-passe.";
const CALLBACK_ERROR = "Não foi possível validar esta ligação. Pede uma nova ligação e abre-a no mesmo navegador onde iniciaste o pedido.";
let mutationPending = false;
let callback: Promise<{ recovery: RecoverySession | null; error: string }> | undefined;

/** Includes the SDK's session persistence, not only the HTTP request or UI completion. */
export async function runBrowserAuthMutation<T>(operation: () => Promise<T>): Promise<T> {
  if (mutationPending) throw new Error(AUTH_BUSY_MESSAGE);
  mutationPending = true;
  try {
    // An exclusive browser lock also prevents a late login in one tab replacing
    // a newer login/logout in another. Fail closed where this API is unavailable.
    if (!navigator.locks) throw new Error(AUTH_BROWSER_MESSAGE);
    return await navigator.locks.request(AUTH_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error(AUTH_BUSY_MESSAGE);
      return operation();
    });
  } finally {
    mutationPending = false;
  }
}

/** Coalesced across React effect remounts: a one-use code is never exchanged twice. */
export function completeBrowserAuthCallback(supabase: SupabaseClient | null) {
  if (callback) return callback;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const tokenFields = ["access_token", "refresh_token", "token_type", "expires_in", "expires_at", "provider_token", "provider_refresh_token"];
  const errorFields = ["error", "error_code", "error_description"];
  const implicit = tokenFields.some((key) => fragment.has(key) || url.searchParams.has(key));
  const codes = url.searchParams.getAll("code");
  const hasError = errorFields.some((key) => fragment.has(key) || url.searchParams.has(key));
  const attempted = implicit || codes.length > 0 || fragment.has("code") || hasError || url.searchParams.has("recovery");
  if (!attempted) return (callback = Promise.resolve({ recovery: null, error: "" }));

  // Strip credentials/codes even on failure, before asynchronous work and rendering.
  for (const key of [...tokenFields, ...errorFields, "code", "recovery", "type", "sb_flow_id"])
    url.searchParams.delete(key);
  url.hash = "";
  window.history.replaceState(null, "", url.pathname + url.search);
  if (!supabase || implicit || hasError || codes.length !== 1 || !codes[0] || codes[0].length > 4096 || fragment.has("code"))
    return (callback = Promise.resolve({ recovery: null, error: CALLBACK_ERROR }));

  callback = runBrowserAuthMutation(async () => {
    // The SDK checks the locally stored verifier. An unsolicited code, including
    // one belonging to an attacker, cannot be exchanged without that verifier.
    let recoveryAccessToken: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recoveryAccessToken = session?.access_token ?? null;
    });
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(codes[0]);
      const confirmedRecovery = !error && !!data.session && recoveryAccessToken === data.session.access_token;
      const recovery = confirmedRecovery ? getRecoverySession(data.session) : null;
      return {
        recovery,
        error: error || (confirmedRecovery && !recovery) ? CALLBACK_ERROR : "",
      };
    } finally {
      subscription.unsubscribe();
    }
  }).catch(() => ({ recovery: null, error: CALLBACK_ERROR }));
  return callback;
}
