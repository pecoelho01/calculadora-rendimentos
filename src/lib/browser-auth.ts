"use client";
import type { BrowserAuthClient } from "./browser-auth-client";
import { getRecoverySession, type RecoverySession } from "./recovery-session";
import {
  AUTH_CALLBACK_FIELDS,
  AUTH_ERROR_FIELDS,
  AUTH_TOKEN_FIELDS,
} from "./auth-callback-params";

const AUTH_LOCK = "rendimentos.auth.mutation.v1";
export const AUTH_BUSY_MESSAGE =
  "Há um pedido de conta em curso neste navegador. Aguarda a conclusão e tenta novamente.";
export const AUTH_BROWSER_MESSAGE =
  "Este navegador não permite proteger os pedidos da conta entre separadores. Atualiza o navegador ou continua sem sessão.";
export const AUTH_RECOVERY_CHANGED =
  "A sessão de recuperação mudou. Pede uma nova ligação antes de alterar a palavra-passe.";
export const AUTH_SESSION_MESSAGE =
  "Não foi possível recuperar a sessão. Podes continuar no modo local ou iniciar sessão novamente.";
const CALLBACK_ERROR =
  "Não foi possível validar esta ligação. Pede uma nova ligação e abre-a no mesmo navegador onde iniciaste o pedido.";
let mutationPending = false;
let lockHeld = false;
let callback:
  Promise<{ recovery: RecoverySession | null; error: string }> | undefined;

/** Hold the lock until fetch completes and the browser applies Set-Cookie. */
export async function runBrowserAuthMutation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (mutationPending) throw new Error(AUTH_BUSY_MESSAGE);
  mutationPending = true;
  try {
    // An exclusive browser lock also prevents a late login in one tab replacing
    // a newer login/logout in another. Fail closed where this API is unavailable.
    if (!navigator.locks) throw new Error(AUTH_BROWSER_MESSAGE);
    async function runWithAcquiredLock(lock: Lock | null): Promise<T> {
      if (!lock) throw new Error(AUTH_BUSY_MESSAGE);
      lockHeld = true;
      try {
        return await operation();
      } finally {
        lockHeld = false;
      }
    }

    return await navigator.locks.request(
      AUTH_LOCK,
      { ifAvailable: true },
      runWithAcquiredLock,
    );
  } finally {
    mutationPending = false;
  }
}

/** An assertion, never a reentrant lock or permission for background work to bypass it. */
export function assertBrowserAuthLock() {
  if (!lockHeld) throw new Error(AUTH_BUSY_MESSAGE);
}

/** Coalesced across React effect remounts: a one-use code is never exchanged twice. */
export function completeBrowserAuthCallback(auth: BrowserAuthClient | null) {
  if (callback) return callback;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const implicit = AUTH_TOKEN_FIELDS.some(
    (key) => fragment.has(key) || url.searchParams.has(key),
  );
  const codes = url.searchParams.getAll("code");
  const hasError = AUTH_ERROR_FIELDS.some(
    (key) => fragment.has(key) || url.searchParams.has(key),
  );
  const attempted =
    implicit ||
    codes.length > 0 ||
    fragment.has("code") ||
    hasError ||
    url.searchParams.has("recovery");
  if (!attempted)
    return (callback = Promise.resolve({ recovery: null, error: "" }));

  // Strip credentials/codes even on failure, before asynchronous Auth work.
  for (const key of AUTH_CALLBACK_FIELDS) url.searchParams.delete(key);
  url.hash = "";
  window.history.replaceState(null, "", url.pathname + url.search);
  if (
    !auth ||
    implicit ||
    hasError ||
    codes.length !== 1 ||
    !codes[0] ||
    codes[0].length > 4096 ||
    fragment.has("code")
  )
    return (callback = Promise.resolve({
      recovery: null,
      error: CALLBACK_ERROR,
    }));

  const authClient = auth;
  const code = codes[0];

  async function exchangeCallbackCode() {
    // The server exchanges the code using the encrypted HttpOnly PKCE cookie.
    const { data, error } = await authClient.completeCallback(code);
    const recovery =
      !error && data.session?.recovery
        ? getRecoverySession(data.session)
        : null;
    return { recovery, error: error ? CALLBACK_ERROR : "" };
  }

  callback = runBrowserAuthMutation(exchangeCallbackCode).catch(() => ({
    recovery: null,
    error: CALLBACK_ERROR,
  }));
  return callback;
}
