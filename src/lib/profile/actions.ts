"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { dbErrorMessage } from "@/lib/supabase/db-errors";
import { safeNext } from "@/lib/auth-redirect";

export type ProfileState = {
  status: "idle" | "saved" | "error";
  message?: string;
  /** Which field the message is about, so the form can point at it. */
  field?: string;
  /** Changes on every save, so the form can play its "saved" moment again. */
  savedAt?: number;
};
export type Result = { ok: true } | { ok: false; error: string };

const NETWORK = "Something went wrong. Try again in a moment.";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Add the name you publish under.").max(120, "Keep your name under 120 characters."),
  position: z.string().trim().max(80, "Keep your position under 80 characters."),
  institution: z.string().trim().max(200, "Keep your institution under 200 characters."),
  field: z.string().trim().max(80, "Keep your field under 80 characters."),
});

/** Saves the title-page details. From the welcome screen it also marks the welcome done and moves on. */
export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    position: formData.get("position") ?? "",
    institution: formData.get("institution") ?? "",
    field: formData.get("field") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", message: issue?.message ?? "Check the details and try again.", field: String(issue?.path[0] ?? "") };
  }
  const auth = await actionUser();
  if (!auth.ok) return { status: "error", message: auth.error };

  const welcome = formData.get("welcome") === "1";
  const { full_name, position, institution, field } = parsed.data;
  try {
    const { data, error } = await auth.supabase
      .from("profiles")
      .update({
        full_name,
        position: position || null,
        institution: institution || null,
        field: field || null,
        ...(welcome ? { onboarded_at: new Date().toISOString() } : {}),
      })
      .eq("id", auth.user.id)
      .select("id");
    if (error) return { status: "error", message: dbErrorMessage(error, "save your profile") };
    if (!data.length) return { status: "error", message: "Your profile couldn't be found. Sign out and in again." };
  } catch {
    return { status: "error", message: NETWORK };
  }

  revalidatePath("/", "layout");
  if (welcome) redirect(safeNext(formData.get("next")));
  return { status: "saved", savedAt: Date.now() };
}

/** "Skip for now" on the welcome screen: the name stays as it is and the welcome isn't shown again. */
export async function skipWelcome(formData: FormData) {
  const auth = await actionUser();
  if (auth.ok) {
    await auth.supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", auth.user.id);
  }
  redirect(safeNext(formData.get("next")));
}

const pathSchema = z.string().regex(/^[0-9a-f-]{36}\/[a-z0-9-]{1,64}\.(png|jpg|webp)$/);

/**
 * Points the profile at a picture the browser has just uploaded (or clears it with null),
 * then tidies away this person's older pictures.
 */
export async function setAvatar(path: string | null): Promise<Result> {
  if (path !== null && !pathSchema.safeParse(path).success) return { ok: false, error: "That picture didn't upload properly. Try again." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  if (path && !path.startsWith(`${auth.user.id}/`)) return { ok: false, error: "That picture isn't yours." };

  try {
    const { error } = await auth.supabase.rpc("set_my_avatar", { p_path: path });
    if (error) return { ok: false, error: error.code === "22023" ? error.message : dbErrorMessage(error, "change your picture") };
    // Old pictures are only clutter now; failing to remove them doesn't matter.
    const { data: files } = await auth.supabase.storage.from("avatars").list(auth.user.id, { limit: 100 });
    const stale = (files ?? []).map((f) => `${auth.user.id}/${f.name}`).filter((p) => p !== path);
    if (stale.length) await auth.supabase.storage.from("avatars").remove(stale);
  } catch {
    return { ok: false, error: NETWORK };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Ends every session this person has, on every device, including this one. */
export async function signOutEverywhere() {
  const auth = await actionUser();
  if (auth.ok) {
    const { error } = await auth.supabase.auth.signOut({ scope: "global" });
    // If the server couldn't be told, at least this browser forgets the session.
    if (error) await auth.supabase.auth.signOut({ scope: "local" });
  }
  redirect("/sign-in");
}

export type DeletionPreview = { project_id: string; project_name: string; outcome: "deleted" | "blocks" | "leaves" }[];

export async function deletionPreview(): Promise<{ ok: true; projects: DeletionPreview } | { ok: false; error: string }> {
  const auth = await actionUser();
  if (!auth.ok) return auth;
  try {
    const { data, error } = await auth.supabase.rpc("account_deletion_preview");
    if (error) return { ok: false, error: dbErrorMessage(error, "check your projects") };
    return { ok: true, projects: data ?? [] };
  } catch {
    return { ok: false, error: NETWORK };
  }
}

/** Deletes the account for good, after the person has typed their email address. */
export async function deleteAccount(confirm: string): Promise<Result> {
  const auth = await actionUser();
  if (!auth.ok) return auth;
  try {
    const { data: files } = await auth.supabase.storage.from("avatars").list(auth.user.id, { limit: 100 });
    if (files?.length) await auth.supabase.storage.from("avatars").remove(files.map((f) => `${auth.user.id}/${f.name}`));
    const { error } = await auth.supabase.rpc("delete_my_account", { p_confirm: confirm });
    if (error) {
      if (error.code === "22023" || error.code === "P0001") return { ok: false, error: error.message };
      return { ok: false, error: dbErrorMessage(error, "delete your account") };
    }
  } catch {
    return { ok: false, error: NETWORK };
  }
  // The account is gone; only this browser's cookies are left to clear.
  await auth.supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
