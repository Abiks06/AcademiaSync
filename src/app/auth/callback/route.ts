import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exchanges the one-time code from a magic link or OAuth sign-in for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/projects";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/projects";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent("That sign-in link is missing its code. Request a new one.")}`);
}
