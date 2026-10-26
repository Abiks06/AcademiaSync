import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function isAdminConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * The server's own Supabase client, with the secret key. It bypasses row-level security,
 * so use it only after checking who is asking, and only for what browsers may never do
 * themselves (writing history, keeping the live document).
 */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server-side saving is not configured. Set SUPABASE_SECRET_KEY (see .env.example).");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
