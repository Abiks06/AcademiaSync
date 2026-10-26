"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { AuthUnavailableError } from "@/lib/supabase/auth-errors";
import { userColor } from "@/lib/liveblocks/rooms";
import { isServerSavingConfigured, restoreVersion, saveLiveDocument } from "@/lib/documents/live-document";
import { isRestorable } from "@/lib/editor/ydoc";

export type ActionResult = { ok: true; savedVersionId?: string | null } | { ok: false; error: string };

const uuid = z.string().uuid();

async function session() {
  try {
    const { supabase, user } = await getUser();
    if (!user) return { ok: false as const, error: "Your session has ended. Sign in again to keep saving." };
    return { ok: true as const, supabase, user };
  } catch (e) {
    if (e instanceof AuthUnavailableError) return { ok: false as const, error: e.message };
    throw e;
  }
}

const detailsSchema = z.object({
  documentId: uuid,
  title: z.string().trim().min(1, "A manuscript needs a title.").max(200).optional(),
  status: z.enum(["draft", "in_review", "final"]).optional(),
});

/** Renames a manuscript or changes its status. Row-level security limits this to editors. */
export async function updateDocumentDetails(input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { documentId, title, status } = parsed.data;
  if (title === undefined && status === undefined) return { ok: true };

  const auth = await session();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from("documents")
    .update({ ...(title !== undefined && { title }), ...(status !== undefined && { status }) })
    .eq("id", documentId)
    .select("project_id")
    .maybeSingle();
  if (error) return { ok: false, error: `Couldn't save: ${error.message}` };
  // No row back means row-level security refused the change.
  if (!data) return { ok: false, error: "You don't have permission to change this manuscript." };

  revalidatePath(`/projects/${data.project_id}`);
  return { ok: true };
}

/** The document, if this user may change it. Row-level security hides other projects' documents. */
async function editableDocument(supabase: Awaited<ReturnType<typeof getUser>>["supabase"], documentId: string) {
  const { data: document, error } = await supabase.from("documents").select("id, project_id").eq("id", documentId).maybeSingle();
  if (error) return { ok: false as const, error: "Couldn't check your access. Try again." };
  if (!document) return { ok: false as const, error: "This manuscript no longer exists." };
  const { data: canEdit, error: roleError } = await supabase.rpc("can_edit_project", { p_project: document.project_id });
  if (roleError) return { ok: false as const, error: "Couldn't check your access. Try again." };
  if (!canEdit) return { ok: false as const, error: "You can read this manuscript but not change it." };
  return { ok: true as const, document };
}

const NOT_CONFIGURED = "Saving history needs SUPABASE_SECRET_KEY on the server. Your text is safe in the live document.";

/**
 * Saves a named version. The server reads the text from the live document itself, so a
 * version is always exactly what everyone was looking at, whatever the browser sends.
 */
export async function saveVersion(input: { documentId: string; label?: string }): Promise<ActionResult> {
  if (!uuid.safeParse(input.documentId).success) return { ok: false, error: "Unknown document." };
  const label = String(input.label ?? "").trim().slice(0, 120) || "Saved version";
  if (!isServerSavingConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const auth = await session();
  if (!auth.ok) return auth;
  const allowed = await editableDocument(auth.supabase, input.documentId);
  if (!allowed.ok) return allowed;

  try {
    const id = await saveLiveDocument(input.documentId, { label, createdBy: auth.user.id });
    return { ok: true, savedVersionId: id };
  } catch (error) {
    console.error("[saveVersion]", error);
    return { ok: false, error: "Couldn't save this version. Try again in a moment." };
  }
}

/**
 * An open editor asks for this after a pause in typing, in case the Liveblocks webhook isn't
 * set up or is behind. It copies the live text to Supabase and adds an automatic version
 * when one is due; it never sends the text itself.
 */
export async function syncDocument(documentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(documentId).success) return { ok: false, error: "Unknown document." };
  if (!isServerSavingConfigured()) return { ok: true, savedVersionId: null };
  const auth = await session();
  if (!auth.ok) return auth;
  const allowed = await editableDocument(auth.supabase, documentId);
  if (!allowed.ok) return allowed;
  try {
    return { ok: true, savedVersionId: await saveLiveDocument(documentId, { auto: true }) };
  } catch (error) {
    console.error("[syncDocument]", error);
    return { ok: false, error: "Couldn't copy the manuscript to the database. It is still saved live." };
  }
}

/**
 * Restores a version for everyone, on the server, as a single change. The text as it is now
 * is saved as a version first, so the restore can itself be undone.
 */
export async function restoreDocumentVersion(input: { documentId: string; versionId: string }): Promise<ActionResult> {
  if (!uuid.safeParse(input.documentId).success || !uuid.safeParse(input.versionId).success) return { ok: false, error: "Unknown version." };
  if (!isServerSavingConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const auth = await session();
  if (!auth.ok) return auth;
  const allowed = await editableDocument(auth.supabase, input.documentId);
  if (!allowed.ok) return allowed;

  const { data: version, error } = await auth.supabase
    .from("document_versions")
    .select("content, created_at, label")
    .eq("id", input.versionId)
    .eq("document_id", input.documentId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load that version. Try again." };
  if (!version) return { ok: false, error: "That version no longer exists." };
  if (!isRestorable(version.content)) {
    return { ok: false, error: "That version contains content this editor can't show, so it wasn't restored. Nothing changed." };
  }

  try {
    const when = new Date(version.created_at).toISOString().slice(0, 16).replace("T", " ");
    await restoreVersion(input.documentId, version.content, auth.user.id, `Before restoring ${version.label ?? "the version"} from ${when} UTC`.slice(0, 120));
    revalidatePath(`/projects/${allowed.document.project_id}`);
    return { ok: true };
  } catch (e) {
    console.error("[restoreDocumentVersion]", e);
    return { ok: false, error: "Couldn't restore that version. The manuscript wasn't changed; try again." };
  }
}

export type VersionRow = {
  id: string;
  label: string | null;
  created_at: string;
  author: string;
  preview: string;
};

/** The most recent snapshots, newest first. */
export async function listVersions(documentId: string): Promise<{ versions: VersionRow[]; error?: string }> {
  if (!uuid.safeParse(documentId).success) return { versions: [], error: "Unknown document." };
  const auth = await session();
  if (!auth.ok) return { versions: [], error: auth.error };

  const { data, error } = await auth.supabase
    .from("document_versions")
    .select("id, label, created_at, created_by, plain_text")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { versions: [], error: `Couldn't load history: ${error.message}` };

  const authorIds = [...new Set((data ?? []).map((v) => v.created_by).filter((id): id is string => !!id))];
  const { data: profiles } = authorIds.length
    ? await auth.supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Collaborator"]));

  return {
    versions: (data ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      created_at: v.created_at,
      author: v.created_by ? (names.get(v.created_by) ?? "Collaborator") : "Former member",
      preview: v.plain_text.replace(/\s+/g, " ").trim().slice(0, 140),
    })),
  };
}

/** Names and avatars for the people shown in cursors and comments. Teammates only, by row-level security. */
export async function resolveUsers(userIds: string[]) {
  // Liveblocks matches results to userIds by position, so keep one slot per requested id.
  const valid = [...new Set(userIds.filter((id) => uuid.safeParse(id).success))].slice(0, 50);
  const byId = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (valid.length > 0) {
    const auth = await session();
    if (auth.ok) {
      const { data } = await auth.supabase.from("profiles").select("id, full_name, avatar_url").in("id", valid);
      (data ?? []).forEach((p) => byId.set(p.id, p));
    }
  }
  return userIds.map((id) => {
    const p = byId.get(id);
    return p ? { name: p.full_name ?? "Collaborator", avatar: p.avatar_url ?? undefined, color: userColor(id) } : undefined;
  });
}
