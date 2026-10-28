import { describe, expect, it } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { codeErrorMessage, retryAfterSeconds, safeNext, signInErrorMessage } from "./auth-redirect";

describe("safeNext", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeNext("/projects/abc?tab=library#top")).toBe("/projects/abc?tab=library#top");
  });

  it.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/%09/evil.com".replace("%09", "\t"), "https://evil.com", "evil.com", "", null, 42])(
    "refuses %j",
    (value) => {
      expect(safeNext(value)).toBe("/projects");
    },
  );

  it("never returns a value that resolves off-site", () => {
    for (const value of ["/%2F/evil.com", "/.//evil.com", "/\r\n/evil.com"]) {
      const next = safeNext(value);
      expect(new URL(next, "https://academiasync.app").origin).toBe("https://academiasync.app");
    }
  });
});

describe("sign-in code and resend errors", () => {
  const apiError = (message: string, status: number, code?: string) => new AuthApiError(message, status, code);

  it("reads how long Supabase wants us to wait", () => {
    expect(retryAfterSeconds(apiError("For security purposes, you can only request this after 42 seconds.", 429, "over_email_send_rate_limit"))).toBe(42);
    expect(retryAfterSeconds(apiError("Email rate limit exceeded", 429))).toBeNull();
  });

  it("says a wrong or old code can be retyped", () => {
    expect(codeErrorMessage(apiError("Token has expired or is invalid", 403, "otp_expired"))).toMatch(/didn't match/);
  });

  it("explains too many tries", () => {
    expect(codeErrorMessage(apiError("Too many requests", 429))).toMatch(/Too many tries/);
  });

  it("shows a cancelled sign-in by its own message", () => {
    expect(signInErrorMessage("cancelled")).toMatch(/cancelled/);
  });
});
