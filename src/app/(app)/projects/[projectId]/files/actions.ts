"use server";

import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { dbErrorMessage } from "@/lib/supabase/db-errors";
import { FILE_COLUMNS, FILES_BUCKET, storagePath, type ProjectFile } from "@/lib/files/files";

export type FileResult = { ok: true; file: ProjectFile } | { ok: false; error: string };
export type FilesResult = { ok: true; files: ProjectFile[] } | { ok: false; error: string };
export type LinkResult = { ok: true; url: string } | { ok: false; error: string };

const uuid = z.string().uuid();

/** The database's own sentences (an upload that never finished, a full project) are safe to show. */
const OWN_MESSAGES = [/hasn't finished uploading/, /would go over 1 GB/, /isn't in this project/];
function fileError(error: { code?: string; message?: string }, action: string) {
  const own = OWN_MESSAGES.some((m) => m.test(error.message ?? ""));
  return own ? error.message! : dbErrorMessage(error, action);
}

export async function listFiles(projectId: string): Promise<FilesResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Unknown project." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("project_files").select(FILE_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) return { ok: false, error: dbErrorMessage(error, "load the files") };
  return { ok: true, files: data as ProjectFile[] };
}

const recordSchema = z.object({
  projectId: uuid,
  fileId: uuid,
  name: z.string().trim().min(1).max(255),
});

/**
 * Lists a file the browser has just uploaded to Storage. The database checks the upload is
 * really there and reads its size and type from Storage, so none of that is taken on trust.
 */
export async function recordUpload(input: z.input<typeof recordSchema>): Promise<FileResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file name isn't valid." };
  const { projectId, fileId, name } = parsed.data;
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase
    .from("project_files")
    .insert({ id: fileId, project_id: projectId, name, storage_path: storagePath(projectId, fileId, name), uploaded_by: auth.user.id })
    .select(FILE_COLUMNS)
    .single();
  if (error) {
    // Don't leave an unlisted upload taking up space.
    await auth.supabase.storage.from(FILES_BUCKET).remove([storagePath(projectId, fileId, name)]);
    return { ok: false, error: fileError(error, "add the file") };
  }
  return { ok: true, file: data as ProjectFile };
}

/** Attaches a file to a source in the library (or detaches it with null), so citations can open it. */
export async function attachFile(fileId: string, sourceId: string | null): Promise<FileResult> {
  if (!uuid.safeParse(fileId).success || (sourceId !== null && !uuid.safeParse(sourceId).success)) return { ok: false, error: "Unknown file." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("project_files").update({ source_id: sourceId }).eq("id", fileId).select(FILE_COLUMNS).maybeSingle();
  if (error) return { ok: false, error: fileError(error, "attach the file") };
  if (!data) return { ok: false, error: "You can't change this file, or it no longer exists." };
  return { ok: true, file: data as ProjectFile };
}

/** Removes a file from the shelf and from Storage. */
export async function deleteFile(fileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "Unknown file." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("project_files").delete().eq("id", fileId).select("storage_path").maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error, "delete the file") };
  if (!data) return { ok: false, error: "You can't delete this file, or it was already deleted." };
  const removed = await auth.supabase.storage.from(FILES_BUCKET).remove([data.storage_path]);
  // The row is gone either way; a leftover object only costs space and is logged.
  if (removed.error) console.error("[files] couldn't remove from storage", data.storage_path, removed.error.message);
  return { ok: true };
}

/**
 * A short-lived link to the file, straight from Storage. With `download`, the browser saves it
 * under its real name instead of opening it.
 */
export async function fileLink(fileId: string, download = false): Promise<LinkResult> {
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "Unknown file." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("project_files").select("name, storage_path").eq("id", fileId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error, "open the file") };
  if (!data) return { ok: false, error: "This file isn't in the project any more." };
  const signed = await auth.supabase.storage.from(FILES_BUCKET).createSignedUrl(data.storage_path, 60 * 10, download ? { download: data.name } : undefined);
  if (signed.error || !signed.data) return { ok: false, error: "Couldn't open the file right now. Try again in a moment." };
  return { ok: true, url: signed.data.signedUrl };
}
