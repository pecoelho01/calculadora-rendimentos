import test from "node:test";
import assert from "node:assert/strict";
import {
  getRecoverySession,
  matchesRecoverySession,
} from "../src/lib/recovery-session";
import type { BrowserSession } from "../src/lib/browser-auth-client";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionKey = "11111111-1111-4111-8111-111111111111";
const session: BrowserSession = {
  user: { id: userId, email: "exemplo@example.test" },
  sessionKey,
  recovery: true,
};

test("recuperação conserva continuidade na mesma geração de sessão sem expor tokens", () => {
  const binding = getRecoverySession(session);
  assert.deepEqual(binding, { userId, sessionId: sessionKey });
  assert.equal(matchesRecoverySession({ ...session }, binding), true);
  assert.equal(
    matchesRecoverySession(
      { ...session, sessionKey: "22222222-2222-4222-8222-222222222222" },
      binding,
    ),
    false,
  );
  assert.equal(
    matchesRecoverySession(
      { ...session, user: { ...session.user, id: "outro" } },
      binding,
    ),
    false,
  );
  assert.equal(matchesRecoverySession(null, binding), false);
  assert.equal(matchesRecoverySession(session, null), false);
});

test("recuperação rejeita identificadores de geração inválidos", () => {
  for (const invalid of [
    "",
    "invalid",
    "11111111-1111-4111-8111-111111111111-extra",
  ])
    assert.equal(getRecoverySession({ ...session, sessionKey: invalid }), null);
});
