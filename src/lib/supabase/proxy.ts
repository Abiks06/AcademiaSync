import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, getSupabaseEnv } from "@/lib/env";

const PROTECTED_PREFIXES = ["/projects"];

/** Refreshes the auth session on every request and guards signed-in areas. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", path);
    return NextResponse.redirect(signIn);
  }
  if (user && path === "/sign-in") {
    const home = request.nextUrl.clone();
    home.pathname = "/projects";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}
