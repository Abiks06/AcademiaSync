"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/projects";
}

async function callbackUrl(next: string) {
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(safeNext(formData.get("next"))) },
  });
  if (error) return { status: "error", message: error.message, email: parsed.data };
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
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect(data.url);
}
