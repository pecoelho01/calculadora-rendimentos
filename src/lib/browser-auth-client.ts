"use client";
import { AuthClient, type AuthChangeEvent, type Session, type SupportedStorage } from "@supabase/supabase-js";
import { assertBrowserAuthLock, AUTH_BROWSER_MESSAGE, AUTH_BUSY_MESSAGE, AUTH_SESSION_MESSAGE, runBrowserAuthMutation } from "./browser-auth";

type RawAuth = InstanceType<typeof AuthClient>;

type Listener = (event: AuthChangeEvent, session: Session | null) => void | Promise<void>;
type AuthMethods = Pick<RawAuth, "getSession" | "signInWithPassword" | "signUp" | "resetPasswordForEmail" | "updateUser" | "reauthenticate" | "signOut" | "exchangeCodeForSession"> & {
  onAuthStateChange: (listener: Listener) => { data: { subscription: { id: string; callback: Listener; unsubscribe: () => void } } };
};

export type BrowserSupabase = {
  auth: AuthMethods;
  restoreSession: () => ReturnType<RawAuth["getSession"]>;
  onSessionError: (listener: (message: string) => void) => () => void;
};

/** No raw SDK client escapes this boundary. Every SDK read/write runs under AUTH_LOCK. */
export function createBrowserAuthClient(url: string, key: string): BrowserSupabase {
  let raw: RawAuth | undefined;
  let initialized = false;
  let currentSession: Session | null = null;
  let restoring: ReturnType<RawAuth["getSession"]> | undefined;
  const listeners = new Map<string, Listener>();
  const errorListeners = new Set<(message: string) => void>();
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  let hidePriorSession = false;

  function notify(listener: Listener, event: AuthChangeEvent, session: Session | null) {
    // Never await consumer callbacks inside SDK persistence or initialization.
    try { void Promise.resolve(listener(event, session)).catch(() => {}); }
    catch { /* A consumer must not interrupt the SDK's session commit. */ }
  }
  function emit(event: AuthChangeEvent, session: Session | null) {
    currentSession = session;
    for (const listener of listeners.values()) notify(listener, event, session);
  }

  async function initialize(forCallback = false) {
    assertBrowserAuthLock();
    if (initialized) return { client: raw!, sessionError: null };
    const base = new URL(url);
    base.pathname = `${base.pathname.replace(/\/$/, "")}/`;
    // A callback must exchange its code before trying to renew an old session:
    // a rejected old refresh would otherwise erase the valid PKCE verifier.
    // Hide only session reads during bootstrap, never the actual stored record
    // or the verifier. Invalid callbacks can still restore the previous session.
    let storage: SupportedStorage | undefined;
    if (!raw && forCallback) {
      let persistent: Storage | undefined;
      try {
        const candidate = window.localStorage;
        const probe = `${storageKey}-probe-${crypto.randomUUID()}`;
        candidate.setItem(probe, "1");
        candidate.removeItem(probe);
        persistent = candidate;
      } catch { /* Match the SDK's in-memory fallback when storage is unavailable. */ }
      const memory = new Map<string, string>();
      storage = {
        getItem(name: string) {
          if (hidePriorSession && name === storageKey) return null;
          return persistent ? persistent.getItem(name) : memory.get(name) ?? null;
        },
        setItem(name: string, value: string) {
          if (persistent) persistent.setItem(name, value);
          else memory.set(name, value);
        },
        removeItem(name: string) {
          if (persistent) persistent.removeItem(name);
          else memory.delete(name);
        },
      };
    }
    raw ??= new AuthClient({
      url: new URL("auth/v1", base).href,
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      storageKey, storage,
      flowType: "pkce", detectSessionInUrl: false, persistSession: true,
      skipAutoInitialize: true, autoRefreshToken: false,
    });
    hidePriorSession = forCallback;
    try {
      try {
        const result = await raw.initialize();
        if (result.error) throw result.error;
      } finally {
        // autoRefreshToken:false alone does not disable SDK visibility recovery.
        await raw.stopAutoRefresh();
      }
      // Unlike the SDK's INITIAL_SESSION notification, this read exposes refresh errors.
      const initial = await raw.getSession();
      currentSession = initial.data.session;
      // Subscribe exactly once. INITIAL_SESSION itself reads/refreshes the session:
      // keep the Web Lock until that implicit read has also completed.
      await new Promise<void>((resolve) => {
        raw!.onAuthStateChange((event, session) => {
          if (event === "INITIAL_SESSION") {
            currentSession = session;
            resolve();
          } else emit(event, session);
        });
      });
      initialized = true;
      window.setInterval(() => { void refresh(); }, 30_000);
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      // A rejected old refresh must be reported by session restoration, but must
      // not prevent a fresh login from establishing a session.
      return { client: raw, sessionError: initial.error };
    } finally { hidePriorSession = false; }
  }

  async function refresh() {
    if (!initialized || document.visibilityState !== "visible") return;
    try {
      // Always acquire afresh: a foreground operation's lock cannot be reused here.
      await runBrowserAuthMutation(async () => {
        const result = await auth.getSession();
        if (result.error) throw result.error;
        if (!result.data.session && currentSession) emit("SIGNED_OUT", null);
        else if (result.data.session?.access_token !== currentSession?.access_token)
          emit("TOKEN_REFRESHED", result.data.session);
      });
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_BUSY_MESSAGE) return;
      const message = error instanceof Error && error.message === AUTH_BROWSER_MESSAGE
        ? AUTH_BROWSER_MESSAGE : AUTH_SESSION_MESSAGE;
      for (const listener of errorListeners) listener(message);
    }
  }

  const auth: AuthMethods = {
    getSession: async () => {
      const { client, sessionError } = await initialize();
      return sessionError ? { data: { session: null }, error: sessionError } : client.getSession();
    },
    signInWithPassword: async (...args) => (await initialize()).client.signInWithPassword(...args),
    signUp: async (...args) => (await initialize()).client.signUp(...args),
    resetPasswordForEmail: async (...args) => (await initialize()).client.resetPasswordForEmail(...args),
    updateUser: async (...args) => (await initialize()).client.updateUser(...args),
    reauthenticate: async () => (await initialize()).client.reauthenticate(),
    signOut: async (...args) => (await initialize()).client.signOut(...args),
    exchangeCodeForSession: async (...args) => (await initialize(true)).client.exchangeCodeForSession(...args),
    onAuthStateChange(listener: Listener) {
      const id = crypto.randomUUID();
      listeners.set(id, listener);
      if (initialized) queueMicrotask(() => {
        if (listeners.has(id)) notify(listener, "INITIAL_SESSION", currentSession);
      });
      return { data: { subscription: { id, callback: listener, unsubscribe: () => { listeners.delete(id); } } } };
    },
  };
  return {
    auth,
    restoreSession() {
      // React effect remounts share one initialization rather than fail as "busy".
      restoring ??= runBrowserAuthMutation(async () => {
        const result = await auth.getSession();
        if (!result.error) currentSession = result.data.session;
        return result;
      }).finally(() => { restoring = undefined; });
      return restoring;
    },
    onSessionError(listener) {
      errorListeners.add(listener);
      return () => { errorListeners.delete(listener); };
    },
  };
}
