import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuthError } from "./auth.errors";
import {
  publicSession,
  type AuthAction,
  type AuthInput,
  type PkceFlow,
  type ProviderSession,
  type PublicAuthSession,
  type StoredAuthSession,
} from "./auth.types";
import type { AuthBackend } from "./supabase-auth.adapter";

export type AuthOutcome = {
  session: PublicAuthSession | null;
  storedSession?: StoredAuthSession;
  flow?: PkceFlow;
  clearSession?: boolean;
  clearFlow?: boolean;
  error?: AuthError;
};

function providerSessionId(session: ProviderSession): string {
  try {
    const parts = session.accessToken.split(".");
    if (parts.length !== 3) throw new Error("JWT inválido.");
    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      claims.sub !== session.user.id ||
      typeof claims.session_id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        claims.session_id,
      )
    )
      throw new Error("Sessão inválida.");
    return claims.session_id.toLowerCase();
  } catch {
    throw new AuthError("unavailable", 503);
  }
}

function newSession(
  session: ProviderSession,
  recovery = false,
): StoredAuthSession {
  providerSessionId(session);
  return { ...session, sessionKey: randomUUID(), recovery };
}

/** Identity and session operations; HTTP and cookie serialization stay outside. */
export function createAuthService(backend: AuthBackend) {
  async function restore(
    session: StoredAuthSession,
    allowRefresh: boolean,
    forceRefresh = false,
  ) {
    const needsRefresh =
      forceRefresh || session.expiresAt <= Math.floor(Date.now() / 1000) + 60;
    if (needsRefresh && allowRefresh) {
      const refreshed = await backend.refresh(session.refreshToken);
      if (
        refreshed.user.id !== session.user.id ||
        providerSessionId(refreshed) !== providerSessionId(session)
      )
        throw new AuthError("session_changed", 409);
      return { ...session, ...refreshed };
    }
    if (session.expiresAt <= Date.now() / 1000)
      throw new AuthError("session_expired", 401);
    const user = await backend.getUser(session.accessToken);
    if (user.id !== session.user.id)
      throw new AuthError("session_changed", 409);
    return { ...session, user };
  }

  return {
    async execute(
      action: AuthAction,
      input: AuthInput,
      context: {
        session: StoredAuthSession | null;
        flow: PkceFlow | null;
        origin: string;
        allowRefresh: boolean;
      },
    ): Promise<AuthOutcome> {
      const { session, flow, origin, allowRefresh } = context;
      if (action === "login") {
        const authenticated = await backend.login({
          email: input.email as string,
          password: input.password as string,
          captchaToken: input.captchaToken as string | undefined,
        });
        const storedSession = newSession(authenticated);
        return {
          session: publicSession(storedSession),
          storedSession,
          clearFlow: true,
        };
      }
      if (action === "register" || action === "recover") {
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256")
          .update(verifier)
          .digest("base64url");
        const pending: PkceFlow = {
          verifier,
          intent: action,
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        };
        if (action === "recover") {
          await backend.recover(
            input.email as string,
            `${origin}/?recovery=1`,
            challenge,
            input.captchaToken as string | undefined,
          );
          return { session: null, flow: pending };
        }
        const registered = await backend.register(
          {
            email: input.email as string,
            password: input.password as string,
            captchaToken: input.captchaToken as string | undefined,
          },
          `${origin}/`,
          challenge,
        );
        if (!registered) return { session: null, flow: pending };
        const storedSession = newSession(registered);
        return {
          session: publicSession(storedSession),
          storedSession,
          clearFlow: true,
        };
      }
      if (action === "callback") {
        if (!flow) throw new AuthError("invalid_callback");
        const exchanged = await backend.exchange(
          input.code as string,
          flow.verifier,
        );
        const storedSession = newSession(exchanged, flow.intent === "recover");
        return {
          session: publicSession(storedSession),
          storedSession,
          clearFlow: true,
        };
      }
      if (action === "logout") {
        let error: AuthError | undefined;
        if (session) {
          try {
            const current =
              session.expiresAt <= Math.floor(Date.now() / 1000) + 60
                ? await restore(session, true)
                : session;
            await backend.logout(current.accessToken);
          } catch (failure) {
            error =
              failure instanceof AuthError
                ? failure
                : new AuthError("unavailable", 503);
          }
        }
        return { session: null, clearSession: true, clearFlow: true, error };
      }
      if (!session) {
        if (action === "session") return { session: null };
        throw new AuthError("session_expired", 401);
      }
      if (action === "session" || action === "refresh") {
        const restored = await restore(
          session,
          allowRefresh,
          action === "refresh",
        );
        return {
          session: publicSession(restored),
          ...(allowRefresh && restored.accessToken !== session.accessToken
            ? { storedSession: restored }
            : {}),
        };
      }
      if (!session.recovery) throw new AuthError("session_changed", 409);
      // The UI may have checked earlier. Recheck under the current cookie before
      // sending password/reauth requests, keeping the operation bound to this session.
      const current = await restore(session, true);
      if (action === "reauthenticate") {
        let error: AuthError | undefined;
        try {
          await backend.reauthenticate(current.accessToken);
        } catch (failure) {
          error =
            failure instanceof AuthError
              ? failure
              : new AuthError("unavailable", 503);
        }
        return {
          session: publicSession(current),
          ...(current.accessToken !== session.accessToken
            ? { storedSession: current }
            : {}),
          error,
        };
      }
      let user;
      try {
        user = await backend.password(
          current.accessToken,
          input.password as string,
          input.nonce as string | undefined,
        );
      } catch (failure) {
        // A refresh may already have rotated the refresh token. Commit it even
        // when the following password operation asks for reauthentication.
        const error =
          failure instanceof AuthError
            ? failure
            : new AuthError("unavailable", 503);
        return {
          session: publicSession(current),
          ...(current.accessToken !== session.accessToken
            ? { storedSession: current }
            : {}),
          error,
        };
      }
      if (user.id !== current.user.id)
        throw new AuthError("session_changed", 409);
      const storedSession = { ...current, user, recovery: false };
      return { session: publicSession(storedSession), storedSession };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
