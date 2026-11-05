"use client";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render(container: HTMLElement, options: {
    sitekey: string; size: "flexible" | "compact"; language: "pt";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
    "timeout-callback"(): void;
  }): string;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: Turnstile } }

let loading: Promise<Turnstile> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    // CSP nonces are hidden in attributes; read the DOM property instead.
    script.nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
    const timeout = window.setTimeout(() => fail(), 15_000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      loading = undefined;
      reject(new Error("Verificação de segurança indisponível."));
    }
    script.onerror = fail;
    script.onload = () => {
      if (!window.turnstile) { fail(); return; }
      window.clearTimeout(timeout);
      resolve(window.turnstile);
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Tokens are single use. The parent remounts this widget after every Auth attempt. */
export function AuthCaptcha({ siteKey, onToken }: { siteKey: string; onToken(token: string): void }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let widget: string | undefined;
    let api: Turnstile | undefined;
    const clear = () => { if (live) onToken(""); };
    const fail = () => { if (live) { onToken(""); setFailed(true); } };
    void loadTurnstile().then((loaded) => {
      if (!live || !container.current) return;
      api = loaded;
      widget = api.render(container.current, {
        sitekey: siteKey, size: container.current.clientWidth < 300 ? "compact" : "flexible", language: "pt",
        callback: (token) => { if (live) { setFailed(false); onToken(token); } },
        "expired-callback": clear, "error-callback": fail, "timeout-callback": fail,
      });
    }).catch(fail);
    return () => {
      live = false;
      if (widget !== undefined) api?.remove(widget);
    };
  }, [siteKey, onToken, attempt]);
  return <div className="auth-captcha" aria-label="Verificação de segurança">
    <div ref={container} />
    {failed && <div role="alert">
      <p>Não foi possível concluir a verificação de segurança.</p>
      <button className="text-button" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Tentar verificação novamente</button>
    </div>}
  </div>;
}
