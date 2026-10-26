import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "./types";

export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
