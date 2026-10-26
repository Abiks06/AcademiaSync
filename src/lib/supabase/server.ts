import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import { AuthUnavailableError, isSignedOutError } from "./auth-errors";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Returns the signed-in user, verified with Supabase Auth (not just read from the cookie).
 * `user` is null when nobody is signed in; an Auth outage throws AuthUnavailableError instead.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && !isSignedOutError(error)) throw new AuthUnavailableError(error);
  return { supabase, user: error ? null : data.user };
}
