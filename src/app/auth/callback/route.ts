import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError, safeNext } from "@/lib/auth-redirect";

/** Exchanges the one-time code from a magic link or OAuth sign-in for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const fail = (message: string) => {
    const signIn = new URL("/sign-in", origin);
    signIn.searchParams.set("error", message);
    if (next !== "/projects") signIn.searchParams.set("next", next);
    return NextResponse.redirect(signIn);
  };

  if (!code) {
    // Supabase sends expired or reused links back here with an error instead of a code.
    const reason = searchParams.get("error_code");
    if (reason === "otp_expired") return fail("That sign-in link has expired or was already used. Request a new one.");
    return fail(searchParams.get("error_description") ?? "That sign-in link is incomplete. Request a new one.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(friendlyAuthError(error));
  return NextResponse.redirect(new URL(next, origin));
}
