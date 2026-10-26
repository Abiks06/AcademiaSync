"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError, safeNext } from "@/lib/auth-redirect";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

async function callbackUrl(next: string) {
  // A fixed site URL is safest in production; otherwise use the origin the form was posted from.
  let origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!origin) {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? (h.get("host")?.startsWith("localhost") ? "http" : "https");
    origin = h.get("origin") ?? `${proto}://${h.get("host")}`;
  }
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const raw = formData.get("email");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message, email: typeof raw === "string" ? raw : undefined };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(safeNext(formData.get("next"))) },
  });
  if (error) return { status: "error", message: friendlyAuthError(error), email: parsed.data };
  return { status: "sent", email: parsed.data };
}

export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "azure") return;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: await callbackUrl(safeNext(formData.get("next"))),
      scopes: provider === "azure" ? "email" : undefined,
    },
  });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(friendlyAuthError(error))}`);
  redirect(data.url);
}
