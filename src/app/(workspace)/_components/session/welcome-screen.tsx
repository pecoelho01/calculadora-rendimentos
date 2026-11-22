import type { ReactNode, RefObject } from "react";
import { Icon } from "@/components/icon";
import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";

type WelcomeScreenProps = {
  checking: boolean;
  inlineAuth: boolean;
  hasForm: boolean;
  busy: boolean;
  controls: ReactNode;
  authForm: ReactNode;
  welcomeHeading: RefObject<HTMLHeadingElement | null>;
  onCloseAuth: () => void;
};

export function WelcomeScreen({
  checking,
  inlineAuth,
  hasForm,
  busy,
  controls,
  authForm,
  welcomeHeading,
  onCloseAuth,
}: WelcomeScreenProps) {
  if (checking) {
    return (
      <main
        className="entry-page"
        aria-busy="true"
      >
        <div
          className="entry-loading"
          role="status"
        >
          <Icon name="shield" /> A verificar sessão…
        </div>
      </main>
    );
  }

  return (
    <main className={`entry-page ${inlineAuth ? "entry-auth-active" : ""}`}>
      <div className="entry-layout">
        <section
          className="entry-intro"
          aria-labelledby="entry-hero-title"
        >
          <div className="entry-brand">
            <Icon name="trend" />
            <span>
              rendimentos<span className="brand-dot">.</span>
            </span>
            <ThemeToggleButton />
          </div>
          <div className="entry-hero">
            <p className="eyebrow">Os teus investimentos, com clareza</p>
            <h2
              id="entry-hero-title"
              aria-label={!hasForm ? "Bem-vindo ao Rendimentos" : undefined}
            >
              A tua carteira.
              <br />
              Uma nova perspetiva.
            </h2>
            <p>
              Reúne os investimentos, acompanha a rentabilidade e toma decisões
              com informação organizada.
            </p>
            <div
              className="entry-illustration"
              aria-hidden="true"
            >
              <span>
                Uma visão completa dos teus investimentos <Icon name="trend" />
              </span>
              <strong>Clareza em cada decisão.</strong>
              <small>Carteiras · transações · rentabilidade</small>
              <svg
                className="entry-preview-chart"
                viewBox="0 0 460 112"
                fill="none"
              >
                <defs>
                  <linearGradient
                    id="entry-chart-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="112"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop
                      stopColor="#0d9a73"
                      stopOpacity=".18"
                    />
                    <stop
                      offset="1"
                      stopColor="#0d9a73"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>
                <path
                  d="M0 25H460M0 62H460M0 99H460"
                  stroke="#edf1f3"
                />
                <path
                  d="M0 100 20 96 40 99 60 88 80 92 100 74 120 80 140 65 160 72 180 58 200 62 220 48 240 55 260 38 280 43 300 30 320 37 340 21 360 26 380 12 400 16 420 5 440 9 460 0V112H0Z"
                  fill="url(#entry-chart-fill)"
                />
                <path
                  d="M0 100 20 96 40 99 60 88 80 92 100 74 120 80 140 65 160 72 180 58 200 62 220 48 240 55 260 38 280 43 300 30 320 37 340 21 360 26 380 12 400 16 420 5 440 9 460 0"
                  stroke="#0d9a73"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
          </div>
          <p className="entry-intro-foot">
            <Icon name="shield" /> Conta e modo local. A escolha é tua.
          </p>
        </section>
        <section
          className={`entry-card ${inlineAuth ? "entry-auth-card" : ""}`}
          aria-labelledby={
            inlineAuth ? "auth-inline-title" : "entry-choice-title"
          }
          onKeyDown={(event) => {
            if (inlineAuth && event.key === "Escape") {
              event.preventDefault();
              onCloseAuth();
            }
          }}
        >
          {inlineAuth ? (
            <>
              <div className="auth-inline-top">
                <button
                  type="button"
                  className="icon-button auth-inline-back"
                  aria-label="Fechar"
                  disabled={busy}
                  onClick={onCloseAuth}
                >
                  <span aria-hidden="true">←</span>
                </button>
                <div className="auth-mobile-theme">
                  <ThemeToggleButton />
                </div>
              </div>
              {authForm}
            </>
          ) : (
            <>
              <p className="eyebrow">Bem-vindo ao Rendimentos</p>
              <h1
                id="entry-choice-title"
                ref={welcomeHeading}
                tabIndex={-1}
              >
                Começa por aqui.
              </h1>
              <p className="entry-choice-intro">
                Escolhe como queres gerir os investimentos. Podes experimentar
                sem criar conta.
              </p>
              {controls}
              <p className="entry-footnote">
                <Icon name="shield" /> Sem conta, os dados ficam apenas neste
                navegador. Podes exportar uma cópia quando quiseres.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
