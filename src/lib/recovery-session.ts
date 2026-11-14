import type { BrowserSession } from "./browser-auth-client";

export type RecoverySession = { userId: string; sessionId: string };

/** UI continuity only; the server enforces the encrypted recovery binding. */
export function getRecoverySession(
  session: BrowserSession | null,
): RecoverySession | null {
  if (
    !session ||
    !session.user.id ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      session.sessionKey,
    )
  )
    return null;
  return { userId: session.user.id, sessionId: session.sessionKey };
}

export function matchesRecoverySession(
  session: BrowserSession | null,
  expected: RecoverySession | null,
): boolean {
  const current = getRecoverySession(session);
  return (
    !!current &&
    !!expected &&
    current.userId === expected.userId &&
    current.sessionId === expected.sessionId
  );
}
