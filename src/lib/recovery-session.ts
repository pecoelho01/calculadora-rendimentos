export type RecoverySession = { userId: string; sessionId: string };
type BrowserSession = { access_token: string; user: { id: string } } | null;

/** UI continuity only. Supabase still authenticates/authorizes the token remotely. */
export function getRecoverySession(session: BrowserSession): RecoverySession | null {
  if (!session) return null;
  try {
    const parts = session.access_token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const { sub, session_id: sessionId } = claims as Record<string, unknown>;
    if (sub !== session.user.id || typeof sessionId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId)) return null;
    return { userId: session.user.id, sessionId: sessionId.toLowerCase() };
  } catch {
    return null;
  }
}

export function matchesRecoverySession(session: BrowserSession, expected: RecoverySession | null): boolean {
  const current = getRecoverySession(session);
  return !!current && !!expected && current.userId === expected.userId && current.sessionId === expected.sessionId;
}
