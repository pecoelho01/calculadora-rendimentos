"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateSupabaseUrl } from "./supabase-url";

let client: SupabaseClient | null | undefined;

/** Only Auth state is shared here. Portfolio data belongs to the mounted workspace. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (client !== undefined) return client;
  const url = validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return (client = null);
  try {
    client = createClient(url, key);
  } catch {
    client = null;
  }
  return client;
}
