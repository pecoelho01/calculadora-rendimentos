/** Require encrypted transport, except for local Supabase development. */
export function validateSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      return null;
    return url.href;
  } catch {
    return null;
  }
}
