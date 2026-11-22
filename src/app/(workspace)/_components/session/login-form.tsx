import type { FormEvent, RefObject } from "react";
import { LoginCaptcha } from "./login-captcha";
import { Icon } from "@/components/icon";
import type { AuthFormKind, AuthViewState } from "./session-types";

export const loginFormTitles: Record<AuthFormKind, string> = {
  login: "Iniciar sessão",
  register: "Criar conta",
  recover: "Recuperar acesso",
  password: "Definir nova palavra-passe",
};

const formContent: Record<
  AuthFormKind,
  { eyebrow: string; note: string; submit: string }
> = {
  login: {
    eyebrow: "Bem-vindo de volta",
    note: "Entra na tua conta para aceder às carteiras guardadas.",
    submit: "Iniciar sessão",
  },
  register: {
    eyebrow: "Começa a investir com clareza",
    note: "Cria uma conta para guardares as tuas carteiras e acederes aos dados noutros dispositivos.",
    submit: "Criar conta",
  },
  recover: {
    eyebrow: "Recuperação de conta",
    note: "Introduz o email associado à tua conta. Se existir, enviamos uma ligação para definires uma nova palavra-passe.",
    submit: "Enviar ligação",
  },
  password: {
    eyebrow: "Acesso à tua conta",
    note: "Escolhe uma nova palavra-passe com pelo menos 8 caracteres.",
    submit: "Guardar palavra-passe",
  },
};

type AuthFormProps = {
  view: AuthViewState & { form: AuthFormKind };
  inlineAuth: boolean;
  entered: boolean;
  busy: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  showPassword: boolean;
  captcha: { siteKey: string; token: string; attempt: number };
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTogglePassword: () => void;
  onResendReauthentication: () => Promise<void>;
  onOpenForm: (kind: AuthFormKind) => void;
  onContinueLocal: () => void;
  onCaptchaToken: (token: string) => void;
};

export function LoginForm({
  view,
  inlineAuth,
  entered,
  busy,
  headingRef,
  showPassword,
  captcha,
  onSubmit,
  onTogglePassword,
  onResendReauthentication,
  onOpenForm,
  onContinueLocal,
  onCaptchaToken,
}: AuthFormProps) {
  const { form, error, message, needsReauthentication } = view;
  const content = formContent[form];
  const submitLabel = busy ? "A aguardar…" : content.submit;

  return (
    <form
      onSubmit={onSubmit}
      className={`account-form ${inlineAuth ? "auth-inline-form" : ""}`}
      aria-busy={busy}
    >
      <p className="eyebrow auth-eyebrow">{content.eyebrow}</p>
      {inlineAuth ? (
        <h1
          id="auth-inline-title"
          ref={headingRef}
          tabIndex={-1}
        >
          {loginFormTitles[form]}
        </h1>
      ) : null}
      <p className="form-note">{content.note}</p>
      {form !== "password" && (
        <label>
          Email
          <span className="auth-input-wrap">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="3"
              />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <input
              name="email"
              type="email"
              placeholder="nome@exemplo.pt"
              required
              autoComplete="email"
              maxLength={254}
              disabled={busy}
            />
          </span>
        </label>
      )}
      {form !== "recover" && (
        <div className="auth-password-field">
          <label htmlFor="auth-password-input">
            {form === "password" ? "Nova palavra-passe" : "Palavra-passe"}
          </label>
          <span className="auth-input-wrap">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect
                x="5"
                y="10"
                width="14"
                height="11"
                rx="2"
              />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="auth-password-input"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={
                form === "register" ? "Mínimo de 8 caracteres" : "Palavra-passe"
              }
              required
              minLength={form === "login" ? 1 : 8}
              maxLength={128}
              autoComplete={
                form === "login" ? "current-password" : "new-password"
              }
              disabled={busy}
            />
            <button
              type="button"
              className="auth-password-toggle"
              aria-label={
                showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"
              }
              aria-pressed={showPassword}
              onClick={onTogglePassword}
              disabled={busy}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                />
              </svg>
            </button>
          </span>
        </div>
      )}
      {form === "password" && needsReauthentication && (
        <>
          <label>
            Código de confirmação
            <input
              name="nonce"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              minLength={1}
              maxLength={128}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void onResendReauthentication()}
          >
            Enviar novo código
          </button>
        </>
      )}
      {form === "login" && (
        <button
          type="button"
          className="text-button auth-forgot"
          disabled={busy}
          onClick={() => onOpenForm("recover")}
        >
          Esqueci a palavra-passe
        </button>
      )}
      {form === "register" && (
        <p className="auth-register-note">
          <Icon name="shield" /> Os investimentos ficam guardados na tua conta.
        </p>
      )}
      {form !== "password" && captcha.siteKey && (
        <LoginCaptcha
          key={`${form}:${captcha.attempt}`}
          siteKey={captcha.siteKey}
          onToken={onCaptchaToken}
        />
      )}
      {error && (
        <p
          className="form-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          className="account-feedback"
          role="status"
        >
          {message}
        </p>
      )}
      <div className="account-form-actions">
        <button
          className="button primary"
          disabled={
            busy || (!!captcha.siteKey && form !== "password" && !captcha.token)
          }
          type="submit"
        >
          {submitLabel}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {form === "login" ? (
        <>
          <p className="auth-switch">
            Ainda não tens conta?{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => onOpenForm("register")}
            >
              Criar conta
            </button>
          </p>
          {!entered ? (
            <>
              <div
                className="entry-divider"
                aria-hidden="true"
              >
                ou
              </div>
              <button
                className="button secondary auth-local"
                type="button"
                disabled={busy}
                onClick={onContinueLocal}
              >
                Continuar sem sessão
              </button>
            </>
          ) : null}
        </>
      ) : form === "register" ? (
        <p className="auth-switch">
          Já tens conta?{" "}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => onOpenForm("login")}
          >
            Iniciar sessão
          </button>
        </p>
      ) : null}
      {form !== "login" ? (
        <p className="auth-security-note">
          <Icon name="shield" />
          {form === "recover"
            ? "Por segurança, não confirmamos se um email tem uma conta associada."
            : "A conta e este navegador guardam carteiras separadas. Não copiamos os teus dados automaticamente."}
        </p>
      ) : null}
      {form === "recover" && (
        <button
          type="button"
          className="text-button auth-recover-back"
          disabled={busy}
          onClick={() => onOpenForm("login")}
        >
          <span aria-hidden="true">←</span> Voltar ao início de sessão
        </button>
      )}
    </form>
  );
}
