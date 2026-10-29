"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/site-url";
import { authErrorCode, codeErrorMessage, friendlyAuthError, retryAfterSeconds, safeNext } from "@/lib/auth-redirect";
import { destinationAfterSignIn, NEXT_COOKIE } from "@/lib/auth/after-sign-in";
import { isProviderEnabled, type Provider } from "./providers";

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
  /** Seconds until another email may be requested. */
  wait?: number;
  /** Changes with every email sent, so the form can restart its countdown. */
  sentAt?: number;
};

export type CodeState = { status: "idle" | "error"; message?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const codeSchema = z.string().regex(/^\d{6,8}$/, "Enter the code from the email.");

/** Supabase lets one address request a new email once a minute. */
const RESEND_AFTER = 60;

async function callbackUrl(next: string) {
  return `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const raw = formData.get("email");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message, email: typeof raw === "string" ? raw : undefined };
  }

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next) },
  });
  if (error) {
    const wait = retryAfterSeconds(error);
    // A failed resend leaves the earlier email good, so the code screen stays.
    if (formData.get("resend") === "1") {
      return wait
        ? { status: "sent", email: parsed.data, wait, sentAt: Date.now(), message: `Supabase asks for ${wait} more seconds before another email.` }
        : { status: "sent", email: parsed.data, wait: 0, sentAt: _prev.sentAt ?? Date.now(), message: friendlyAuthError(error) };
    }
    return { status: "error", message: friendlyAuthError(error), email: parsed.data };
  }

  // Links in the email go to /auth/confirm, which can't carry `next`; this browser remembers it.
  (await cookies()).set(NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 3600, path: "/" });
  return { status: "sent", email: parsed.data, wait: RESEND_AFTER, sentAt: Date.now() };
}

/** Signs in with the code from the email: works even when the link would open in another browser. */
export async function verifyCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const token = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\D/g, ""));
  if (!email.success) return { status: "error", message: "Go back and enter your email address again." };
  if (!token.success) return { status: "error", message: token.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: token.data, type: "email" });
  if (error || !data.user) return { status: "error", message: error ? codeErrorMessage(error) : "Sign-in didn't work. Try again." };

  (await cookies()).delete(NEXT_COOKIE);
  redirect(await destinationAfterSignIn(supabase, data.user.id, safeNext(formData.get("next"))));
}

export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "azure") return;

  // Supabase answers a disabled provider with a raw JSON error page, so check first.
  const next = safeNext(formData.get("next"));
  if (!(await isProviderEnabled(provider as Provider))) {
    const params = new URLSearchParams({ error: provider === "google" ? "google_off" : "azure_off" });
    if (next !== "/projects") params.set("next", next);
    redirect(`/sign-in?${params}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: await callbackUrl(next),
      scopes: provider === "azure" ? "email" : undefined,
    },
  });
  if (error) redirect(`/sign-in?error=${authErrorCode(error)}`);
  redirect(data.url);
}
