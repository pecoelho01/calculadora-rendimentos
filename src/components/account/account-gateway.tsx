"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Dialog } from "../shared/dialog";
import { AccountEntry } from "./account-entry";
import {
  AccountControls,
  AccountFeedback,
  SidebarAccountControls,
} from "./account-controls";
import { AuthForm, authFormTitles } from "./auth-form";
import { useAccountSession } from "./use-account-session";
import { useAuthActions } from "./use-auth-actions";
import type { AccountIdentity } from "./account-types";
import "./account.css";

export type { AccountIdentity } from "./account-types";

type AccountGatewayProps = {
  children: (
    identity: AccountIdentity | null,
    controls: ReactNode,
    sidebarControls: ReactNode,
    feedback: ReactNode,
  ) => ReactNode;
};

export function AccountGateway({ children }: AccountGatewayProps) {
  const account = useAccountSession();
  const actions = useAuthActions(account);
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

  useEffect(() => {
    if (!checking && !entered && !form)
      welcomeHeading.current?.focus({ preventScroll: true });
  }, [checking, entered, form]);

  useEffect(() => {
    if (!entered && form && form !== "password")
      authHeading.current?.focus({ preventScroll: true });
  }, [entered, form]);

  const feedback = (
    <AccountFeedback
      message={message}
      error={error}
      hasForm={form !== null}
    />
  );
  const sidebarControls = (
    <SidebarAccountControls
      hasSession={session !== null}
      configured={configured}
      busy={actions.busy}
      onLogout={actions.logout}
      onOpenForm={actions.openForm}
    />
  );
  const controls = (
    <AccountControls
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
    <AuthForm
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
        children(identity, session ? controls : null, sidebarControls, feedback)
      ) : (
        <AccountEntry
          checking={checking}
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
          title={authFormTitles[form]}
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
