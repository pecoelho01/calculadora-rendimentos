import type { RefObject } from "react";
import type { RecoverySession } from "@/lib/auth/recovery-session";

export type AccountIdentity = {
  userId: string;
  email: string;
  accessToken: string;
};

export type AuthFormKind = "login" | "register" | "recover" | "password";

export type AuthViewState = {
  form: AuthFormKind | null;
  error: string;
  message: string;
  needsReauthentication: boolean;
};

/** Session events and foreground actions must share these synchronous guards. */
export type AuthRuntime = {
  actionSequence: RefObject<number>;
  pending: RefObject<boolean>;
  recoverySession: RefObject<RecoverySession | null>;
};
