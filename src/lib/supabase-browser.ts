"use client";
import { createBrowserAuthClient, type BrowserSupabase } from "./browser-auth-client";
import { validateSupabaseUrl } from "./supabase-url";

let client: BrowserSupabase | null | undefined;

/** Only Auth state is shared here. Portfolio data belongs to the mounted workspace. */
export function getBrowserSupabase(): BrowserSupabase | null {
  if (typeof window === "undefined") return null;
  if (client !== undefined) return client;
  const url = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return (client = null);
  try {
    // URL callbacks are handled explicitly, after rejecting implicit token links.
    client = createBrowserAuthClient(url, key);
  } catch {
    client = null;
  }
  return client;
}
