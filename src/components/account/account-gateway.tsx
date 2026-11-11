"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { AUTH_BROWSER_MESSAGE, AUTH_BUSY_MESSAGE, AUTH_RECOVERY_CHANGED, AUTH_SESSION_MESSAGE, completeBrowserAuthCallback, runBrowserAuthMutation } from "@/lib/browser-auth";
import { getRecoverySession, matchesRecoverySession, type RecoverySession } from "@/lib/recovery-session";
import { Dialog } from "../shared/dialog";
import { AuthCaptcha } from "./auth-captcha";
import { Icon } from "../shared/icon";
import { ThemeControl } from "../shared/theme-control";
import "./account.css";

export type AccountIdentity = {
  userId: string;
  email: string;
  accessToken: string;
};
const LOCAL_ENTRY_KEY = "rendimentos.entry.local.v1";
const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

type AuthForm = "login" | "register" | "recover" | "password" | null;
const titles = {
  login: "Iniciar sessão",
  register: "Criar conta",
  recover: "Recuperar acesso",
  password: "Definir nova palavra-passe",
};

export function AccountGateway({
  children,
}: {
  children: (identity: AccountIdentity | null, controls: ReactNode, sidebarControls: ReactNode, feedback: ReactNode) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [accountMode, setAccountMode] = useState(false);
  const [localChosen, setLocalChosen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState<AuthForm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const action = useRef(0);
  const authPending = useRef(false);
  const recoverySession = useRef<RecoverySession | null>(null);
  const welcomeHeading = useRef<HTMLHeadingElement>(null);
  const authHeading = useRef<HTMLHeadingElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  const receiveCaptcha = useCallback((token: string) => {
    if (!authPending.current) setCaptchaToken(token);
  }, []);

  function rememberLocal(value: boolean) {
    setLocalChosen(value);
    try {
      if (value) sessionStorage.setItem(LOCAL_ENTRY_KEY, "1");
      else sessionStorage.removeItem(LOCAL_ENTRY_KEY);
    } catch {
      // A blocked preference store must never prevent access to local portfolios.
    }
  }
  function continueLocal() {
    if (authPending.current) return;
    recoverySession.current = null;
    rememberLocal(true);
    setAccountMode(false);
    setForm(null);
    setMessage("");
    setError("");
  }

  useEffect(() => {
    const actions = action;
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
        setError(callback.error);
        setChecking(false);
      });
      return () => { live = false; };
    }
    let live = true;
    let events = 0;
    let currentUser = "";
    let initializing = true;
    let latestSession: Session | null = null;
    const apply = (next: Session | null, openAccount: boolean) => {
      if (!live) return;
      setSession(next);
      if (!next) {
        setAccountMode(false);
        setForm(null);
      } else if (openAccount) {
        rememberLocal(false);
        setAccountMode(true);
      }
      currentUser = next?.user.id ?? "";
      setChecking(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!live) return;
      events++;
      latestSession = next;
      if (initializing) return;
      // Keep this callback synchronous: awaiting Auth methods here can deadlock the SDK.
      const changedUser = currentUser !== (next?.user.id ?? "");
      const changedRecovery = recoverySession.current !== null && !matchesRecoverySession(next, recoverySession.current);
      if (changedUser) {
        // Discard UI completions belonging to another session, including an in-flight form.
        actions.current++;
        rememberLocal(false);
        setForm(null);
        setError("");
        setMessage("");
      }
      if (changedRecovery) {
        recoverySession.current = null;
        actions.current++;
        setForm(null);
        setError(AUTH_RECOVERY_CHANGED);
      }
      apply(next, changedUser || event === "INITIAL_SESSION");
      if (event === "PASSWORD_RECOVERY") {
        recoverySession.current = getRecoverySession(next);
        setNeedsReauthentication(false);
        setForm(recoverySession.current ? "password" : null);
        setError(recoverySession.current ? "" : AUTH_RECOVERY_CHANGED);
        setMessage("");
      }
    });
    const stopSessionErrors = supabase.onSessionError((message) => {
      if (!live) return;
      actions.current++;
      recoverySession.current = null;
      apply(null, false);
      setError(message);
    });
    void callbackResult.then(async (callback) => {
      const beforeRead = events;
      const { data, error: sessionError } = await supabase.restoreSession();
      if (!live) return;
      initializing = false;
      if (sessionError) {
        apply(null, false);
        setError(AUTH_SESSION_MESSAGE);
        return;
      }
      const restored = events === beforeRead ? data.session : latestSession;
      apply(restored, !!restored);
      if (callback.error) setError(callback.error);
      // A login in another tab after the exchange must not inherit recovery UI.
      if (matchesRecoverySession(restored, callback.recovery)) {
        recoverySession.current = callback.recovery;
        setNeedsReauthentication(false);
        setForm("password");
      }
    }).catch((error: unknown) => {
      if (!live) return;
      initializing = false;
      apply(null, false);
      setError(error instanceof Error && [AUTH_BROWSER_MESSAGE, AUTH_BUSY_MESSAGE].includes(error.message)
        ? error.message : AUTH_SESSION_MESSAGE);
    });
    return () => {
      live = false;
      actions.current++;
      subscription.unsubscribe();
      stopSessionErrors();
    };
  }, []);

  function open(next: AuthForm) {
    if (authPending.current) return;
    recoverySession.current = null;
    setCaptchaToken("");
    setCaptchaAttempt((value) => value + 1);
    setNeedsReauthentication(false);
    setForm(next);
    setShowPassword(false);
    setError("");
    setMessage("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase || authPending.current || !form) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const task = ++action.current;
    const submitted = form;
    const expectedRecovery = recoverySession.current;
    const nonce = String(data.get("nonce") ?? "").trim();
    const captcha = CAPTCHA_SITE_KEY && submitted !== "password" ? captchaToken : undefined;
    if (CAPTCHA_SITE_KEY && submitted !== "password" && !captcha) {
      setError("Conclui a verificação de segurança antes de continuar.");
      return;
    }
    setCaptchaToken("");
    authPending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await runBrowserAuthMutation(async () => {
        const redirectTo = `${window.location.origin}/?recovery=1`;
        if (submitted === "recover") {
          const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo, ...(captcha ? { captchaToken: captcha } : {}) });
          if (result.error) throw result.error;
          if (task === action.current)
            setMessage("Se existir uma conta com este email, receberás uma ligação para recuperar o acesso.");
        } else if (submitted === "password") {
          // Read again under the mutation lock: a cross-tab event may not yet
          // have reached React, or a refresh may have happened while waiting.
          const { data: current, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !expectedRecovery || recoverySession.current !== expectedRecovery ||
              !matchesRecoverySession(current.session, expectedRecovery)) {
            recoverySession.current = null;
            setForm(null);
            throw new Error(AUTH_RECOVERY_CHANGED);
          }
          const result = await supabase.auth.updateUser({ password, ...(nonce ? { nonce } : {}) });
          if (result.error?.code === "reauthentication_needed") {
            if (task !== action.current || recoverySession.current !== expectedRecovery) return;
            setNeedsReauthentication(true);
            if (needsReauthentication) {
              setError("É necessário um novo código de confirmação. Pede outro código antes de continuar.");
              return;
            }
            const sent = await supabase.auth.reauthenticate();
            if (task === action.current) {
              if (sent.error) setError("Não foi possível enviar o código. Tenta enviar novamente mais tarde.");
              else setMessage("Enviámos um código de confirmação para o teu email. Introduz o código para guardar a palavra-passe.");
            }
            return;
          }
          if (result.error?.code === "reauthentication_not_valid") {
            if (task === action.current) setError("O código de confirmação é inválido ou expirou. Confirma o código ou pede outro.");
            return;
          }
          if (result.error) throw result.error;
          if (task === action.current) {
            recoverySession.current = null;
            setForm(null);
            setMessage("Palavra-passe atualizada.");
            const url = new URL(window.location.href);
            url.searchParams.delete("recovery");
            window.history.replaceState(null, "", url.pathname + url.search + url.hash);
          }
        } else if (submitted === "register") {
          const result = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/`, ...(captcha ? { captchaToken: captcha } : {}) },
          });
          if (result.error) throw result.error;
          if (task === action.current) {
            setForm(null);
            setMessage(result.data.session
              ? "Conta criada. As carteiras locais só serão copiadas se escolheres importá-las."
              : "Consulta o teu email para confirmar a conta. Depois, inicia sessão. As carteiras locais continuam neste navegador.");
          }
        } else {
          const result = await supabase.auth.signInWithPassword({ email, password, ...(captcha ? { options: { captchaToken: captcha } } : {}) });
          if (result.error) throw result.error;
          if (task === action.current) {
            setAccountMode(true);
            setForm(null);
            setMessage("");
          }
        }
      });
    } catch (failure) {
      if (task === action.current) {
        setError(failure instanceof Error && [AUTH_BUSY_MESSAGE, AUTH_BROWSER_MESSAGE, AUTH_RECOVERY_CHANGED].includes(failure.message)
          ? failure.message : submitted === "login"
          ? "Não foi possível iniciar sessão. Confirma o email, a palavra-passe e a confirmação da conta."
          : submitted === "register"
            ? "Não foi possível criar a conta. Verifica os dados e tenta novamente mais tarde."
            : submitted === "password"
              ? "Não foi possível atualizar a palavra-passe. Pede uma nova ligação de recuperação e tenta novamente."
              : "Não foi possível enviar a ligação de recuperação. Tenta novamente mais tarde.");
      }
    } finally {
      authPending.current = false;
      if (submitted !== "password") {
        setCaptchaToken("");
        setCaptchaAttempt((value) => value + 1);
      }
      setBusy(false);
    }
  }

  async function resendReauthentication() {
    const supabase = getBrowserSupabase();
    const expected = recoverySession.current;
    if (!supabase || !expected || authPending.current) return;
    const task = ++action.current;
    authPending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await runBrowserAuthMutation(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error || recoverySession.current !== expected || !matchesRecoverySession(data.session, expected)) {
          recoverySession.current = null;
          setForm(null);
          throw new Error(AUTH_RECOVERY_CHANGED);
        }
        const result = await supabase.auth.reauthenticate();
        if (result.error) throw result.error;
        if (task === action.current) setMessage("Enviámos um novo código de confirmação para o teu email.");
      });
    } catch (failure) {
      if (task === action.current) setError(failure instanceof Error && failure.message === AUTH_RECOVERY_CHANGED
        ? AUTH_RECOVERY_CHANGED : "Não foi possível enviar o código. Tenta novamente mais tarde.");
    } finally {
      authPending.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    const supabase = getBrowserSupabase();
    if (!supabase || authPending.current) return;
    recoverySession.current = null;
    authPending.current = true;
    // Hide and unmount account data before waiting for a network response.
    setAccountMode(false);
    rememberLocal(false);
    setForm(null);
    setMessage("");
    setError("");
    setBusy(true);
    const task = ++action.current;
    try {
      const { error: logoutError } = await runBrowserAuthMutation(() => supabase.auth.signOut({ scope: "local" }));
      if (logoutError) throw logoutError;
      if (task === action.current) {
        setSession(null);
        setMessage("Sessão terminada neste navegador. As carteiras da conta ficam guardadas no servidor.");
      }
    } catch {
      if (task === action.current)
        setError("As carteiras da conta foram fechadas, mas não foi possível terminar a sessão. Tenta sair novamente.");
    } finally {
      authPending.current = false;
      setBusy(false);
    }
  }

  const identity: AccountIdentity | null = accountMode && session
    ? { userId: session.user.id, email: session.user.email ?? "", accessToken: session.access_token }
    : null;
  const entered = !checking && (!!identity || localChosen);
  useEffect(() => {
    if (!checking && !entered && !form) welcomeHeading.current?.focus({ preventScroll: true });
  }, [checking, entered, form]);
  useEffect(() => {
    if (!entered && form && form !== "password") authHeading.current?.focus({ preventScroll: true });
  }, [entered, form]);

  const feedback = <>
    {message && <p className="account-feedback" role="status">{message}</p>}
    {error && !form && <p className="account-feedback form-error" role="alert">{error}</p>}
  </>;
  const sidebarControls = session ? (
    <>
      <button className="nav-item" disabled={busy} onClick={() => void logout()}>
        <Icon name="logout" /><span className="nav-label">Sair da conta</span>
      </button>
    </>
  ) : (
    <section className="sidebar-account" aria-label="Acesso à conta">
      {configured ? <>
        <button className="button primary" disabled={busy} onClick={() => open("login")}>Iniciar sessão</button>
        <button className="button secondary" disabled={busy} onClick={() => open("register")}>Criar conta</button>
      </> : <p className="subtle">As contas estão indisponíveis. Podes continuar no modo local.</p>}
    </section>
  );
  const controls = (
    <section className="account-controls no-print" aria-label="Conta e armazenamento">
      <div className="account-description">
        {entered ? <strong>Conta</strong> : null}
        <p>{session
          ? session.user.email
          : entered
            ? "As carteiras locais ficam só neste navegador."
            : "Com conta, acedes às carteiras noutros dispositivos. Sem sessão, ficam neste navegador."}</p>
      </div>
      <div className="account-actions">
        {checking ? <span>A verificar sessão…</span> : session ? <>
          <button className="button secondary" disabled={busy} onClick={() => {
            rememberLocal(accountMode);
            setAccountMode(!accountMode);
            setMessage("");
            setError("");
          }}>{accountMode ? "Usar modo local" : "Abrir carteiras da conta"}</button>
          <button className="button secondary" disabled={busy} onClick={() => void logout()}>Sair da conta</button>
        </> : configured ? <>
          <button className={`button ${entered ? "primary" : "entry-option"}`} aria-label="Iniciar sessão" disabled={busy} onClick={() => open("login")}>
            {!entered && <span className="entry-option-icon"><Icon name="shield" /></span>}
            <span>Iniciar sessão{!entered && <small>Acede às tuas carteiras em qualquer dispositivo.</small>}</span>
            {!entered && <span className="entry-option-arrow" aria-hidden="true">→</span>}
          </button>
          <button className={`button ${entered ? "secondary" : "entry-option"}`} aria-label="Criar conta" disabled={busy} onClick={() => open("register")}>
            {!entered && <span className="entry-option-icon purple"><Icon name="plus" /></span>}
            <span>Criar conta{!entered && <small>Guarda os investimentos na tua conta.</small>}</span>
            {!entered && <span className="entry-option-arrow" aria-hidden="true">→</span>}
          </button>
        </> : <span className="subtle">As contas estão indisponíveis. Podes continuar no modo local.</span>}
        {!entered && !checking && <>
          {configured && <div className="entry-divider" aria-hidden="true">ou</div>}
          <button className="button secondary entry-local" aria-label="Continuar sem sessão" disabled={busy} onClick={continueLocal}>Continuar sem sessão <span aria-hidden="true">→</span></button>
        </>}
      </div>
      {feedback}
    </section>
  );
  const inlineAuth = !entered && form !== null && form !== "password";
  function closeAuth() {
    if (authPending.current) return;
    recoverySession.current = null;
    action.current++;
    setForm(null);
    setError("");
  }
  const authForm = form ? <form onSubmit={submit} className={`account-form ${inlineAuth ? "auth-inline-form" : ""}`} aria-busy={busy}>
      <p className="eyebrow auth-eyebrow">{form === "login" ? "Bem-vindo de volta" : form === "register" ? "Começa a investir com clareza" : form === "recover" ? "Recuperação de conta" : "Acesso à tua conta"}</p>
      {inlineAuth ? <h1 id="auth-inline-title" ref={authHeading} tabIndex={-1}>{titles[form!]}</h1> : null}
      <p className="form-note">{form === "password"
        ? "Escolhe uma nova palavra-passe com pelo menos 8 caracteres."
        : form === "recover"
          ? "Introduz o email associado à tua conta. Se existir, enviamos uma ligação para definires uma nova palavra-passe."
          : form === "login" ? "Entra na tua conta para aceder às carteiras guardadas." : "Cria uma conta para guardares as tuas carteiras e acederes aos dados noutros dispositivos."}</p>
      {form !== "password" && <label>Email<span className="auth-input-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg><input name="email" type="email" placeholder="nome@exemplo.pt" required autoComplete="email" maxLength={254} disabled={busy} /></span></label>}
      {form !== "recover" && <div className="auth-password-field"><label htmlFor="auth-password-input">{form === "password" ? "Nova palavra-passe" : "Palavra-passe"}</label><span className="auth-input-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input id="auth-password-input" name="password" type={showPassword ? "text" : "password"} placeholder={form === "register" ? "Mínimo de 8 caracteres" : "Palavra-passe"} required minLength={form === "login" ? 1 : 8} maxLength={128} autoComplete={form === "login" ? "current-password" : "new-password"} disabled={busy} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} disabled={busy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span></div>}
      {form === "password" && needsReauthentication && <>
        <label>Código de confirmação<input name="nonce" type="text" required inputMode="numeric" autoComplete="one-time-code" minLength={1} maxLength={128} disabled={busy} /></label>
        <button type="button" className="text-button" disabled={busy} onClick={() => void resendReauthentication()}>Enviar novo código</button>
      </>}
      {form === "login" && <button type="button" className="text-button auth-forgot" disabled={busy} onClick={() => open("recover")}>Esqueci a palavra-passe</button>}
      {form === "register" && <p className="auth-register-note"><Icon name="shield" /> Os investimentos ficam guardados na tua conta.</p>}
      {form !== "password" && CAPTCHA_SITE_KEY && <AuthCaptcha key={`${form}:${captchaAttempt}`} siteKey={CAPTCHA_SITE_KEY} onToken={receiveCaptcha} />}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="account-feedback" role="status">{message}</p>}
      <div className="account-form-actions">
        <button className="button primary" disabled={busy || (!!CAPTCHA_SITE_KEY && form !== "password" && !captchaToken)} type="submit">{busy ? "A aguardar…" : form === "recover" ? "Enviar ligação" : form === "password" ? "Guardar palavra-passe" : titles[form!]}<span aria-hidden="true">→</span></button>
      </div>
      {form === "login" ? <>
        <p className="auth-switch">Ainda não tens conta? <button type="button" className="text-button" disabled={busy} onClick={() => open("register")}>Criar conta</button></p>
        {!entered ? <><div className="entry-divider" aria-hidden="true">ou</div><button className="button secondary auth-local" type="button" disabled={busy} onClick={continueLocal}>Continuar sem sessão</button></> : null}
      </> : form === "register" ? <p className="auth-switch">Já tens conta? <button type="button" className="text-button" disabled={busy} onClick={() => open("login")}>Iniciar sessão</button></p> : null}
      {form !== "login" ? <p className="auth-security-note"><Icon name="shield" />{form === "recover" ? "Por segurança, não confirmamos se um email tem uma conta associada." : "A conta e este navegador guardam carteiras separadas. Não copiamos os teus dados automaticamente."}</p> : null}
      {form === "recover" && <button type="button" className="text-button auth-recover-back" disabled={busy} onClick={() => open("login")}><span aria-hidden="true">←</span> Voltar ao início de sessão</button>}
    </form> : null;
  return <>
    {checking ? (
      <main className="entry-page" aria-busy="true">
        <div className="entry-loading" role="status"><Icon name="shield" /> A verificar sessão…</div>
      </main>
    ) : entered ? children(identity, session ? controls : null, sidebarControls, feedback) : (
      <main className={`entry-page ${inlineAuth ? "entry-auth-active" : ""}`}>
        <div className="entry-layout">
          <section className="entry-intro" aria-labelledby="entry-hero-title">
            <div className="entry-brand"><Icon name="trend" /><span>rendimentos<span className="brand-dot">.</span></span><ThemeControl /></div>
            <div className="entry-hero">
              <p className="eyebrow">Os teus investimentos, com clareza</p>
              <h2 id="entry-hero-title" aria-label={!form ? "Bem-vindo ao Rendimentos" : undefined}>A tua carteira.<br />Uma nova perspetiva.</h2>
              <p>Reúne os investimentos, acompanha a rentabilidade e toma decisões com informação organizada.</p>
              <div className="entry-illustration" aria-hidden="true">
                <span>Uma visão completa dos teus investimentos <Icon name="trend" /></span>
                <strong>Clareza em cada decisão.</strong>
                <small>Carteiras · transações · rentabilidade</small>
                <svg className="entry-preview-chart" viewBox="0 0 460 112" fill="none">
                  <defs><linearGradient id="entry-chart-fill" x1="0" y1="0" x2="0" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#0d9a73" stopOpacity=".18"/><stop offset="1" stopColor="#0d9a73" stopOpacity="0"/></linearGradient></defs>
                  <path d="M0 25H460M0 62H460M0 99H460" stroke="#edf1f3"/>
                  <path d="M0 100 20 96 40 99 60 88 80 92 100 74 120 80 140 65 160 72 180 58 200 62 220 48 240 55 260 38 280 43 300 30 320 37 340 21 360 26 380 12 400 16 420 5 440 9 460 0V112H0Z" fill="url(#entry-chart-fill)"/>
                  <path d="M0 100 20 96 40 99 60 88 80 92 100 74 120 80 140 65 160 72 180 58 200 62 220 48 240 55 260 38 280 43 300 30 320 37 340 21 360 26 380 12 400 16 420 5 440 9 460 0" stroke="#0d9a73" strokeWidth="2.5"/>
                </svg>
              </div>
            </div>
            <p className="entry-intro-foot"><Icon name="shield" /> Conta e modo local. A escolha é tua.</p>
          </section>
          <section className={`entry-card ${inlineAuth ? "entry-auth-card" : ""}`} aria-labelledby={inlineAuth ? "auth-inline-title" : "entry-choice-title"} onKeyDown={(event) => {
            if (inlineAuth && event.key === "Escape") { event.preventDefault(); closeAuth(); }
          }}>
            {inlineAuth ? <>
              <div className="auth-inline-top"><button type="button" className="icon-button auth-inline-back" aria-label="Fechar" disabled={busy} onClick={closeAuth}><span aria-hidden="true">←</span></button><div className="auth-mobile-theme"><ThemeControl /></div></div>
              {authForm}
            </> : <>
              <p className="eyebrow">Bem-vindo ao Rendimentos</p>
              <h1 id="entry-choice-title" ref={welcomeHeading} tabIndex={-1}>Começa por aqui.</h1>
              <p className="entry-choice-intro">Escolhe como queres gerir os investimentos. Podes experimentar sem criar conta.</p>
              {controls}
              <p className="entry-footnote"><Icon name="shield" /> Sem conta, os dados ficam apenas neste navegador. Podes exportar uma cópia quando quiseres.</p>
            </>}
          </section>
        </div>
      </main>
    )}
    {form && !inlineAuth ? <Dialog title={titles[form]} className="auth-dialog" closeDisabled={busy} onClose={closeAuth}>{authForm}</Dialog> : null}
  </>;
}
