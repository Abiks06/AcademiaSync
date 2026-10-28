import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, getSupabaseEnv } from "@/lib/env";
import { isSignedOutError } from "./auth-errors";

const PROTECTED_PREFIXES = ["/projects", "/settings", "/welcome"];

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

  // getClaims checks the token's signature locally (refreshing it when it has expired), so
  // most requests don't wait on a round trip to Supabase Auth. Pages still call getUser().
  const { data, error } = await supabase.auth.getClaims();
  const user = data?.claims.sub ? data.claims : null;

  // If Auth itself is down, don't bounce a signed-in user to the sign-in page.
  // Let the request through; the page checks again and shows a retry screen.
  if (error && !isSignedOutError(error)) return response;

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    signIn.searchParams.set("next", path + request.nextUrl.search);
    return redirectKeepingCookies(signIn, response);
  }
  if (user && path === "/sign-in") {
    const home = request.nextUrl.clone();
    home.pathname = "/projects";
    home.search = "";
    return redirectKeepingCookies(home, response);
  }

  return response;
}

/** Carries any refreshed session cookies onto the redirect so the browser doesn't keep stale ones. */
function redirectKeepingCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
