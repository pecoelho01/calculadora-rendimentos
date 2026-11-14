import { AuthError } from "./auth.errors";

/** Next may normalize the internal URL to localhost. Host is the HTTP authority
 * addressed by the browser; never use a caller-supplied X-Forwarded-Host here. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return url.origin;
  if (!/^[a-zA-Z0-9.\[\]:-]+$/.test(host))
    throw new AuthError("invalid_request", 403);
  try {
    return new URL(`${url.protocol}//${host}`).origin;
  } catch {
    throw new AuthError("invalid_request", 403);
  }
}

/** Custom header plus exact Origin closes both form and cross-origin JSON CSRF. */
export function assertSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (
    origin !== requestOrigin(request) ||
    (site !== null && site !== "same-origin") ||
    request.headers.get("x-requested-with") !== "rendimentos" ||
    contentType !== "application/json"
  )
    throw new AuthError("invalid_request", 403);
}

export function assertSessionKey(
  request: Request,
  expected: string,
  supplied?: unknown,
) {
  const key = request.headers.get("x-account-session") ?? supplied;
  if (key !== expected) throw new AuthError("session_changed", 409);
}

export function authJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      Vary: "Cookie",
      "Referrer-Policy": "no-referrer",
    },
  });
}
