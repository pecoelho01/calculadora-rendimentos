import { readJsonBody } from "../shared/http/read-json-body";
import { AuthError } from "./auth.errors";
import {
  assertSameOriginMutation,
  assertSessionKey,
  authJson,
  requestOrigin,
} from "./auth-request";
import { createAuthService } from "./auth.service";
import type { AuthAction } from "./auth.types";
import { validateAuthInput } from "./auth.validation";
import {
  createSessionCookies,
  sessionSecret,
  type SessionCookies,
} from "./session-cookies";
import {
  authConfiguration,
  createSupabaseAuthAdapter,
  type AuthBackend,
} from "./supabase-auth.adapter";

export type AuthDependencies = {
  secret: Buffer;
  backend: AuthBackend;
};

export function authDependencies(): AuthDependencies | null {
  const config = authConfiguration();
  const secret = sessionSecret();
  return config && secret
    ? { secret, backend: createSupabaseAuthAdapter(config) }
    : null;
}

const sessionMutations = new Set<AuthAction>([
  "logout",
  "refresh",
  "password",
  "reauthenticate",
]);

/** Thin HTTP boundary: parse, protect, invoke the use case, commit cookies. */
export function createAuthHandler(
  action: AuthAction,
  dependencies: () => AuthDependencies | null = authDependencies,
) {
  return async function handle(request: Request): Promise<Response> {
    let cookies: SessionCookies | undefined;
    let sessionRead = false;
    try {
      if (
        request.method !== "POST" &&
        !(action === "session" && request.method === "GET")
      )
        return authJson({ error: "Método não permitido." }, 405);
      if (request.method === "POST") assertSameOriginMutation(request);
      const configured = dependencies();
      if (!configured) {
        if (action === "session")
          return authJson({ configured: false, session: null });
        throw new AuthError("unavailable", 503);
      }
      cookies = createSessionCookies(request, configured.secret);
      const session = cookies.readSession();
      let input = {};
      if (request.method === "POST") {
        try {
          input = validateAuthInput(
            action,
            await readJsonBody(request, 16_384),
          );
        } catch (error) {
          if (error instanceof AuthError) throw error;
          throw new AuthError(
            "invalid_request",
            error instanceof RangeError ? 413 : 400,
          );
        }
      }
      if (session && sessionMutations.has(action))
        assertSessionKey(
          request,
          session.sessionKey,
          (input as Record<string, unknown>).sessionKey,
        );
      const outcome = await createAuthService(configured.backend).execute(
        action,
        input,
        {
          session,
          flow: cookies.readFlow(),
          origin: requestOrigin(request),
          allowRefresh: request.method === "POST",
        },
      );
      sessionRead = true;
      if (outcome.storedSession) cookies.writeSession(outcome.storedSession);
      if (outcome.flow) cookies.writeFlow(outcome.flow);
      if (outcome.clearSession) cookies.clearSession();
      if (outcome.clearFlow) cookies.clearFlow();
      const response = outcome.error
        ? authJson(
            {
              error: outcome.error.message,
              code: outcome.error.code,
              session: outcome.session,
            },
            outcome.error.status,
          )
        : authJson({ configured: true, session: outcome.session });
      return cookies.apply(response);
    } catch (failure) {
      const error =
        failure instanceof AuthError
          ? failure
          : new AuthError("unavailable", 503);
      // Only a serialized browser restore may discard invalid credentials. GET
      // and rejected mutations must never overwrite another operation's cookies.
      if (
        action === "session" &&
        request.method === "POST" &&
        error.code === "session_expired"
      )
        cookies?.clearSession();
      const response = authJson(
        { error: error.message, code: error.code },
        error.status,
      );
      return cookies && (sessionRead || action === "session")
        ? cookies.apply(response)
        : response;
    }
  };
}
