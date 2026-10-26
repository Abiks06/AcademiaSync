"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { AuthUnavailableError } from "@/lib/supabase/auth-errors";
import { userColor } from "@/lib/liveblocks/rooms";

export type ActionResult = { ok: true; savedVersionId?: string | null } | { ok: false; error: string };

const MAX_SNAPSHOT_BYTES = 4_000_000;
const AUTOSAVE_MIN_GAP_MS = 5 * 60_000;

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

const snapshotSchema = z.object({
  documentId: uuid,
  label: z.string().trim().max(120).optional(),
  content: z.unknown(),
  plainText: z.string().max(2_000_000),
  /** Autosaves are skipped when nothing changed or a snapshot was taken recently. */
  auto: z.boolean().default(false),
});

/** Saves a snapshot of the manuscript for history, search and export. */
export async function saveVersion(input: z.input<typeof snapshotSchema>): Promise<ActionResult> {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That snapshot couldn't be read." };
  const { documentId, label, content, plainText, auto } = parsed.data;
  if (JSON.stringify(content ?? null).length > MAX_SNAPSHOT_BYTES) {
    return { ok: false, error: "This manuscript is too large to snapshot." };
  }

  const auth = await session();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: latest, error: latestError } = await supabase
    .from("document_versions")
    .select("plain_text, created_at, label")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return { ok: false, error: `Couldn't check history: ${latestError.message}` };

  if (auto) {
    if (latest?.plain_text === plainText) return { ok: true, savedVersionId: null };
    if (latest && Date.now() - new Date(latest.created_at).getTime() < AUTOSAVE_MIN_GAP_MS) {
      return { ok: true, savedVersionId: null };
    }
  }

  const { data, error } = await supabase
    .from("document_versions")
    .insert({
      document_id: documentId,
      label: label || null,
      content: content as never,
      plain_text: plainText,
      // created_by is filled by the column default (auth.uid()); clients may not write it.
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `Couldn't save this version: ${error.message}` };

  return { ok: true, savedVersionId: data.id };
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

/** The stored content of one snapshot, for restoring it into the live document. */
export async function getVersionContent(versionId: string): Promise<{ content?: unknown; error?: string }> {
  if (!uuid.safeParse(versionId).success) return { error: "Unknown version." };
  const auth = await session();
  if (!auth.ok) return { error: auth.error };
  const { data, error } = await auth.supabase.from("document_versions").select("content").eq("id", versionId).maybeSingle();
  if (error) return { error: `Couldn't load that version: ${error.message}` };
  if (!data) return { error: "That version no longer exists." };
  return { content: data.content };
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
