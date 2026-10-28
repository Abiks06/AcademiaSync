import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Profile } from "@/lib/supabase/types";
import { avatarSrc } from "./avatar";

/** The signed-in person's profile, shaped for the title-page form. */
export async function loadOwnProfile(supabase: SupabaseClient<Database>, user: User) {
  // "*" rather than a column list, so pages keep working while a new column is being added.
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  const p = (data ?? {}) as Partial<Profile>;
  const emailName = (user.email ?? "").split("@")[0];
  return {
    // A name copied from the email address is a placeholder, not a name: offer an empty line instead.
    defaults: {
      full_name: p.full_name && p.full_name !== emailName ? p.full_name : "",
      position: p.position ?? "",
      institution: p.institution ?? "",
      field: p.field ?? "",
    },
    avatarUrl: avatarSrc(p),
    onboarded: Boolean(p.onboarded_at),
  };
}
