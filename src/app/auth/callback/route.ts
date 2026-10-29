import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authErrorCode, safeNext, type SignInErrorCode } from "@/lib/auth-redirect";
import { destinationAfterSignIn, NEXT_COOKIE } from "@/lib/auth/after-sign-in";

/** Exchanges the one-time code from a magic link or OAuth sign-in for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const fail = (code: SignInErrorCode) => {
    const signIn = new URL("/sign-in", origin);
    signIn.searchParams.set("error", code);
    if (next !== "/projects") signIn.searchParams.set("next", next);
    return NextResponse.redirect(signIn);
  };

  if (!code) {
    // Supabase sends expired or reused links back here with an error instead of a code,
    // and Google or Microsoft send people back with access_denied when they press Cancel.
    const reason = searchParams.get("error_code");
    if (reason === "otp_expired") return fail("link_expired");
    if (searchParams.get("error") === "access_denied") return fail("cancelled");
    return fail("link_incomplete");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(authErrorCode(error));
  const response = NextResponse.redirect(new URL(await destinationAfterSignIn(supabase, data.user.id, next), origin));
  response.cookies.delete(NEXT_COOKIE);
  return response;
}
