import test from "node:test";
import assert from "node:assert/strict";
import { getRecoverySession, matchesRecoverySession } from "../src/lib/recovery-session";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "11111111-1111-4111-8111-111111111111";
function session(claims: unknown) {
  return { user: { id: userId }, access_token: `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic` };
}

test("recuperação permite rotação do token apenas na mesma sessão e utilizador", () => {
  const initial = session({ sub: userId, session_id: sessionId, nonce: 1, name: "Exemplo ç" });
  const rotated = session({ sub: userId, session_id: sessionId, nonce: 2 });
  assert.notEqual(initial.access_token, rotated.access_token);
  const binding = getRecoverySession(initial);
  assert.deepEqual(binding, { userId, sessionId });
  assert.equal(matchesRecoverySession(rotated, binding), true);
  assert.equal(matchesRecoverySession(session({ sub: userId, session_id: "22222222-2222-4222-8222-222222222222" }), binding), false);
  assert.equal(matchesRecoverySession({ ...rotated, user: { id: "other-user" } }, binding), false);
  assert.equal(matchesRecoverySession(null, binding), false);
  assert.equal(matchesRecoverySession(rotated, null), false);
});

test("recuperação rejeita identificador de sessão ausente, inválido ou sujeito incompatível", () => {
  for (const claims of [null, [], {}, { sub: userId }, { sub: "other-user", session_id: sessionId },
    { sub: userId, session_id: "" }, { sub: userId, session_id: 123 }, { sub: userId, session_id: "invalid" }]) {
    assert.equal(getRecoverySession(session(claims)), null);
  }
});

test("recuperação falha sem lançar exceção perante tokens malformados", () => {
  for (const access_token of ["", "not-a-jwt", "a.%.b", "a.b.c", "a.e30.b.c"])
    assert.equal(getRecoverySession({ user: { id: userId }, access_token }), null);
});
