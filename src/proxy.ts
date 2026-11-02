import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CALLBACK_FIELDS, AUTH_TOKEN_FIELDS } from "./lib/auth-callback-params";

export function proxy(request: NextRequest) {
  if (!AUTH_TOKEN_FIELDS.some((key) => request.nextUrl.searchParams.has(key)))
    return NextResponse.next();

  const clean = request.nextUrl.clone();
  for (const key of AUTH_CALLBACK_FIELDS) clean.searchParams.delete(key);
  // An explicit fragment replaces any fragment on the original navigation.
  // It conveys rejection only; it cannot open recovery or establish a session.
  clean.hash = "error=invalid_callback";
  const response = NextResponse.redirect(clean, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// Email confirmation and recovery both return to /. APIs and assets keep their contracts.
export const config = { matcher: "/" };
