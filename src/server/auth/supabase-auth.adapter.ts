import { validateSupabaseUrl } from "../../lib/supabase-url";
import { AuthError, type AuthErrorCode } from "./auth.errors";
import type { AuthUser, ProviderSession } from "./auth.types";

export type AuthCredentials = {
  email: string;
  password: string;
  captchaToken?: string;
};
export type AuthBackend = {
  login(input: AuthCredentials): Promise<ProviderSession>;
  register(
    input: AuthCredentials,
    redirectTo: string,
    challenge: string,
  ): Promise<ProviderSession | null>;
  recover(
    email: string,
    redirectTo: string,
    challenge: string,
    captchaToken?: string,
  ): Promise<void>;
  exchange(code: string, verifier: string): Promise<ProviderSession>;
  refresh(refreshToken: string): Promise<ProviderSession>;
  getUser(accessToken: string): Promise<AuthUser>;
  password(
    accessToken: string,
    password: string,
    nonce?: string,
  ): Promise<AuthUser>;
  reauthenticate(accessToken: string): Promise<void>;
  logout(accessToken: string): Promise<void>;
};

export function authConfiguration() {
  const url = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

function parseUser(value: unknown): AuthUser {
  if (!value || typeof value !== "object")
    throw new AuthError("unavailable", 503);
  const { id, email } = value as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof email !== "string")
    throw new AuthError("unavailable", 503);
  return { id, email };
}

function parseSession(value: unknown): ProviderSession {
  if (!value || typeof value !== "object")
    throw new AuthError("unavailable", 503);
  const data = value as Record<string, unknown>;
  const expiresIn = data.expires_in;
  const expiresAt =
    typeof data.expires_at === "number"
      ? data.expires_at
      : typeof expiresIn === "number"
        ? Math.floor(Date.now() / 1000) + expiresIn
        : NaN;
  if (
    typeof data.access_token !== "string" ||
    !data.access_token ||
    data.access_token.length > 12_000 ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token ||
    data.refresh_token.length > 2_000 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() / 1000
  )
    throw new AuthError("unavailable", 503);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    user: parseUser(data.user),
  };
}

async function providerJson(response: Response): Promise<unknown> {
  const limit = 128_000;
  if (Number(response.headers.get("content-length")) > limit)
    throw new AuthError("unavailable", 503);
  const reader = response.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AuthError("unavailable", 503);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AuthError("unavailable", 503);
  }
}

/** Request-scoped GoTrue transport. No session persistence or automatic refresh. */
export function createSupabaseAuthAdapter(
  config: { url: string; key: string },
  transport: typeof fetch = fetch,
): AuthBackend {
  const base = new URL(config.url);
  base.pathname = `${base.pathname.replace(/\/$/, "")}/auth/v1/`;

  async function send(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      token?: string;
      failure?: AuthErrorCode;
    } = {},
  ): Promise<unknown> {
    try {
      const response = await transport(new URL(path, base), {
        method: options.method ?? "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${options.token ?? config.key}`,
          "Content-Type": "application/json",
          "X-Supabase-Api-Version": "2024-01-01",
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const data = await providerJson(response);
      if (!response.ok) {
        const code =
          data && typeof data === "object"
            ? (data as Record<string, unknown>).code
            : undefined;
        if (response.status === 429) throw new AuthError("rate_limit", 429);
        if (
          code === "reauthentication_needed" ||
          code === "reauthentication_not_valid"
        )
          throw new AuthError(code, 401);
        if (response.status >= 500) throw new AuthError("unavailable", 503);
        const failure = options.failure ?? "invalid_request";
        throw new AuthError(failure, failure === "session_expired" ? 401 : 400);
      }
      return data;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError("unavailable", 503);
    }
  }

  function captcha(captchaToken?: string) {
    return captchaToken
      ? { gotrue_meta_security: { captcha_token: captchaToken } }
      : {};
  }

  return {
    async login(input) {
      return parseSession(
        await send("token?grant_type=password", {
          body: {
            email: input.email,
            password: input.password,
            ...captcha(input.captchaToken),
          },
          failure: "invalid_credentials",
        }),
      );
    },
    async register(input, redirectTo, challenge) {
      const data = await send(
        `signup?redirect_to=${encodeURIComponent(redirectTo)}`,
        {
          body: {
            email: input.email,
            password: input.password,
            code_challenge: challenge,
            code_challenge_method: "s256",
            ...captcha(input.captchaToken),
          },
        },
      );
      if (data && typeof data === "object" && "access_token" in data)
        return parseSession(data);
      parseUser(data);
      return null;
    },
    async recover(email, redirectTo, challenge, captchaToken) {
      await send(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        body: {
          email,
          code_challenge: challenge,
          code_challenge_method: "s256",
          ...captcha(captchaToken),
        },
      });
    },
    async exchange(code, verifier) {
      return parseSession(
        await send("token?grant_type=pkce", {
          body: { auth_code: code, code_verifier: verifier },
          failure: "invalid_callback",
        }),
      );
    },
    async refresh(refreshToken) {
      return parseSession(
        await send("token?grant_type=refresh_token", {
          body: { refresh_token: refreshToken },
          failure: "session_expired",
        }),
      );
    },
    async getUser(accessToken) {
      return parseUser(
        await send("user", {
          method: "GET",
          token: accessToken,
          failure: "session_expired",
        }),
      );
    },
    async password(accessToken, password, nonce) {
      return parseUser(
        await send("user", {
          method: "PUT",
          token: accessToken,
          body: { password, ...(nonce ? { nonce } : {}) },
          failure: "session_expired",
        }),
      );
    },
    async reauthenticate(accessToken) {
      await send("reauthenticate", {
        method: "GET",
        token: accessToken,
        failure: "session_expired",
      });
    },
    async logout(accessToken) {
      await send("logout?scope=local", {
        token: accessToken,
        failure: "session_expired",
      });
    },
  };
}
