export type AuthBackend = {
  getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
};

/** Verify with Auth, using the same JWT forwarded by the request-scoped client. */
export async function authenticate(backend: AuthBackend, token: string) {
  const { data, error } = await backend.getUser(token);
  return !error && data.user ? { id: data.user.id } : null;
}
