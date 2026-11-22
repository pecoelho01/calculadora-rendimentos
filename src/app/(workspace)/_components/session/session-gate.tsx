"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "@/components/dialog";
import { RETURN_PARAM } from "../workspace-routes";
import { WelcomeScreen } from "./welcome-screen";
import { AccountFeedbackMessage } from "./account-feedback-message";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { StorageModeSwitch } from "./storage-mode-switch";
import { LoginForm, loginFormTitles } from "./login-form";
import { useAccountSession } from "./use-account-session";
import { useLoginActions } from "./use-login-actions";
import type { AccountIdentity } from "./session-types";
import { useAccountPreferenceSync } from "./use-account-preference-sync";
import "./session.css";

export type { AccountIdentity } from "./session-types";

/** Session state and account controls shared with the workspace routes. */
export type WorkspaceSession = {
  identity: AccountIdentity | null;
  accountControls: ReactNode;
  sidebarAccountControls: ReactNode;
  accountFeedback: ReactNode;
};

const SessionContext = createContext<WorkspaceSession | null>(null);

export function useWorkspaceSession(): WorkspaceSession {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error(
      "useWorkspaceSession tem de ser usado dentro de SessionGate.",
    );
  }
  return session;
}

/**
 * Sends visitors who have not chosen a storage mode to the entry page `/`,
 * remembering the link they opened so they return to it after entering.
 */
function useEntryPageRedirect(checking: boolean, entered: boolean) {
  const pathname = usePathname();
  const router = useRouter();
  const hasEnteredBeforeRef = useRef(false);
  const isEntryPage = pathname === "/";

  useEffect(
    function sendToEntryPage() {
      if (entered) {
        hasEnteredBeforeRef.current = true;
        return;
      }
      if (checking || isEntryPage) return;

      // After a logout the previous page belongs to the old mode: start over.
      if (hasEnteredBeforeRef.current) {
        router.replace("/");
        return;
      }

      const returnPath = `${pathname}${window.location.search}`;
      router.replace(`/?${RETURN_PARAM}=${encodeURIComponent(returnPath)}`);
    },
    [checking, entered, isEntryPage, pathname, router],
  );

  return { isEntryPage };
}

/** Shows the entry page until the visitor enters, then the workspace. */
export function SessionGate({ children }: { children: ReactNode }) {
  const account = useAccountSession();
  const actions = useLoginActions(account);
  const {
    session,
    accountMode,
    checking,
    configured,
    identity,
    entered,
    authView,
  } = account;
  const { form, error, message } = authView;
  const welcomeHeading = useRef<HTMLHeadingElement>(null);
  const authHeading = useRef<HTMLHeadingElement>(null);
  const inlineAuth = !entered && form !== null && form !== "password";
  const { isEntryPage } = useEntryPageRedirect(checking, entered);
  const { preferenceError, dismissPreferenceError, unsupportedVersion } =
    useAccountPreferenceSync({
      session,
      identity,
      checking,
    });

  useEffect(() => {
    if (!checking && !entered && !form)
      welcomeHeading.current?.focus({ preventScroll: true });
  }, [checking, entered, form]);

  useEffect(() => {
    if (!entered && form && form !== "password")
      authHeading.current?.focus({ preventScroll: true });
  }, [entered, form]);

  const feedback = (
    <>
      <AccountFeedbackMessage
        message={message}
        error={error}
        hasForm={form !== null}
      />
      {preferenceError ? (
        <p
          role="alert"
          className="notice"
        >
          {preferenceError}
          <button
            type="button"
            onClick={dismissPreferenceError}
          >
            Fechar aviso
          </button>
        </p>
      ) : null}
      {unsupportedVersion ? (
        <p
          className="notice"
          role="status"
        >
          As preferências da conta foram guardadas por uma versão mais recente
          da aplicação. São usados os valores por omissão e não serão alteradas.
        </p>
      ) : null}
    </>
  );
  const sidebarControls = (
    <SidebarAccountMenu
      hasSession={session !== null}
      configured={configured}
      busy={actions.busy}
      onLogout={actions.logout}
      onOpenForm={actions.openForm}
    />
  );
  const controls = (
    <StorageModeSwitch
      entered={entered}
      checking={checking}
      configured={configured}
      hasSession={session !== null}
      email={session?.user.email}
      accountMode={accountMode}
      busy={actions.busy}
      onToggleMode={actions.toggleMode}
      onLogout={actions.logout}
      onOpenForm={actions.openForm}
      onContinueLocal={actions.continueLocal}
      feedback={feedback}
    />
  );
  const authForm = form ? (
    <LoginForm
      view={{ ...authView, form }}
      inlineAuth={inlineAuth}
      entered={entered}
      busy={actions.busy}
      headingRef={authHeading}
      showPassword={actions.showPassword}
      captcha={actions.captcha}
      onSubmit={actions.submit}
      onTogglePassword={actions.togglePassword}
      onResendReauthentication={actions.resendReauthentication}
      onOpenForm={actions.openForm}
      onContinueLocal={actions.continueLocal}
      onCaptchaToken={actions.receiveCaptcha}
    />
  ) : null;

  return (
    <>
      {entered ? (
        <SessionContext.Provider
          value={{
            identity,
            accountControls: session ? controls : null,
            sidebarAccountControls: sidebarControls,
            accountFeedback: feedback,
          }}
        >
          {/* Remount the workspace when the identity changes so no portfolio state leaks between modes. */}
          <Fragment key={identity?.userId ?? "local"}>{children}</Fragment>
        </SessionContext.Provider>
      ) : (
        <WelcomeScreen
          // Other pages only show the session check while redirecting to `/`.
          checking={checking || !isEntryPage}
          inlineAuth={inlineAuth}
          hasForm={form !== null}
          busy={actions.busy}
          controls={controls}
          authForm={authForm}
          welcomeHeading={welcomeHeading}
          onCloseAuth={actions.closeAuth}
        />
      )}
      {form && !inlineAuth ? (
        <Dialog
          title={loginFormTitles[form]}
          className="auth-dialog"
          closeDisabled={actions.busy}
          onClose={actions.closeAuth}
        >
          {authForm}
        </Dialog>
      ) : null}
    </>
  );
}
