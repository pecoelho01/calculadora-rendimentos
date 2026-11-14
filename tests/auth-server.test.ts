import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAuthHandler } from "../src/server/auth/auth.controller";
import { createCookieAccountHandler } from "../src/server/auth/account-session";
import { AuthError } from "../src/server/auth/auth.errors";
import {
  createSessionCookies,
  sessionSecret,
} from "../src/server/auth/session-cookies";
import {
  createSupabaseAuthAdapter,
  type AuthBackend,
} from "../src/server/auth/supabase-auth.adapter";
import type {
  AuthAction,
  ProviderSession,
  StoredAuthSession,
} from "../src/server/auth/auth.types";

const origin = "https://rendimentos.example.test";
const secret = Buffer.alloc(32, 7);
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.test",
};
const providerId = "22222222-2222-4222-8222-222222222222";
const key = "33333333-3333-4333-8333-333333333333";
const baselineSeconds = Math.floor(Date.now() / 1000);

function providerSession(
  lifetime = 3600,
  sessionId = providerId,
): ProviderSession {
  const expiresAt = baselineSeconds + lifetime;
  const claims = Buffer.from(
    JSON.stringify({ sub: user.id, session_id: sessionId, exp: expiresAt }),
  ).toString("base64url");
  return {
    accessToken: `header.${claims}.synthetic-signature`,
    refreshToken: `synthetic-refresh-${expiresAt}`,
    expiresAt,
    user,
  };
}

function storedSession(lifetime = 3600, recovery = false): StoredAuthSession {
  return { ...providerSession(lifetime), sessionKey: key, recovery };
}

function request(
  action: AuthAction | "account",
  body: unknown = {},
  cookie = "",
  headers: Record<string, string> = {},
  method = "POST",
) {
  return new Request(
    `${origin}/api/${action === "account" ? "account" : `auth/${action}`}`,
    {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Requested-With": "rendimentos",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    },
  );
}

function responseCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .filter((value) => !value.includes("Max-Age=0"))
    .map((value) => value.split(";")[0])
    .join("; ");
}

function cookieSession(session = storedSession(), url = origin) {
  const cookies = createSessionCookies(new Request(url), secret);
  cookies.writeSession(session);
  return responseCookie(cookies.apply(new Response()));
}

function backend() {
  const calls: string[] = [];
  const mock: AuthBackend = {
    async login() {
      calls.push("login");
      return providerSession();
    },
    async register() {
      calls.push("register");
      return null;
    },
    async recover() {
      calls.push("recover");
    },
    async exchange() {
      calls.push("exchange");
      return providerSession();
    },
    async refresh() {
      calls.push("refresh");
      return providerSession(7200);
    },
    async getUser() {
      calls.push("getUser");
      return user;
    },
    async password() {
      calls.push("password");
      return user;
    },
    async reauthenticate() {
      calls.push("reauthenticate");
    },
    async logout() {
      calls.push("logout");
    },
  };
  return {
    mock,
    calls,
    handler: (action: AuthAction) =>
      createAuthHandler(action, () => ({ secret, backend: mock })),
  };
}

test("login guarda tokens apenas em cookies cifrados HttpOnly, Secure e sem cache", async () => {
  const { handler } = backend();
  const response = await handler("login")(
    request("login", {
      email: user.email,
      password: "test-password",
      captchaToken: "test-captcha",
    }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session.user.id, user.id);
  assert.equal(body.session.recovery, false);
  assert.equal(body.session.accessToken, undefined);
  assert.equal(body.session.refreshToken, undefined);
  const serialized = JSON.stringify(body) + response.headers.get("set-cookie");
  assert.equal(serialized.includes("synthetic-signature"), false);
  assert.equal(serialized.includes("synthetic-refresh"), false);
  assert.match(
    response.headers.get("set-cookie")!,
    /__Host-rendimentos-session/,
  );
  for (const cookie of response.headers.getSetCookie()) {
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(cookie.includes("Domain="), false);
  }
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const restored = createSessionCookies(
    request("session", {}, responseCookie(response)),
    secret,
  ).readSession();
  assert.equal(restored?.accessToken, providerSession().accessToken);
});

test("cookies rejeitam adulteração, transplante entre finalidades e chaves erradas", () => {
  const cookie = cookieSession();
  const changed = cookie.replace(/(session\.0=.)/, "$1x");
  assert.equal(
    createSessionCookies(request("session", {}, changed), secret).readSession(),
    null,
  );
  assert.equal(
    createSessionCookies(
      request("session", {}, cookie),
      Buffer.alloc(32, 8),
    ).readSession(),
    null,
  );
  assert.equal(
    createSessionCookies(
      request(
        "session",
        {},
        cookie.replaceAll("rendimentos-session", "rendimentos-pkce"),
      ),
      secret,
    ).readFlow(),
    null,
  );
  assert.equal(
    createSessionCookies(
      request("session", {}, `${cookie}; ${cookie}`),
      secret,
    ).readSession(),
    null,
  );
  assert.equal(sessionSecret(secret.toString("base64"))?.length, 32);
  assert.equal(sessionSecret("public-or-short-secret"), null);
});

test("cookies só permitem HTTP em loopback e limitam o tamanho antes de escrever", () => {
  assert.throws(
    () => createSessionCookies(new Request("http://example.test"), secret),
    AuthError,
  );
  for (const url of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ]) {
    const cookie = cookieSession(storedSession(), url);
    assert.match(cookie, /rendimentos-session/);
    assert.equal(cookie.includes("__Host-"), false);
  }
  const cookies = createSessionCookies(new Request(origin), secret);
  assert.throws(
    () =>
      cookies.writeSession({
        ...storedSession(),
        accessToken: "x".repeat(20_000),
      }),
    AuthError,
  );
  assert.equal(cookies.apply(new Response()).headers.get("set-cookie"), null);
});

test("mutações rejeitam CSRF, tipos inválidos e corpos grandes antes de contactar Auth", async () => {
  const { handler, calls } = backend();
  const login = handler("login");
  const valid = {
    email: user.email,
    password: "test-password",
    captchaToken: "captcha",
  };
  const invalidHeaders: Record<string, string>[] = [
    { Origin: "https://attacker.example.test" },
    { Origin: "null" },
    { "X-Requested-With": "" },
    { "Content-Type": "text/plain" },
    { "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of invalidHeaders) {
    const response = await login(request("login", valid, "", headers));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(
    (await login(request("login", { ...valid, userId: user.id }))).status,
    400,
  );
  assert.equal(
    (await login(request("login", { ...valid, password: "" }))).status,
    400,
  );
  assert.equal(
    (await login(request("login", { ...valid, email: "x".repeat(20_000) })))
      .status,
    413,
  );
  assert.deepEqual(calls, []);
});

test("restauro usa cookie, renova só em POST e conserva a identidade pública", async () => {
  const { handler, calls } = backend();
  const cookie = cookieSession(storedSession(-1, true));
  const get = await handler("session")(
    request("session", {}, cookie, {}, "GET"),
  );
  assert.equal(get.status, 401);
  assert.equal(get.headers.get("set-cookie"), null);
  assert.deepEqual(calls, []);
  const restored = await handler("session")(
    request("session", {}, cookie, { "X-Account-Session": "old-tab-key" }),
  );
  assert.equal(restored.status, 200);
  const body = await restored.json();
  assert.equal(body.session.sessionKey, key);
  assert.equal(body.session.recovery, true);
  assert.deepEqual(calls, ["refresh"]);
  const stored = createSessionCookies(
    request("session", {}, responseCookie(restored)),
    secret,
  ).readSession();
  assert.equal(stored?.refreshToken, providerSession(7200).refreshToken);
});

test("uma renovação para outra sessão do mesmo utilizador não herda recuperação", async () => {
  const { mock, handler } = backend();
  mock.refresh = async () =>
    providerSession(7200, "44444444-4444-4444-8444-444444444444");
  const response = await handler("session")(
    request("session", {}, cookieSession(storedSession(-1, true))),
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("sessão válida é verificada sem voltar a emitir tokens ou cookies", async () => {
  const { handler, calls } = backend();
  const response = await handler("session")(
    request("session", {}, cookieSession()),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["getUser"]);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("mutações de sessão antiga são rejeitadas antes de Auth e não apagam cookies", async () => {
  const { handler, calls } = backend();
  for (const action of [
    "logout",
    "refresh",
    "password",
    "reauthenticate",
  ] as const) {
    const body =
      action === "password"
        ? { password: "new-test-password", sessionKey: "old-tab-key" }
        : { sessionKey: "old-tab-key" };
    const response = await handler(action)(
      request(action, body, cookieSession(storedSession(3600, true))),
    );
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.deepEqual(calls, []);
});

test("recuperação PKCE guarda verifier cifrado e só callback correspondente autoriza palavra-passe", async () => {
  const { mock, handler, calls } = backend();
  let challenge = "";
  mock.recover = async (email, redirect, provided) => {
    assert.equal(email, user.email);
    assert.equal(redirect, `${origin}/?recovery=1`);
    challenge = provided;
  };
  const sent = await handler("recover")(
    request("recover", { email: user.email, captchaToken: "captcha" }),
  );
  assert.equal(sent.status, 200);
  const cookie = responseCookie(sent);
  const flow = createSessionCookies(
    request("callback", {}, cookie),
    secret,
  ).readFlow();
  assert.equal(flow?.intent, "recover");
  assert.equal(
    createHash("sha256").update(flow!.verifier).digest("base64url"),
    challenge,
  );
  mock.exchange = async (code, verifier) => {
    calls.push("exchange");
    assert.equal(code, "recovery-code");
    assert.equal(verifier, flow!.verifier);
    return providerSession();
  };
  const callback = await handler("callback")(
    request("callback", { code: "recovery-code" }, cookie),
  );
  assert.equal(callback.status, 200);
  const session = (await callback.json()).session;
  assert.equal(session.recovery, true);
  assert.equal(session.user.id, user.id);
  assert.match(
    callback.headers.get("set-cookie")!,
    /rendimentos-pkce=; Max-Age=0/,
  );
  const invalid = await handler("callback")(
    request("callback", { code: "unrequested-code" }, cookieSession()),
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("set-cookie"), null);
  assert.deepEqual(calls, ["exchange"]);
});

test("registo sem sessão preserva cookies anteriores e confirmação não autoriza recuperação", async () => {
  const { handler } = backend();
  const registered = await handler("register")(
    request(
      "register",
      { email: user.email, password: "test-password", captchaToken: "captcha" },
      cookieSession(),
    ),
  );
  assert.equal(registered.status, 200);
  assert.equal((await registered.json()).session, null);
  assert.equal(
    registered.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith("__Host-rendimentos-session")),
    false,
  );
  const confirmed = await handler("callback")(
    request(
      "callback",
      { code: "confirmation-code" },
      responseCookie(registered),
    ),
  );
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).session.recovery, false);
});

test("erro de callback preserva sessão anterior e não renova tokens antigos", async () => {
  const { mock, handler, calls } = backend();
  const flow = createSessionCookies(new Request(origin), secret);
  flow.writeFlow({
    verifier: "a".repeat(43),
    intent: "recover",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });
  const cookie = `${cookieSession(storedSession(-1))}; ${responseCookie(flow.apply(new Response()))}`;
  mock.exchange = async () => {
    calls.push("exchange");
    throw new AuthError("invalid_callback");
  };
  const response = await handler("callback")(
    request("callback", { code: "invalid-code" }, cookie),
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(calls, ["exchange"]);
});

test("palavra-passe exige recuperação e persiste refresh mesmo quando é necessário código", async () => {
  const { handler, mock, calls } = backend();
  const notRecovery = await handler("password")(
    request(
      "password",
      { password: "new-test-password", sessionKey: key },
      cookieSession(),
    ),
  );
  assert.equal(notRecovery.status, 409);
  assert.deepEqual(calls, []);
  mock.password = async () => {
    throw new AuthError("reauthentication_needed", 401);
  };
  const response = await handler("password")(
    request(
      "password",
      { password: "new-test-password", sessionKey: key },
      cookieSession(storedSession(-1, true)),
    ),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "reauthentication_needed");
  const renewed = createSessionCookies(
    request("session", {}, responseCookie(response)),
    secret,
  ).readSession();
  assert.equal(renewed?.refreshToken, providerSession(7200).refreshToken);
  assert.equal(renewed?.recovery, true);
  mock.password = async () => user;
  const completed = await handler("password")(
    request(
      "password",
      { password: "new-test-password", nonce: "123456", sessionKey: key },
      responseCookie(response),
    ),
  );
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).session.recovery, false);
});

test("logout fecha sessão local mesmo com falha remota e ausência de configuração mantém modo local", async () => {
  const { handler, mock } = backend();
  mock.logout = async () => {
    throw new Error("transport-secret");
  };
  const response = await handler("logout")(
    request("logout", { sessionKey: key }, cookieSession()),
  );
  assert.equal(response.status, 503);
  assert.match(
    response.headers.get("set-cookie")!,
    /rendimentos-session=; Max-Age=0/,
  );
  assert.equal((await response.text()).includes("transport-secret"), false);
  const unavailable = createAuthHandler("session", () => null);
  assert.deepEqual(
    await (await unavailable(request("session", {}, "", {}, "GET"))).json(),
    { configured: false, session: null },
  );
});

test("logout renova token expirado antes de revogar e reporta falha de renovação", async () => {
  const { handler, mock, calls } = backend();
  let revokedToken = "";
  mock.logout = async (token) => {
    calls.push("logout");
    revokedToken = token;
  };
  const response = await handler("logout")(
    request("logout", { sessionKey: key }, cookieSession(storedSession(-1))),
  );
  assert.equal(response.status, 200);
  assert.equal(revokedToken, providerSession(7200).accessToken);
  assert.deepEqual(calls, ["refresh", "logout"]);
  mock.refresh = async () => {
    throw new AuthError("session_expired", 401);
  };
  const failed = await handler("logout")(
    request("logout", { sessionKey: key }, cookieSession(storedSession(-1))),
  );
  assert.equal(failed.status, 401);
  assert.match(
    failed.headers.get("set-cookie")!,
    /rendimentos-session=; Max-Age=0/,
  );
  assert.equal((await failed.json()).code, "session_expired");
  assert.deepEqual(calls, ["refresh", "logout"]);
});

test("API de conta ignora bearer externo, exige vínculo de sessão e protege POST contra CSRF", async () => {
  const { mock } = backend();
  const forwarded: Request[] = [];
  const account = createCookieAccountHandler(
    async (received) => {
      forwarded.push(received);
      return Response.json({ version: 1, portfolios: [] });
    },
    () => ({ secret, backend: mock }),
  );
  const bearer = {
    Authorization: "Bearer external-user-token",
    "X-Account-Session": key,
  };
  assert.equal(
    (await account(request("account", {}, "", bearer, "GET"))).status,
    401,
  );
  assert.equal(
    (
      await account(
        request(
          "account",
          {},
          cookieSession(),
          { ...bearer, "X-Account-Session": "old-user-key" },
          "GET",
        ),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await account(
        request("account", { changes: [] }, cookieSession(), {
          ...bearer,
          Origin: "https://attacker.test",
        }),
      )
    ).status,
    403,
  );
  assert.equal(forwarded.length, 0);
  const result = await account(
    request("account", { changes: [] }, cookieSession(), bearer),
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("vary"), "Cookie");
  assert.equal(result.headers.get("set-cookie"), null);
  assert.equal(
    forwarded[0].headers.get("authorization"),
    `Bearer ${providerSession().accessToken}`,
  );
  assert.deepEqual(await forwarded[0].json(), { changes: [] });
});

test("adapter envia CAPTCHA/PKCE e sanitiza erros sem depender da rede", async () => {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json(
      { code: "invalid_credentials", message: "private-provider-message" },
      { status: 400 },
    );
  };
  const adapter = createSupabaseAuthAdapter(
    { url: "https://provider.example.test", key: "public-key" },
    transport,
  );
  await assert.rejects(
    adapter.login({
      email: user.email,
      password: "test-password",
      captchaToken: "captcha-token",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.code, "invalid_credentials");
      assert.equal(error.message.includes("private-provider-message"), false);
      return true;
    },
  );
  const sent = requests[0];
  assert.equal(
    sent.url,
    "https://provider.example.test/auth/v1/token?grant_type=password",
  );
  assert.equal(sent.headers.get("apikey"), "public-key");
  assert.deepEqual((await sent.json()).gotrue_meta_security, {
    captcha_token: "captcha-token",
  });
});

test("origem usa Host público quando Next normaliza URL interna e ignora forwarded-host", async () => {
  const { handler, calls } = backend();
  const local = new Request("http://localhost:3100/api/auth/session", {
    method: "POST",
    headers: {
      Host: "127.0.0.1:3100",
      Origin: "http://127.0.0.1:3100",
      "Content-Type": "application/json",
      "X-Requested-With": "rendimentos",
      "Sec-Fetch-Site": "same-origin",
    },
    body: "{}",
  });
  const valid = await handler("session")(local);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { configured: true, session: null });
  for (const host of [
    "victim.example.test",
    "victim.example.test@attacker.example.test",
  ]) {
    const malicious = new Request(`${origin}/api/auth/session`, {
      method: "POST",
      headers: {
        Host: host,
        Origin: "https://attacker.example.test",
        "X-Forwarded-Host": "attacker.example.test",
        "Content-Type": "application/json",
        "X-Requested-With": "rendimentos",
      },
      body: "{}",
    });
    assert.equal((await handler("session")(malicious)).status, 403);
  }
  assert.deepEqual(calls, []);
});
