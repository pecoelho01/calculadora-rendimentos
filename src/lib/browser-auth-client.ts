"use client";

import {
  assertBrowserAuthLock,
  AUTH_BUSY_MESSAGE,
  AUTH_SESSION_MESSAGE,
  runBrowserAuthMutation,
} from "./browser-auth";
import { validateSupabaseUrl } from "./supabase-url";

/** Public session metadata only. Access and refresh tokens stay in HttpOnly cookies. */
export type BrowserSession = {
  user: { id: string; email: string };
  sessionKey: string;
  recovery: boolean;
};
export type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "PASSWORD_RECOVERY"
  | "USER_UPDATED";
type Listener = (event: AuthEvent, session: BrowserSession | null) => void;
type AuthError = { message: string; code?: string };
type AuthResult = {
  configured?: boolean;
  sessionCleared?: boolean;
  data: { session: BrowserSession | null };
  error: AuthError | null;
};
type Credentials = {
  email: string;
  password: string;
  options?: { captchaToken?: string; emailRedirectTo?: string };
};
const CHANNEL = "rendimentos.auth.session.v1";

function isSession(value: unknown): value is BrowserSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<BrowserSession>;
  return (
    typeof session.sessionKey === "string" &&
    typeof session.recovery === "boolean" &&
    !!session.user &&
    typeof session.user.id === "string" &&
    typeof session.user.email === "string"
  );
}

function createBrowserAuthClient() {
  let currentSession: BrowserSession | null = null;
  let restored = false;
  let restoring: Promise<AuthResult> | undefined;
  const listeners = new Set<Listener>();
  const errorListeners = new Set<(message: string) => void>();
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(CHANNEL);

  function emit(event: AuthEvent, session: BrowserSession | null) {
    currentSession = session;
    for (const listener of listeners) listener(event, session);
  }

  function announce(event: AuthEvent) {
    channel?.postMessage({ event });
  }

  async function request(
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<AuthResult> {
    assertBrowserAuthLock();
    const response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "rendimentos",
        ...(currentSession
          ? { "X-Account-Session": currentSession.sessionKey }
          : {}),
      },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json();
    if (!result || typeof result !== "object")
      throw new Error(AUTH_SESSION_MESSAGE);
    const payload = result as Record<string, unknown>;
    if (!response.ok) {
      return {
        data: { session: null },
        sessionCleared: action === "logout" && payload.session === null,
        error: {
          message:
            typeof payload.error === "string"
              ? payload.error
              : AUTH_SESSION_MESSAGE,
          ...(typeof payload.code === "string" ? { code: payload.code } : {}),
        },
      };
    }
    if (payload.session !== null && !isSession(payload.session))
      throw new Error(AUTH_SESSION_MESSAGE);
    return {
      configured: payload.configured === true,
      sessionCleared: action === "logout" && payload.session === null,
      data: { session: payload.session },
      error: null,
    };
  }

  async function getSession(): Promise<AuthResult> {
    const result = await request("session");
    if (!result.error) {
      const next = result.data.session;
      const changed = currentSession?.sessionKey !== next?.sessionKey;
      if (!restored) {
        restored = true;
        emit("INITIAL_SESSION", next);
      } else if (changed) {
        emit(next ? "SIGNED_IN" : "SIGNED_OUT", next);
      } else {
        currentSession = next;
      }
    }
    return result;
  }

  async function refresh() {
    if (!restored || document.visibilityState !== "visible") return;
    try {
      await runBrowserAuthMutation(async () => {
        const result = await getSession();
        if (result.error) throw new Error(result.error.message);
      });
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_BUSY_MESSAGE) return;
      for (const listener of errorListeners) listener(AUTH_SESSION_MESSAGE);
    }
  }

  function handleSessionBroadcast(message: MessageEvent<unknown>) {
    // Invalidate identity changes immediately, including during pending forms.
    // Refresh signals only recheck the session and preserve recovery input.
    const event =
      message.data && typeof message.data === "object"
        ? (message.data as { event?: unknown }).event
        : undefined;
    const changesIdentity =
      event === "SIGNED_IN" ||
      event === "SIGNED_OUT" ||
      event === "PASSWORD_RECOVERY";
    if (changesIdentity && currentSession) emit("SIGNED_OUT", null);
    void refresh();
  }

  channel?.addEventListener("message", handleSessionBroadcast);
  window.setInterval(() => {
    void refresh();
  }, 30_000);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);

  return {
    getSession,
    restoreSession() {
      restoring ??= runBrowserAuthMutation(getSession).finally(() => {
        restoring = undefined;
      });
      return restoring;
    },
    async login({ email, password, options }: Credentials) {
      const result = await request("login", {
        email,
        password,
        captchaToken: options?.captchaToken,
      });
      if (!result.error) {
        emit("SIGNED_IN", result.data.session);
        announce("SIGNED_IN");
      }
      return result;
    },
    async register({ email, password, options }: Credentials) {
      const result = await request("register", {
        email,
        password,
        captchaToken: options?.captchaToken,
      });
      if (!result.error && result.data.session) {
        emit("SIGNED_IN", result.data.session);
        announce("SIGNED_IN");
      }
      return result;
    },
    recover(
      email: string,
      options?: { redirectTo?: string; captchaToken?: string },
    ) {
      return request("recover", { email, captchaToken: options?.captchaToken });
    },
    async updatePassword(body: { password: string; nonce?: string }) {
      const result = await request("password", {
        ...body,
        sessionKey: currentSession?.sessionKey,
      });
      if (!result.error) {
        emit("USER_UPDATED", result.data.session);
        announce("USER_UPDATED");
      }
      return result;
    },
    reauthenticate() {
      return request("reauthenticate", {
        sessionKey: currentSession?.sessionKey,
      });
    },
    async logout() {
      const result = await request("logout", {
        sessionKey: currentSession?.sessionKey,
      });
      // The server clears the local cookie even if remote revocation is unavailable.
      if (result.sessionCleared) {
        currentSession = null;
        announce("SIGNED_OUT");
      }
      return result;
    },
    async completeCallback(code: string) {
      const result = await request("callback", { code });
      if (!result.error) {
        const event = result.data.session?.recovery
          ? "PASSWORD_RECOVERY"
          : "SIGNED_IN";
        emit(event, result.data.session);
        announce(event);
      }
      return result;
    },
    onAuthStateChange(listener: Listener) {
      listeners.add(listener);
      if (restored)
        queueMicrotask(() => {
          if (listeners.has(listener))
            listener("INITIAL_SESSION", currentSession);
        });
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(listener);
            },
          },
        },
      };
    },
    onSessionError(listener: (message: string) => void) {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },
  };
}

export type BrowserAuthClient = ReturnType<typeof createBrowserAuthClient>;
let client: BrowserAuthClient | null | undefined;

export function getBrowserAuthClient(): BrowserAuthClient | null {
  if (typeof window === "undefined") return null;
  if (client !== undefined) return client;
  const url = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return (client = null);
  // This migration deliberately requires a new login. Never adopt legacy browser tokens.
  try {
    const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
    localStorage.removeItem(storageKey);
    localStorage.removeItem(`${storageKey}-code-verifier`);
  } catch {
    /* Local portfolios remain available even if storage is blocked. */
  }
  return (client = createBrowserAuthClient());
}
