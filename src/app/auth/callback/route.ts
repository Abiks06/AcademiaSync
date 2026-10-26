import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authErrorCode, safeNext, type SignInErrorCode } from "@/lib/auth-redirect";

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
    // Supabase sends expired or reused links back here with an error instead of a code.
    const reason = searchParams.get("error_code");
    return fail(reason === "otp_expired" ? "link_expired" : "link_incomplete");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(authErrorCode(error));
  return NextResponse.redirect(new URL(next, origin));
}
