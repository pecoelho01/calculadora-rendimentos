export type AuthUser = { id: string; email: string };

/** Safe to expose to the interface. Credentials remain in the encrypted cookie. */
export type PublicAuthSession = {
  user: AuthUser;
  sessionKey: string;
  recovery: boolean;
};

export type StoredAuthSession = PublicAuthSession & {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type PkceFlow = {
  verifier: string;
  intent: "register" | "recover";
  expiresAt: number;
};

export type ProviderSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
};

export type AuthAction =
  | "login"
  | "logout"
  | "session"
  | "refresh"
  | "register"
  | "recover"
  | "password"
  | "reauthenticate"
  | "callback";

export type AuthInput = Record<string, unknown>;

export type AuthResult = {
  configured: boolean;
  session: PublicAuthSession | null;
};

export function publicSession(session: StoredAuthSession): PublicAuthSession {
  return {
    user: session.user,
    sessionKey: session.sessionKey,
    recovery: session.recovery,
  };
}
