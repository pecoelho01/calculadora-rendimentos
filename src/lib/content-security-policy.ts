import { validateSupabaseUrl } from "./supabase-url";

/** Only public service origins belong here; never interpolate arbitrary request headers. */
export function contentSecurityPolicy(nonce: string, options: {
  supabaseUrl?: string;
  captcha: boolean;
  development: boolean;
}) {
  const supabase = validateSupabaseUrl(options.supabaseUrl);
  const authOrigin = supabase ? ` ${new URL(supabase).origin}` : "";
  const challengeOrigin = options.captcha ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${challengeOrigin}${options.development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Charts and progress indicators use React style attributes. Scripts remain nonce-only.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data:",
    `connect-src 'self'${authOrigin}${challengeOrigin}${options.development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    `frame-src${challengeOrigin || " 'none'"}`,
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
