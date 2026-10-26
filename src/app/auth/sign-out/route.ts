import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // The server couldn't revoke the session, so at least clear it from this browser.
    await supabase.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
