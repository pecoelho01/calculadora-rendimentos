"use client";

import { useCallback, useState, type FormEvent } from "react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import {
  AUTH_BROWSER_MESSAGE,
  AUTH_BUSY_MESSAGE,
  AUTH_RECOVERY_CHANGED,
  runBrowserAuthMutation,
} from "@/lib/auth/browser-auth";
import { matchesRecoverySession } from "@/lib/auth/recovery-session";
import type { AuthFormKind } from "./account-types";
import type { AccountSessionController } from "./use-account-session";

const CAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
const submissionErrors: Record<AuthFormKind, string> = {
  login:
    "Não foi possível iniciar sessão. Confirma o email, a palavra-passe e a confirmação da conta.",
  register:
    "Não foi possível criar a conta. Verifica os dados e tenta novamente mais tarde.",
  password:
    "Não foi possível atualizar a palavra-passe. Pede uma nova ligação de recuperação e tenta novamente.",
  recover:
    "Não foi possível enviar a ligação de recuperação. Tenta novamente mais tarde.",
};

function submissionError(failure: unknown, form: AuthFormKind): string {
  if (
    failure instanceof Error &&
    [AUTH_BUSY_MESSAGE, AUTH_BROWSER_MESSAGE, AUTH_RECOVERY_CHANGED].includes(
      failure.message,
    )
  ) {
    return failure.message;
  }
  return submissionErrors[form];
}

export function useAuthActions(controller: AccountSessionController) {
  const { authView, updateAuthView } = controller;
  const { form, needsReauthentication } = authView;
  const {
    actionSequence: actionSequenceRef,
    pending: authPendingRef,
    recoverySession: recoverySessionRef,
  } = controller.runtime;
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const receiveCaptcha = useCallback(
    (token: string) => {
      if (!authPendingRef.current) setCaptchaToken(token);
    },
    [authPendingRef],
  );

  function openForm(next: AuthFormKind) {
    if (authPendingRef.current) return;
    recoverySessionRef.current = null;
    setCaptchaToken("");
    setCaptchaAttempt((value) => value + 1);
    setShowPassword(false);
    updateAuthView({
      form: next,
      needsReauthentication: false,
      error: "",
      message: "",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase || authPendingRef.current || !form) return;
    const authClient = supabase.auth;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const actionId = ++actionSequenceRef.current;
    const submitted = form;
    const expectedRecovery = recoverySessionRef.current;
    const nonce = String(data.get("nonce") ?? "").trim();
    const captcha =
      CAPTCHA_SITE_KEY && submitted !== "password" ? captchaToken : undefined;
    if (CAPTCHA_SITE_KEY && submitted !== "password" && !captcha) {
      updateAuthView({
        error: "Conclui a verificação de segurança antes de continuar.",
      });
      return;
    }
    setCaptchaToken("");
    authPendingRef.current = true;
    setBusy(true);
    updateAuthView({ error: "", message: "" });
    const redirectTo = `${window.location.origin}/?recovery=1`;

    async function requestPasswordRecovery() {
      const result = await authClient.resetPasswordForEmail(email, {
        redirectTo,
        ...(captcha ? { captchaToken: captcha } : {}),
      });
      if (result.error) throw result.error;
      if (actionId === actionSequenceRef.current)
        updateAuthView({
          message:
            "Se existir uma conta com este email, receberás uma ligação para recuperar o acesso.",
        });
    }

    async function updateRecoveredPassword() {
      // Read again under the mutation lock: a cross-tab event may not yet
      // have reached React, or a refresh may have happened while waiting.
      const { data: current, error: sessionError } =
        await authClient.getSession();
      if (
        sessionError ||
        !expectedRecovery ||
        recoverySessionRef.current !== expectedRecovery ||
        !matchesRecoverySession(current.session, expectedRecovery)
      ) {
        recoverySessionRef.current = null;
        updateAuthView({ form: null });
        throw new Error(AUTH_RECOVERY_CHANGED);
      }
      const result = await authClient.updateUser({
        password,
        ...(nonce ? { nonce } : {}),
      });
      if (result.error?.code === "reauthentication_needed") {
        if (
          actionId !== actionSequenceRef.current ||
          recoverySessionRef.current !== expectedRecovery
        )
          return;
        updateAuthView({ needsReauthentication: true });
        if (needsReauthentication) {
          updateAuthView({
            error:
              "É necessário um novo código de confirmação. Pede outro código antes de continuar.",
          });
          return;
        }
        const sent = await authClient.reauthenticate();
        if (actionId === actionSequenceRef.current) {
          if (sent.error)
            updateAuthView({
              error:
                "Não foi possível enviar o código. Tenta enviar novamente mais tarde.",
            });
          else
            updateAuthView({
              message:
                "Enviámos um código de confirmação para o teu email. Introduz o código para guardar a palavra-passe.",
            });
        }
        return;
      }
      if (result.error?.code === "reauthentication_not_valid") {
        if (actionId === actionSequenceRef.current)
          updateAuthView({
            error:
              "O código de confirmação é inválido ou expirou. Confirma o código ou pede outro.",
          });
        return;
      }
      if (result.error) throw result.error;
      if (actionId === actionSequenceRef.current) {
        recoverySessionRef.current = null;
        updateAuthView({ form: null, message: "Palavra-passe atualizada." });
        const url = new URL(window.location.href);
        url.searchParams.delete("recovery");
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
      }
    }

    async function registerAccount() {
      const result = await authClient.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          ...(captcha ? { captchaToken: captcha } : {}),
        },
      });
      if (result.error) throw result.error;
      if (actionId === actionSequenceRef.current) {
        const registrationMessage = result.data.session
          ? "Conta criada. As carteiras locais só serão copiadas se escolheres importá-las."
          : "Consulta o teu email para confirmar a conta. Depois, inicia sessão. As carteiras locais continuam neste navegador.";
        updateAuthView({ form: null, message: registrationMessage });
      }
    }

    async function signIn() {
      const result = await authClient.signInWithPassword({
        email,
        password,
        ...(captcha ? { options: { captchaToken: captcha } } : {}),
      });
      if (result.error) throw result.error;
      if (actionId === actionSequenceRef.current) {
        controller.openAccount();
        updateAuthView({ form: null, message: "" });
      }
    }

    async function performAuthentication() {
      switch (submitted) {
        case "recover":
          return requestPasswordRecovery();
        case "password":
          return updateRecoveredPassword();
        case "register":
          return registerAccount();
        case "login":
          return signIn();
      }
    }

    try {
      await runBrowserAuthMutation(performAuthentication);
    } catch (failure) {
      if (actionId === actionSequenceRef.current) {
        updateAuthView({ error: submissionError(failure, submitted) });
      }
    } finally {
      authPendingRef.current = false;
      if (submitted !== "password") {
        setCaptchaToken("");
        setCaptchaAttempt((value) => value + 1);
      }
      setBusy(false);
    }
  }

  async function resendReauthentication() {
    const supabase = getBrowserSupabase();
    const expected = recoverySessionRef.current;
    if (!supabase || !expected || authPendingRef.current) return;
    const actionId = ++actionSequenceRef.current;
    authPendingRef.current = true;
    setBusy(true);
    updateAuthView({ error: "", message: "" });
    try {
      await runBrowserAuthMutation(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (
          error ||
          recoverySessionRef.current !== expected ||
          !matchesRecoverySession(data.session, expected)
        ) {
          recoverySessionRef.current = null;
          updateAuthView({ form: null });
          throw new Error(AUTH_RECOVERY_CHANGED);
        }
        const result = await supabase.auth.reauthenticate();
        if (result.error) throw result.error;
        if (actionId === actionSequenceRef.current)
          updateAuthView({
            message: "Enviámos um novo código de confirmação para o teu email.",
          });
      });
    } catch (failure) {
      if (actionId === actionSequenceRef.current)
        updateAuthView({
          error:
            failure instanceof Error &&
            failure.message === AUTH_RECOVERY_CHANGED
              ? AUTH_RECOVERY_CHANGED
              : "Não foi possível enviar o código. Tenta novamente mais tarde.",
        });
    } finally {
      authPendingRef.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    const supabase = getBrowserSupabase();
    if (!supabase || authPendingRef.current) return;
    recoverySessionRef.current = null;
    authPendingRef.current = true;
    // Hide and unmount account data before waiting for a network response.
    controller.closeAccount();
    updateAuthView({ form: null, message: "", error: "" });
    setBusy(true);
    const actionId = ++actionSequenceRef.current;
    try {
      const { error: logoutError } = await runBrowserAuthMutation(async () => {
        try {
          return await supabase.auth.signOut({ scope: "local" });
        } finally {
          // auth-js 2.119 removes the session before /logout; clear at the end
          // under the lock so a session written during the request cannot renew.
          supabase.clearStoredSession();
        }
      });
      if (logoutError) throw logoutError;
      if (actionId === actionSequenceRef.current) {
        controller.clearSession();
        updateAuthView({
          message:
            "Sessão terminada neste navegador. As carteiras da conta ficam guardadas no servidor.",
        });
      }
    } catch {
      if (actionId === actionSequenceRef.current)
        updateAuthView({
          error:
            "As carteiras da conta foram fechadas, mas não foi possível terminar a sessão. Tenta sair novamente.",
        });
    } finally {
      authPendingRef.current = false;
      setBusy(false);
    }
  }

  function closeAuth() {
    if (authPendingRef.current) return;
    recoverySessionRef.current = null;
    actionSequenceRef.current++;
    updateAuthView({ form: null, error: "" });
  }

  function togglePassword() {
    setShowPassword((visible) => !visible);
  }

  return {
    busy,
    showPassword,
    captcha: {
      siteKey: CAPTCHA_SITE_KEY,
      token: captchaToken,
      attempt: captchaAttempt,
    },
    openForm,
    closeAuth,
    submit,
    resendReauthentication,
    logout,
    receiveCaptcha,
    togglePassword,
    continueLocal: controller.enterLocalMode,
    toggleMode: controller.toggleMode,
  };
}
