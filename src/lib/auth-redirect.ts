import { isAuthApiError, isAuthPKCECodeVerifierMissingError, type AuthError } from "@supabase/supabase-js";

const LOCAL = "http://local.invalid";

/**
 * Only same-site paths are allowed after sign-in. The path is resolved the way a browser
 * would, so "//host", "/\\host" and "/%09/host" (browsers drop tabs and newlines) can't
 * lead to another site.
 */
export function safeNext(value: unknown, fallback = "/projects") {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, LOCAL);
    // "/.//host" resolves to the path "//host", which is off-site again once returned.
    if (url.origin !== LOCAL || url.pathname.startsWith("//")) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/**
 * Messages the sign-in page can show from its ?error= parameter. The link carries only a
 * code, so nobody can craft a sign-in link that shows their own text on our page.
 */
export const SIGN_IN_ERRORS = {
  wrong_browser: "Open the sign-in link in the same browser you requested it from, or request a new link here.",
  link_expired: "That sign-in link has expired or was already used. Request a new one.",
  link_incomplete: "That sign-in link is incomplete. Request a new one.",
  rate_limited: "Too many sign-in emails were requested. Wait a minute, then try again.",
  unavailable: "We couldn't reach the sign-in service. Please try again in a moment.",
  google_off: "Google sign-in isn't available yet. Use your email instead.",
  azure_off: "Microsoft sign-in isn't available yet. Use your email instead.",
  cancelled: "Sign-in was cancelled. Choose a way to continue.",
  failed: "Sign-in didn't work. Request a new link and try again.",
} as const;
export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS;

export function signInErrorMessage(code: unknown) {
  return typeof code === "string" && Object.hasOwn(SIGN_IN_ERRORS, code) ? SIGN_IN_ERRORS[code as SignInErrorCode] : undefined;
}

/** Sorts a Supabase Auth error into one of the messages above. */
export function authErrorCode(error: AuthError): SignInErrorCode {
  if (isAuthPKCECodeVerifierMissingError(error)) return "wrong_browser";
  if (error.code === "otp_expired" || error.code === "flow_state_expired" || error.code === "flow_state_not_found") return "link_expired";
  if (error.code === "over_email_send_rate_limit" || error.status === 429) return "rate_limited";
  if (!isAuthApiError(error) || error.status >= 500) return "unavailable";
  return "failed";
}

/** Turns Supabase Auth errors into messages a researcher can act on. */
export function friendlyAuthError(error: AuthError) {
  const code = authErrorCode(error);
  // Other API errors (an invalid email, say) are about what the person typed, so say what Supabase said.
  return code === "failed" ? error.message : SIGN_IN_ERRORS[code];
}

/** Messages for a typed sign-in code, which the person can simply retype. */
export function codeErrorMessage(error: AuthError) {
  const code = authErrorCode(error);
  if (code === "link_expired" || code === "failed") return "That code didn't match, or it has expired. Check the newest email, or send a new code.";
  if (code === "rate_limited") return "Too many tries. Wait a minute, then try the code again.";
  return SIGN_IN_ERRORS[code];
}

/** Seconds Supabase asks us to wait before sending another email ("…after 42 seconds"), if it said. */
export function retryAfterSeconds(error: AuthError) {
  const match = /after (\d+) seconds?/i.exec(error.message);
  return match ? Math.min(3600, Number(match[1])) : null;
}
