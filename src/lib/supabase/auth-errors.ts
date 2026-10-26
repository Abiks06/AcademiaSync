import { isAuthApiError, isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js";

/**
 * True when an auth error only means "nobody is signed in": no session cookie,
 * or a token Supabase rejected as expired or revoked. Anything else (network
 * failure, 5xx, rate limit) means Auth couldn't answer, and must not be read
 * as a sign-out.
 */
export function isSignedOutError(error: AuthError) {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429;
}

/** Thrown when Supabase Auth can't be reached, so the error boundary can offer a retry. */
export class AuthUnavailableError extends Error {
  constructor(cause: AuthError) {
    super("We couldn't reach the sign-in service. Please try again in a moment.", { cause });
    this.name = "AuthUnavailableError";
  }
}
