import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requestOrigin } from "./auth-request";
import { AuthError } from "./auth.errors";
import type { PkceFlow, StoredAuthSession } from "./auth.types";

const CHUNK_SIZE = 3_000;
const MAX_CHUNKS = 4;
const SESSION_AGE = 30 * 24 * 60 * 60;
const FLOW_AGE = 10 * 60;
type CookieKind = "session" | "pkce";

export function sessionSecret(value = process.env.AUTH_SESSION_SECRET) {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const secret = Buffer.from(value, "base64");
  return secret.length === 32 ? secret : null;
}

function cookieName(request: Request, kind: CookieKind) {
  const secure = new URL(requestOrigin(request)).protocol === "https:";
  return `${secure ? "__Host-" : ""}rendimentos-${kind}`;
}

function cookieValues(request: Request): Map<string, string> {
  const values = new Map<string, string>();
  for (const item of (request.headers.get("cookie") ?? "").split(";")) {
    const equals = item.indexOf("=");
    if (equals < 0) continue;
    const name = item.slice(0, equals).trim();
    // Duplicate names can hide cookie shadowing. Reject the entire record.
    if (values.has(name)) throw new Error("Cookie duplicado.");
    values.set(name, item.slice(equals + 1).trim());
  }
  return values;
}

export function createSessionCookies(request: Request, secret: Buffer) {
  const changes: string[] = [];
  const url = new URL(requestOrigin(request));
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
  const secure = url.protocol === "https:";
  if (!secure && !(url.protocol === "http:" && loopback))
    throw new AuthError("unavailable", 503);
  const attributes = `; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

  function seal(kind: CookieKind, value: unknown, maxAge: number) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", secret, iv);
    cipher.setAAD(Buffer.from(`rendimentos.auth.v1.${kind}`));
    const payload = JSON.stringify({
      value,
      validUntil: Math.floor(Date.now() / 1000) + maxAge,
    });
    const ciphertext = Buffer.concat([
      cipher.update(payload, "utf8"),
      cipher.final(),
    ]);
    const encrypted = Buffer.concat([
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64url");
    if (encrypted.length > CHUNK_SIZE * MAX_CHUNKS)
      throw new AuthError("unavailable", 503);
    return encrypted;
  }

  function read(kind: CookieKind): unknown {
    try {
      const values = cookieValues(request);
      const name = cookieName(request, kind);
      const countText = values.get(name);
      if (!countText || !/^[1-4]$/.test(countText)) return null;
      const count = Number(countText);
      let encoded = "";
      for (let index = 0; index < count; index++) {
        const chunk = values.get(`${name}.${index}`);
        if (
          !chunk ||
          chunk.length > CHUNK_SIZE ||
          !/^[A-Za-z0-9_-]+$/.test(chunk)
        )
          return null;
        encoded += chunk;
      }
      const encrypted = Buffer.from(encoded, "base64url");
      if (encrypted.length < 29) return null;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        secret,
        encrypted.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(`rendimentos.auth.v1.${kind}`));
      decipher.setAuthTag(encrypted.subarray(12, 28));
      const clear = Buffer.concat([
        decipher.update(encrypted.subarray(28)),
        decipher.final(),
      ]);
      const envelope: unknown = JSON.parse(clear.toString("utf8"));
      if (!envelope || typeof envelope !== "object") return null;
      const { validUntil, value } = envelope as Record<string, unknown>;
      if (typeof validUntil !== "number" || validUntil <= Date.now() / 1000)
        return null;
      return value;
    } catch {
      return null;
    }
  }

  function write(kind: CookieKind, value: unknown, maxAge: number) {
    // Complete encryption and size checks before changing any response cookie.
    const encrypted = seal(kind, value, maxAge);
    const name = cookieName(request, kind);
    const count = Math.ceil(encrypted.length / CHUNK_SIZE);
    changes.push(`${name}=${count}; Max-Age=${maxAge}${attributes}`);
    for (let index = 0; index < MAX_CHUNKS; index++) {
      const chunk = encrypted.slice(
        index * CHUNK_SIZE,
        (index + 1) * CHUNK_SIZE,
      );
      changes.push(
        `${name}.${index}=${chunk}; Max-Age=${chunk ? maxAge : 0}${attributes}`,
      );
    }
  }

  function clear(kind: CookieKind) {
    const name = cookieName(request, kind);
    changes.push(`${name}=; Max-Age=0${attributes}`);
    for (let index = 0; index < MAX_CHUNKS; index++)
      changes.push(`${name}.${index}=; Max-Age=0${attributes}`);
  }

  return {
    readSession(): StoredAuthSession | null {
      const value = read("session");
      if (!value || typeof value !== "object") return null;
      const session = value as StoredAuthSession;
      if (
        typeof session.accessToken !== "string" ||
        !session.accessToken ||
        typeof session.refreshToken !== "string" ||
        !session.refreshToken ||
        !Number.isFinite(session.expiresAt) ||
        typeof session.sessionKey !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(session.sessionKey) ||
        typeof session.recovery !== "boolean" ||
        !session.user ||
        typeof session.user.id !== "string" ||
        typeof session.user.email !== "string"
      )
        return null;
      return session;
    },
    readFlow(): PkceFlow | null {
      const value = read("pkce");
      if (!value || typeof value !== "object") return null;
      const flow = value as PkceFlow;
      if (
        typeof flow.verifier !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier) ||
        (flow.intent !== "register" && flow.intent !== "recover") ||
        !Number.isFinite(flow.expiresAt) ||
        flow.expiresAt <= Date.now() / 1000
      )
        return null;
      return flow;
    },
    writeSession(session: StoredAuthSession) {
      write("session", session, SESSION_AGE);
    },
    writeFlow(flow: PkceFlow) {
      write("pkce", flow, FLOW_AGE);
    },
    clearSession() {
      clear("session");
    },
    clearFlow() {
      clear("pkce");
    },
    apply(response: Response) {
      for (const cookie of changes)
        response.headers.append("Set-Cookie", cookie);
      return response;
    },
  };
}

export type SessionCookies = ReturnType<typeof createSessionCookies>;
