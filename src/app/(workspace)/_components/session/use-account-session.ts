"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import {
  AUTH_BROWSER_MESSAGE,
  AUTH_BUSY_MESSAGE,
  AUTH_RECOVERY_CHANGED,
  AUTH_SESSION_MESSAGE,
  completeBrowserAuthCallback,
} from "@/lib/auth/browser-auth";
import {
  getRecoverySession,
  matchesRecoverySession,
  type RecoverySession,
} from "@/lib/auth/recovery-session";
import type {
  AccountIdentity,
  AuthViewState,
  AuthRuntime,
} from "./session-types";

const LOCAL_ENTRY_KEY = "rendimentos.entry.local.v1";

export function useAccountSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [accountMode, setAccountMode] = useState(false);
  const [localChosen, setLocalChosen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);

  const [authView, setAuthView] = useState<AuthViewState>({
    form: null,
    error: "",
    message: "",
    needsReauthentication: false,
  });
  const actionSequenceRef = useRef(0);
  const authPendingRef = useRef(false);
  const recoverySessionRef = useRef<RecoverySession | null>(null);

  function updateAuthView(changes: Partial<AuthViewState>) {
    setAuthView((current) => ({ ...current, ...changes }));
  }

  function rememberLocal(value: boolean) {
    setLocalChosen(value);
    try {
      if (value) sessionStorage.setItem(LOCAL_ENTRY_KEY, "1");
      else sessionStorage.removeItem(LOCAL_ENTRY_KEY);
    } catch {
      // A blocked preference store must never prevent access to local portfolios.
    }
  }

  function enterLocalMode() {
    if (authPendingRef.current) return;
    recoverySessionRef.current = null;
    rememberLocal(true);
    setAccountMode(false);
    updateAuthView({ form: null, message: "", error: "" });
  }

  useEffect(function observeAuthentication() {
    const actionSequence = actionSequenceRef;
    const supabase = getBrowserSupabase();
    // This synchronously strips Auth parameters, even with absent/rejected config.
    const callbackResult = completeBrowserAuthCallback(supabase);
    try {
      // Only the entry preference is remembered here; portfolios keep their existing storage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalChosen(sessionStorage.getItem(LOCAL_ENTRY_KEY) === "1");
    } catch {
      // Continue with an explicit choice when sessionStorage is unavailable.
    }
    // Read browser-only Auth configuration after hydration.
    setConfigured(!!supabase);
    if (!supabase) {
      let live = true;
      void callbackResult.then((callback) => {
        if (!live) return;
        updateAuthView({ error: callback.error });
        setChecking(false);
      });
      return () => {
        live = false;
      };
    }
    const authClient = supabase;
    let live = true;
    let events = 0;
    let currentUser = "";
    let initializing = true;
    let latestSession: Session | null = null;
    function applySession(next: Session | null, openAccount: boolean) {
      if (!live) return;
      setSession(next);
      if (!next) {
        setAccountMode(false);
        updateAuthView({ form: null });
      } else if (openAccount) {
        rememberLocal(false);
        setAccountMode(true);
      }
      currentUser = next?.user.id ?? "";
      setChecking(false);
    }
    function handleAuthStateChange(
      event: AuthChangeEvent,
      next: Session | null,
    ) {
      if (!live) return;
      events++;
      latestSession = next;
      if (initializing) return;
      // Keep this callback synchronous: awaiting Auth methods here can deadlock the SDK.
      const changedUser = currentUser !== (next?.user.id ?? "");
      const changedRecovery =
        recoverySessionRef.current !== null &&
        !matchesRecoverySession(next, recoverySessionRef.current);
      if (changedUser) {
        // Discard UI completions belonging to another session, including an in-flight form.
        actionSequence.current++;
        rememberLocal(false);
        updateAuthView({ form: null, error: "", message: "" });
      }
      if (changedRecovery) {
        recoverySessionRef.current = null;
        actionSequence.current++;
        updateAuthView({ form: null, error: AUTH_RECOVERY_CHANGED });
      }
      applySession(next, changedUser || event === "INITIAL_SESSION");
      if (event === "PASSWORD_RECOVERY") {
        recoverySessionRef.current = getRecoverySession(next);
        updateAuthView({
          needsReauthentication: false,
          form: recoverySessionRef.current ? "password" : null,
          error: recoverySessionRef.current ? "" : AUTH_RECOVERY_CHANGED,
          message: "",
        });
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthStateChange);
    const stopSessionErrors = supabase.onSessionError((message) => {
      if (!live) return;
      actionSequence.current++;
      recoverySessionRef.current = null;
      applySession(null, false);
      updateAuthView({ error: message });
    });
    async function restoreSessionAfterCallback(
      callback: Awaited<typeof callbackResult>,
    ) {
      const beforeRead = events;
      const { data, error: sessionError } = await authClient.restoreSession();
      if (!live) return;
      initializing = false;
      if (sessionError) {
        applySession(null, false);
        updateAuthView({ error: AUTH_SESSION_MESSAGE });
        return;
      }
      const restored = events === beforeRead ? data.session : latestSession;
      applySession(restored, !!restored);
      if (callback.error) updateAuthView({ error: callback.error });
      // A login in another tab after the exchange must not inherit recovery UI.
      if (matchesRecoverySession(restored, callback.recovery)) {
        recoverySessionRef.current = callback.recovery;
        updateAuthView({ needsReauthentication: false, form: "password" });
      }
    }

    void callbackResult
      .then(restoreSessionAfterCallback)
      .catch((error: unknown) => {
        if (!live) return;
        initializing = false;
        applySession(null, false);
        updateAuthView({
          error:
            error instanceof Error &&
            [AUTH_BROWSER_MESSAGE, AUTH_BUSY_MESSAGE].includes(error.message)
              ? error.message
              : AUTH_SESSION_MESSAGE,
        });
      });
    return () => {
      live = false;
      actionSequence.current++;
      subscription.unsubscribe();
      stopSessionErrors();
    };
  }, []);

  function openAccount() {
    setAccountMode(true);
  }

  function closeAccount() {
    setAccountMode(false);
    rememberLocal(false);
  }

  function clearSession() {
    setSession(null);
  }

  function toggleMode() {
    rememberLocal(accountMode);
    setAccountMode(!accountMode);
    updateAuthView({ message: "", error: "" });
  }

  const identity: AccountIdentity | null =
    accountMode && session
      ? {
          userId: session.user.id,
          email: session.user.email ?? "",
          accessToken: session.access_token,
        }
      : null;
  const entered = !checking && (!!identity || localChosen);
  const runtime: AuthRuntime = {
    actionSequence: actionSequenceRef,
    pending: authPendingRef,
    recoverySession: recoverySessionRef,
  };

  return {
    session,
    accountMode,
    checking,
    configured,
    identity,
    entered,
    authView,
    runtime,
    updateAuthView,
    enterLocalMode,
    openAccount,
    closeAccount,
    clearSession,
    toggleMode,
  };
}

export type AccountSessionController = ReturnType<typeof useAccountSession>;
