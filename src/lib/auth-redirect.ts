import { isAuthApiError, isAuthPKCECodeVerifierMissingError, type AuthError } from "@supabase/supabase-js";

/**
 * Only same-site paths are allowed after sign-in. Rejects "//host" and "/\host",
 * which browsers treat as links to another site.
 */
export function safeNext(value: unknown, fallback = "/projects") {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

/** Turns Supabase Auth errors into messages a researcher can act on. */
export function friendlyAuthError(error: AuthError) {
  if (isAuthPKCECodeVerifierMissingError(error)) {
    return "Open the sign-in link in the same browser you requested it from, or request a new link here.";
  }
  if (error.code === "otp_expired" || error.code === "flow_state_expired" || error.code === "flow_state_not_found") {
    return "That sign-in link has expired or was already used. Request a new one.";
  }
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "Too many sign-in emails were requested. Wait a minute, then try again.";
  }
  if (!isAuthApiError(error) || error.status >= 500) {
    return "We couldn't reach the sign-in service. Please try again in a moment.";
  }
  return error.message;
}
