import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CALLBACK_FIELDS, AUTH_TOKEN_FIELDS } from "./lib/auth-callback-params";
import { contentSecurityPolicy } from "./lib/content-security-policy";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    captcha: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    development: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  // Replace caller-supplied values before Next extracts the script nonce.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  let response: NextResponse;
  if (AUTH_TOKEN_FIELDS.some((key) => request.nextUrl.searchParams.has(key))) {
    const clean = request.nextUrl.clone();
    for (const key of AUTH_CALLBACK_FIELDS) clean.searchParams.delete(key);
    // An explicit fragment replaces any fragment on the original navigation.
    // It conveys rejection only; it cannot open recovery or establish a session.
    clean.hash = "error=invalid_callback";
    response = NextResponse.redirect(clean, 303);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// All rendered documents need a fresh nonce, including the not-found page.
export const config = {
  matcher: "/((?!api(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|icon\\.svg$|modelo_site_ativos\\.csv$|sample_combo\\.csv$).*)",
};
