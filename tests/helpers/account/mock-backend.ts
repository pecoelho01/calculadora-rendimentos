import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import type { Portfolio } from "../../../src/lib/types";
import type {
  AccountSnapshot,
  AccountWrite,
} from "../../../src/lib/account/account";

export const storageKey = "rendimentos.portfolios.v1";
export const entryKey = "rendimentos.entry.local.v1";
export const authKey = "sb-rendimentos-test-auth-token";
export const localPortfolio: Portfolio = {
  id: "local-original",
  name: "Carteira do navegador",
  currency: "EUR",
  orders: [],
};
export const localJson = JSON.stringify({
  version: 1,
  portfolios: [localPortfolio],
});
export const userA = "00000000-0000-4000-8000-000000000001";
export const userB = "00000000-0000-4000-8000-000000000002";
function user(id = userA, userMetadata: Record<string, unknown> = {}) {
  return {
    id,
    email: id === userA ? "ana@example.test" : "bruno@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: userMetadata,
    identities: [],
    created_at: "2024-01-01T00:00:00Z",
    email_confirmed_at: "2024-01-01T00:00:00Z",
  };
}
export function session(
  id = userA,
  lifetime = 3600,
  options: {
    sessionId?: string;
    nonce?: string;
    userMetadata?: Record<string, unknown>;
  } = {},
) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetime;
  const base64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${base64({ alg: "HS256", typ: "JWT" })}.${base64({ sub: id, session_id: options.sessionId ?? id, nonce: options.nonce ?? "initial", aud: "authenticated", role: "authenticated", exp: expiresAt })}.test-signature`,
    refresh_token: `mock-refresh-${id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: user(id, options.userMetadata),
  };
}
function remote(name = "Carteira da Ana", id = "remote-a"): AccountSnapshot {
  return {
    version: 1,
    portfolios: [
      { portfolio: { id, name, currency: "EUR", orders: [] }, revision: 3 },
    ],
  };
}
export async function setup(
  page: Page,
  signedIn: boolean | "expired" = false,
  autoCaptcha = true,
) {
  const accounts: Record<string, AccountSnapshot> = {
    [userA]: remote(),
    [userB]: remote("Carteira do Bruno", "remote-b"),
  };
  const requests: AccountWrite[] = [];
  const authRequests: {
    path: string;
    body: Record<string, unknown>;
    grant: string | null;
    authorization: string;
  }[] = [];
  const pkceFlows = new Map<string, { challenge: string; id: string }>();
  const receipts = new Set<string>();
  const state = {
    requireReauthentication: false,
    failReauthenticationSend: false,
    failNextLogin: false,
    failNextWrite: 0,
    delayNextWrite: false,
    releaseWrite: () => {},
    delayRefresh: false,
    releaseRefresh: () => {},
    failRefresh: false,
    delayAuthPath: "",
    authBlocked: false,
    failNextLogout: false,
    failNextUserUpdate: false,
    completedUserUpdates: 0,
    userMetadata: {} as Record<string, unknown>,
    releaseAuth: () => {},
    nextTokenSession: null as ReturnType<typeof session> | null,
    accountReads: 0,
    marketRequests: 0,
    accounts,
    requests,
    authRequests,
  };
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `(() => {
      let next = 0;
      const widgets = new Map();
      const mock = window.__captchaMock = {
        active: null,
        issue() { mock.active?.callback('captcha-test-' + (++next)); },
        expire() { mock.active?.['expired-callback'](); },
        fail() { mock.active?.['error-callback'](); },
        timeout() { mock.active?.['timeout-callback'](); }
      };
      window.turnstile = {
        render(container, options) {
          const id = String(++next); widgets.set(id, options); mock.active = options;
          container.textContent = 'Verificação de segurança simulada';
          // Match Cloudflare's documented widget footprint for responsive checks.
          container.style.width = options.size === 'compact' ? '150px' : '100%';
          container.style.minWidth = options.size === 'compact' ? '150px' : '300px';
          container.style.height = options.size === 'compact' ? '140px' : '65px';
          ${autoCaptcha ? "queueMicrotask(() => options.callback('captcha-test-' + (++next)));" : ""}
          return id;
        },
        remove(id) { if (mock.active === widgets.get(id)) mock.active = null; widgets.delete(id); }
      };
    })();`,
      }),
  );
  await page.addInitScript(
    ({ key, json, authKey, authSession }) => {
      localStorage.setItem(key, json);
      if (authSession && !localStorage.getItem(authKey))
        localStorage.setItem(authKey, JSON.stringify(authSession));
    },
    {
      key: storageKey,
      json: localJson,
      authKey,
      authSession: signedIn
        ? session(userA, signedIn === "expired" ? -3600 : 3600)
        : null,
    },
  );
  await page.route("**/api/market?*", (route) => {
    state.marketRequests++;
    return route.fulfill({ json: { assets: {} } });
  });
  await page.route("**/api/geography?*", (route) =>
    route.fulfill({ json: { geographies: {} } }),
  );
  await page.route(
    "https://rendimentos-test.supabase.co/auth/v1/**",
    async (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          },
        });
        return;
      }
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON() as Record<string, unknown> | null;
      const grant = new URL(request.url()).searchParams.get("grant_type");
      authRequests.push({
        path,
        body: body ?? {},
        grant,
        authorization: request.headers().authorization ?? "",
      });
      if (state.delayAuthPath && path.endsWith(state.delayAuthPath)) {
        state.delayAuthPath = "";
        state.authBlocked = true;
        await new Promise<void>((resolve) => {
          state.releaseAuth = resolve;
        });
        state.authBlocked = false;
      }
      if (path.endsWith("/logout") && state.failNextLogout) {
        state.failNextLogout = false;
        await route.fulfill({
          status: 500,
          json: { code: "unexpected_failure", message: "Logout failed" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        return;
      }
      if (path.endsWith("/user") && state.failNextUserUpdate) {
        state.failNextUserUpdate = false;
        await route.fulfill({
          status: 500,
          json: { message: "User update failed" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        return;
      }
      if (path.endsWith("/token") && grant === "refresh_token") {
        if (state.delayRefresh)
          await new Promise<void>((resolve) => {
            state.releaseRefresh = resolve;
          });
        if (state.failRefresh) {
          await route.fulfill({
            status: 400,
            json: {
              code: "refresh_token_not_found",
              message: "Invalid Refresh Token",
            },
            headers: { "Access-Control-Allow-Origin": "*" },
          });
          return;
        }
      }
      if (path.endsWith("/reauthenticate") && state.failReauthenticationSend) {
        await route.fulfill({
          status: 429,
          json: { code: "over_email_send_rate_limit", message: "Rate limited" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        return;
      }
      if (
        path.endsWith("/user") &&
        body?.password &&
        state.requireReauthentication
      ) {
        const code = !body.nonce
          ? "reauthentication_needed"
          : body.nonce !== "123456"
            ? "reauthentication_not_valid"
            : null;
        if (code) {
          await route.fulfill({
            status: 401,
            json: { code, message: code },
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
              "X-Supabase-Api-Version": "2024-01-01",
            },
          });
          return;
        }
      }
      if (
        path.endsWith("/token") &&
        grant === "password" &&
        state.failNextLogin
      ) {
        state.failNextLogin = false;
        await route.fulfill({
          status: 400,
          json: { code: "invalid_credentials", message: "Invalid credentials" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        return;
      }
      if (path.endsWith("/signup") || path.endsWith("/recover")) {
        const code = path.endsWith("/signup")
          ? "confirmation-test-code"
          : "recovery-test-code";
        pkceFlows.set(code, {
          challenge: String(body?.code_challenge),
          id: userA,
        });
      }
      let json: unknown = {};
      if (path.endsWith("/token") && grant === "pkce") {
        const flow = pkceFlows.get(String(body?.auth_code));
        const challenge = createHash("sha256")
          .update(String(body?.code_verifier))
          .digest("base64url");
        if (!flow || flow.challenge !== challenge) {
          await route.fulfill({
            status: 400,
            json: { code: "bad_code_verifier", message: "Invalid verifier" },
            headers: { "Access-Control-Allow-Origin": "*" },
          });
          return;
        }
        pkceFlows.delete(String(body?.auth_code));
        json = session(flow.id, 3600, { userMetadata: state.userMetadata });
      } else if (path.endsWith("/token")) {
        json =
          state.nextTokenSession ??
          session(body?.email === "bruno@example.test" ? userB : userA, 3600, {
            userMetadata: state.userMetadata,
          });
        state.nextTokenSession = null;
      } else if (path.endsWith("/signup")) json = user();
      else if (path.endsWith("/user")) {
        const update = body?.data;
        if (update && typeof update === "object") {
          state.userMetadata = {
            ...state.userMetadata,
            ...(update as Record<string, unknown>),
          };
        }
        json = user(userA, state.userMetadata);
      }
      await route.fulfill({
        json,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
      if (path.endsWith("/user") && request.method() === "PUT") {
        state.completedUserUpdates++;
      }
    },
  );
  await page.route("**/api/account", async (route) => {
    const request = route.request();
    const jwt = request.headers().authorization?.slice(7).split(".")[1];
    const id: string = jwt
      ? JSON.parse(Buffer.from(jwt, "base64url").toString()).sub
      : "";
    if (!accounts[id]) {
      await route.fulfill({ status: 401, json: { error: "Sessão inválida" } });
      return;
    }
    if (request.method() === "GET") state.accountReads++;
    if (request.method() === "POST") {
      const write = request.postDataJSON() as AccountWrite;
      requests.push(write);
      if (state.delayNextWrite) {
        state.delayNextWrite = false;
        await new Promise<void>((resolve) => {
          state.releaseWrite = resolve;
        });
      }
      if (state.failNextWrite) {
        const status = state.failNextWrite;
        state.failNextWrite = 0;
        await route.fulfill({ status, json: { error: "Falha controlada" } });
        return;
      }
      const snapshot = structuredClone(accounts[id]);
      if (write.migration) {
        const receipt = `${id}:${write.migration.key}`;
        if (!receipts.has(receipt)) {
          snapshot.portfolios.push(
            ...write.migration.portfolios.map((portfolio) => ({
              portfolio: { ...portfolio, id: `import-${portfolio.id}` },
              revision: 1,
            })),
          );
          receipts.add(receipt);
        }
      } else {
        for (const change of write.changes) {
          const existing = snapshot.portfolios.find(
            (record) => record.portfolio.id === change.id,
          );
          if ((existing?.revision ?? null) !== change.expectedRevision) {
            await route.fulfill({ status: 409, json: { error: "Conflito" } });
            return;
          }
        }
        for (const change of write.changes) {
          const index = snapshot.portfolios.findIndex(
            (record) => record.portfolio.id === change.id,
          );
          if (!change.portfolio) snapshot.portfolios.splice(index, 1);
          else if (index >= 0)
            snapshot.portfolios[index] = {
              portfolio: change.portfolio,
              revision: snapshot.portfolios[index].revision + 1,
            };
          else
            snapshot.portfolios.push({
              portfolio: change.portfolio,
              revision: 1,
            });
        }
      }
      accounts[id] = snapshot;
    }
    await route.fulfill({
      json: accounts[id],
      headers: { "Cache-Control": "no-store" },
    });
  });
  return state;
}

export type MockAuthState = Awaited<ReturnType<typeof setup>>;
