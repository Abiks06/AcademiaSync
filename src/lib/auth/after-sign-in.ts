import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Where to go once a session exists: the welcome screen the first time, otherwise where
 * the person was headed. If the profile can't be read, they go on rather than being stuck.
 */
export async function destinationAfterSignIn(supabase: SupabaseClient<Database>, userId: string, next: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data || !("onboarded_at" in data) || data.onboarded_at) return next;
  return next === "/projects" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`;
}

/** Remembers where a sign-in link should lead, for links opened from the email (which carry no `next`). */
export const NEXT_COOKIE = "as-next";
