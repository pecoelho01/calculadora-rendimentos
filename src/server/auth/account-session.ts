import { authDependencies, type AuthDependencies } from "./auth.controller";
import { AuthError } from "./auth.errors";
import {
  assertSameOriginMutation,
  assertSessionKey,
  authJson,
} from "./auth-request";
import { createSessionCookies } from "./session-cookies";

/** Adapt cookie authentication to the existing account controller and RLS. */
export function createCookieAccountHandler(
  handle: (request: Request) => Promise<Response>,
  dependencies: () => AuthDependencies | null = authDependencies,
) {
  return async function handleCookieAccount(request: Request) {
    try {
      if (request.method === "POST") assertSameOriginMutation(request);
      if (!request.headers.get("cookie"))
        return authJson(
          { error: "A sessão expirou. Inicia sessão novamente." },
          401,
        );
      const configured = dependencies();
      if (!configured)
        return authJson(
          { error: "O modo de conta não está configurado." },
          503,
        );
      const session = createSessionCookies(
        request,
        configured.secret,
      ).readSession();
      if (!session || session.expiresAt <= Date.now() / 1000)
        return authJson(
          { error: "A sessão expirou. Inicia sessão novamente." },
          401,
        );
      assertSessionKey(request, session.sessionKey);
      // Never accept a bearer supplied by the browser. The existing controller
      // still verifies the cookie's JWT with Auth before forwarding it to RLS.
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${session.accessToken}`);
      const response = await handle(new Request(request, { headers }));
      response.headers.set("Vary", "Cookie");
      response.headers.set("CDN-Cache-Control", "no-store");
      response.headers.set("Vercel-CDN-Cache-Control", "no-store");
      return response;
    } catch (failure) {
      const error =
        failure instanceof AuthError
          ? failure
          : new AuthError("unavailable", 503);
      return authJson({ error: error.message, code: error.code }, error.status);
    }
  };
}
