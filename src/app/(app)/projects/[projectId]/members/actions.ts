"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { dbErrorMessage } from "@/lib/supabase/db-errors";
import { escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { siteOrigin } from "@/lib/site-url";
import { announceAccessChange } from "@/lib/liveblocks/access";
import type { ProjectRole } from "@/lib/supabase/types";

export type MemberResult = { ok: true } | { ok: false; error: string };
export type InviteResult = { ok: true; link: string; emailed: boolean; emailError?: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const INVITABLE = ["author", "contributor", "commenter"] as const satisfies readonly ProjectRole[];
const ROLES = ["owner", ...INVITABLE] as const;

const ROLE_WORDS: Record<(typeof INVITABLE)[number], string> = {
  author: "an author (write, invite, manage the library)",
  contributor: "a contributor (write and cite)",
  commenter: "a commenter (read and comment)",
};

async function inviteLink(token: string) {
  return `${await siteOrigin()}/invite/${token}`;
}

/** Invites someone by email. The link is also returned, to share by hand if email isn't set up. */
export async function inviteMember(input: { projectId: string; email: string; role: string }): Promise<InviteResult> {
  if (!uuid.safeParse(input.projectId).success) return { ok: false, error: "Unknown project." };
  const email = z.string().trim().toLowerCase().email("Enter an email address like name@university.edu.").max(254).safeParse(input.email);
  if (!email.success) return { ok: false, error: email.error.issues[0].message };
  const role = z.enum(INVITABLE).safeParse(input.role);
  if (!role.success) return { ok: false, error: "Choose a role." };

  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // An earlier open invite to the same address is replaced, so the newest link and role win.
  await supabase.from("project_invites").delete().eq("project_id", input.projectId).eq("email", email.data).is("accepted_at", null);
  const { data: invite, error } = await supabase
    .from("project_invites")
    .insert({ project_id: input.projectId, email: email.data, role: role.data })
    .select("token, projects(name)")
    .single();
  if (error?.code === "42501") return { ok: false, error: "Only owners and authors can invite people." };
  if (error) return { ok: false, error: dbErrorMessage(error, "create the invite") };

  const link = await inviteLink(invite.token);
  if (!isEmailConfigured()) return { ok: true, link, emailed: false };

  const project = (invite.projects as unknown as { name: string } | null)?.name ?? "a project";
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const inviter = me?.full_name ?? "A colleague";
  const sent = await sendEmail({
    to: email.data,
    subject: `${inviter} invited you to “${project}” on AcademiaSync`,
    text: `${inviter} invited you to join “${project}” on AcademiaSync as ${ROLE_WORDS[role.data]}.\n\nJoin: ${link}\n\nThe link works for 14 days, with this email address.`,
    html: `<p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(project)}</strong> on AcademiaSync as ${escapeHtml(ROLE_WORDS[role.data])}.</p><p><a href="${escapeHtml(link)}">Join the project</a></p><p style="color:#666">The link works for 14 days, with this email address.</p>`,
  });
  revalidatePath(`/projects/${input.projectId}`);
  return sent.ok ? { ok: true, link, emailed: true } : { ok: true, link, emailed: false, emailError: sent.error };
}

export async function revokeInvite(input: { projectId: string; inviteId: string }): Promise<MemberResult> {
  if (!uuid.safeParse(input.projectId).success || !uuid.safeParse(input.inviteId).success) return { ok: false, error: "Unknown invite." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("project_invites").delete().eq("id", input.inviteId).select("id");
  if (error) return { ok: false, error: dbErrorMessage(error, "revoke the invite") };
  if (!data.length) return { ok: false, error: "You can't revoke this invite, or it was already used." };
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true };
}

async function projectDocuments(supabase: Extract<Awaited<ReturnType<typeof actionUser>>, { ok: true }>["supabase"], projectId: string) {
  // Read with the server's key: someone who just left can no longer see the documents.
  const client = isAdminConfigured() ? adminClient() : supabase;
  const { data } = await client.from("documents").select("id").eq("project_id", projectId);
  return (data ?? []).map((d) => d.id);
}

/** Owners change someone's role. Open editors pick up the change at once. */
export async function changeRole(input: { projectId: string; userId: string; role: string }): Promise<MemberResult> {
  if (!uuid.safeParse(input.projectId).success || !uuid.safeParse(input.userId).success) return { ok: false, error: "Unknown member." };
  const role = z.enum(ROLES).safeParse(input.role);
  if (!role.success) return { ok: false, error: "Choose a role." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from("project_members")
    .update({ role: role.data })
    .eq("project_id", input.projectId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error?.code === "P0001") return { ok: false, error: "A project needs at least one owner. Make someone else an owner first." };
  if (error) return { ok: false, error: dbErrorMessage(error, "change the role") };
  if (!data.length) return { ok: false, error: "Only owners can change roles." };

  await announceAccessChange(await projectDocuments(auth.supabase, input.projectId));
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true };
}

/** Owners remove a member, or anyone leaves. Their open editors are shut out at once. */
export async function removeMember(input: { projectId: string; userId: string }): Promise<MemberResult> {
  if (!uuid.safeParse(input.projectId).success || !uuid.safeParse(input.userId).success) return { ok: false, error: "Unknown member." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  const documents = await projectDocuments(auth.supabase, input.projectId);
  const { data, error } = await auth.supabase
    .from("project_members")
    .delete()
    .eq("project_id", input.projectId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error?.code === "P0001") return { ok: false, error: "A project needs at least one owner. Make someone else an owner first." };
  if (error) return { ok: false, error: dbErrorMessage(error, "remove this member") };
  if (!data.length) return { ok: false, error: "Only owners can remove other members." };

  await announceAccessChange(documents);
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true };
}
