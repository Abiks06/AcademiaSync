"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorCode, safeNext } from "@/lib/auth-redirect";
import { destinationAfterSignIn, NEXT_COOKIE } from "@/lib/auth/after-sign-in";

const TYPES = ["email", "magiclink", "signup", "invite", "email_change"] as const;
type LinkType = (typeof TYPES)[number];

/**
 * Signs in with the token from an email link. It runs only when the person presses the
 * button, never on page load, so a mail scanner that opens every link can't use it up first.
 * It needs nothing stored in the browser, so the link works wherever it is opened.
 */
export async function confirmLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const rawType = String(formData.get("type") ?? "email");
  const type: LinkType = (TYPES as readonly string[]).includes(rawType) ? (rawType as LinkType) : "email";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) redirect("/sign-in?error=link_incomplete");

  const jar = await cookies();
  const next = safeNext(jar.get(NEXT_COOKIE)?.value);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) {
    const params = new URLSearchParams({ error: error ? authErrorCode(error) : "failed" });
    if (next !== "/projects") params.set("next", next);
    redirect(`/sign-in?${params}`);
  }
  jar.delete(NEXT_COOKIE);
  redirect(await destinationAfterSignIn(supabase, data.user.id, next));
}
