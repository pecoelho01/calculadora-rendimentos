"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { AUTH_BROWSER_MESSAGE, AUTH_BUSY_MESSAGE, AUTH_RECOVERY_CHANGED, completeBrowserAuthCallback, runBrowserAuthMutation } from "@/lib/browser-auth";
import { getRecoverySession, matchesRecoverySession, type RecoverySession } from "@/lib/recovery-session";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { ThemeControl } from "./theme-control";
import "./account.css";

export type AccountIdentity = {
  userId: string;
  email: string;
  accessToken: string;
};
const LOCAL_ENTRY_KEY = "rendimentos.entry.local.v1";

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
  children: (identity: AccountIdentity | null, controls: ReactNode) => ReactNode;
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
  const action = useRef(0);
  const authPending = useRef(false);
  const recoverySession = useRef<RecoverySession | null>(null);
  const welcomeHeading = useRef<HTMLHeadingElement>(null);

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
        setForm(recoverySession.current ? "password" : null);
        setError(recoverySession.current ? "" : AUTH_RECOVERY_CHANGED);
        setMessage("");
      }
    });
    void callbackResult.then(async (callback) => {
      const beforeRead = events;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!live) return;
      initializing = false;
      if (sessionError) {
        apply(null, false);
        setError("Não foi possível recuperar a sessão. Podes continuar no modo local ou iniciar sessão novamente.");
        return;
      }
      const restored = events === beforeRead ? data.session : latestSession;
      apply(restored, !!restored);
      if (callback.error) setError(callback.error);
      // A login in another tab after the exchange must not inherit recovery UI.
      if (matchesRecoverySession(restored, callback.recovery)) {
        recoverySession.current = callback.recovery;
        setForm("password");
      }
    }).catch(() => {
      if (!live) return;
      initializing = false;
      apply(null, false);
      setError("Não foi possível recuperar a sessão. Podes continuar no modo local.");
    });
    return () => {
      live = false;
      actions.current++;
      subscription.unsubscribe();
    };
  }, []);

  function open(next: AuthForm) {
    if (authPending.current) return;
    recoverySession.current = null;
    setForm(next);
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
    authPending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await runBrowserAuthMutation(async () => {
        const redirectTo = `${window.location.origin}/?recovery=1`;
        if (submitted === "recover") {
          const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
          const result = await supabase.auth.updateUser({ password });
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
            options: { emailRedirectTo: `${window.location.origin}/` },
          });
          if (result.error) throw result.error;
          if (task === action.current) {
            setForm(null);
            setMessage(result.data.session
              ? "Conta criada. As carteiras locais só serão copiadas se escolheres importá-las."
              : "Consulta o teu email para confirmar a conta. Depois, inicia sessão. As carteiras locais continuam neste navegador.");
          }
        } else {
          const result = await supabase.auth.signInWithPassword({ email, password });
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
    if (!checking && !entered) welcomeHeading.current?.focus();
  }, [checking, entered]);

  const controls = (
    <section className="account-controls no-print" aria-label="Conta e armazenamento">
      <div className="account-description">
        <strong>{identity ? "Carteiras da conta" : entered ? "Modo local · neste navegador" : "Escolhe onde guardar"}</strong>
        <p>{identity
          ? session?.user.email
          : "Podes guardar na conta ou continuar sem sessão. Os dois espaços são separados."}</p>
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
          <button className="button primary" disabled={busy} onClick={() => open("login")}>Iniciar sessão</button>
          <button className="button secondary" disabled={busy} onClick={() => open("register")}>Criar conta</button>
        </> : <span className="subtle">Conta indisponível: Supabase não configurado. O modo local está disponível.</span>}
        {!entered && !checking && <button className="button secondary entry-local" disabled={busy} onClick={continueLocal}>Continuar sem sessão</button>}
      </div>
      {message && <p className="account-feedback" role="status">{message}</p>}
      {error && !form && <p className="account-feedback form-error" role="alert">{error}</p>}
    </section>
  );
  return <>
    {checking ? (
      <main className="entry-page" aria-busy="true">
        <div className="entry-loading" role="status"><Icon name="shield" /> A verificar sessão…</div>
      </main>
    ) : entered ? children(identity, controls) : (
      <main className="entry-page">
        <div className="entry-layout">
          <section className="entry-intro" aria-labelledby="entry-title">
            <div className="entry-brand"><Icon name="trend" /> rendimentos.<ThemeControl /></div>
            <span className="eyebrow">O TEU PATRIMÓNIO, COM CLAREZA</span>
            <h1 id="entry-title" ref={welcomeHeading} tabIndex={-1}>Bem-vindo ao Rendimentos</h1>
            <p>Acompanha as tuas carteiras, regista transações e percebe a evolução dos teus investimentos.</p>
            <ul className="entry-features">
              <li><Icon name="wallet" /><span><strong>As tuas carteiras, no teu ritmo</strong>Compras, vendas e resultados num só lugar.</span></li>
              <li><Icon name="shield" /><span><strong>Tu escolhes onde guardar</strong>Na conta, entre dispositivos, ou apenas neste navegador.</span></li>
            </ul>
          </section>
          <section className="entry-card" aria-labelledby="entry-choice-title">
            <h2 id="entry-choice-title">Como queres continuar?</h2>
            {controls}
            <p className="entry-footnote">As carteiras do navegador só são copiadas para a conta quando o pedires. Os dados locais são mantidos.</p>
          </section>
        </div>
      </main>
    )}
    {form && <Dialog title={titles[form]} closeDisabled={busy} onClose={() => {
      if (authPending.current) return;
      recoverySession.current = null;
      action.current++;
      setForm(null);
      setError("");
    }}>
      <form onSubmit={submit} className="account-form" aria-busy={busy}>
        <p className="form-note">{form === "password"
          ? "Escolhe uma nova palavra-passe com pelo menos 8 caracteres."
          : form === "recover"
            ? "Enviaremos uma ligação para definires uma nova palavra-passe."
            : "As carteiras na conta são separadas das carteiras deste navegador. A cópia de dados locais requer uma importação explícita."}</p>
        {form !== "password" && <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} disabled={busy} /></label>}
        {form !== "recover" && <label>{form === "password" ? "Nova palavra-passe" : "Palavra-passe"}<input name="password" type="password" required minLength={form === "login" ? 1 : 8} maxLength={128} autoComplete={form === "login" ? "current-password" : "new-password"} disabled={busy} /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="account-feedback" role="status">{message}</p>}
        <div className="account-form-actions">
          {form === "login" && <button type="button" className="text-button" disabled={busy} onClick={() => open("recover")}>Esqueci a palavra-passe</button>}
          {form === "recover" && <button type="button" className="text-button" disabled={busy} onClick={() => open("login")}>Voltar ao início de sessão</button>}
          <button className="button primary" disabled={busy} type="submit">{busy ? "A aguardar…" : form === "recover" ? "Enviar ligação" : form === "password" ? "Guardar palavra-passe" : titles[form]}</button>
        </div>
      </form>
    </Dialog>}
  </>;
}
