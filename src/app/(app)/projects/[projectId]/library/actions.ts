"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { dbErrorMessage } from "@/lib/supabase/db-errors";
import { lookupIdentifier } from "@/lib/library/lookup";
import { sanitizeAuthors } from "@/lib/library/authors";
import { duplicateKeys } from "@/lib/library/csl-json";
import { formatBibliography, type BibliographyEntry } from "@/lib/library/bibliography";
import { isCitationStyle } from "@/lib/library/styles";
import { IMPORT_LIMITS, parseReferences } from "@/lib/library/parse-references";
import { fieldsSchema, rowRequestId } from "@/lib/library/source-schema";
import type { Source, SourceFields } from "@/lib/library/types";
import { loadUsage, type LibraryUsage } from "@/lib/library/usage";

export type SourceResult = { ok: true; source: Source } | { ok: false; error: string; conflict?: Source };
export type DeleteResult = { ok: true; deletedAt: string | null } | { ok: false; error: string };
export type LookupActionResult = { ok: true; source: SourceFields } | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";
const COLUMNS =
  "id, project_id, kind, title, authors, year, container, volume, issue, pages, publisher, doi, url, abstract, notes, created_at, updated_at, deleted_at";

const uuid = z.string().uuid();

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the details and try again.";
}

function toSource(row: Record<string, unknown>): Source {
  return { ...(row as unknown as Source), abstract: (row.abstract as string | null | undefined) ?? null, authors: sanitizeAuthors(row.authors) };
}

export type SourceListResult = { ok: true; sources: Source[] } | { ok: false; error: string };

/**
 * The project's current library, for open editors to catch up with what co-authors have
 * added, changed or deleted. Deleted sources are included so citations of them still render.
 */
export async function listSources(projectId: string, options: { abstracts?: boolean } = {}): Promise<SourceListResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Unknown project." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  // The editor only needs what citations and references show; abstracts can be large.
  const columns = options.abstracts === false ? COLUMNS.replace(" abstract,", "") : COLUMNS;
  const { data, error } = await auth.supabase
    .from("sources")
    .select(columns as typeof COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: dbErrorMessage(error, "load the library") };
  return { ok: true, sources: data.map(toSource) };
}

// A small per-instance limit, so one account can't turn the server into a lookup proxy.
const lookups = new Map<string, number[]>();
function overLookupLimit(userId: string) {
  const now = Date.now();
  const recent = (lookups.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  lookups.set(userId, recent);
  if (lookups.size > 5000) lookups.delete(lookups.keys().next().value!);
  return recent.length > 30;
}

/** Fills the "add source" form from a DOI, arXiv id or PubMed id. Nothing is saved until the person confirms. */
export async function lookupSource(input: string): Promise<LookupActionResult> {
  const auth = await actionUser();
  if (!auth.ok) return auth;
  if (overLookupLimit(auth.user.id)) return { ok: false, error: "That's a lot of lookups in a minute. Wait a moment, then try again." };
  return lookupIdentifier(String(input ?? "").slice(0, 300));
}

export async function saveSource(input: { projectId: string; requestId?: string; fields: unknown }): Promise<SourceResult> {
  if (!uuid.safeParse(input.projectId).success) return { ok: false, error: "Unknown project." };
  const parsed = fieldsSchema.safeParse(input.fields);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const requestId = input.requestId && uuid.safeParse(input.requestId).success ? input.requestId : null;

  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const insert = await supabase
    .from("sources")
    .insert({ ...parsed.data, project_id: input.projectId, created_by: user.id, client_request_id: requestId })
    .select(COLUMNS)
    .single();

  if (insert.error?.code === UNIQUE_VIOLATION) {
    // Either this exact submit already went through, or the DOI is already in the library.
    if (requestId) {
      const first = await supabase
        .from("sources")
        .select(COLUMNS)
        .eq("created_by", user.id)
        .eq("client_request_id", requestId)
        .maybeSingle();
      if (first.data) return { ok: true, source: toSource(first.data) };
    }
    return { ok: false, error: "A source with this DOI is already in the library." };
  }
  if (insert.error) {
    // Row-level security refuses insert for people who can't edit this project.
    if (insert.error.code === "42501") return { ok: false, error: "You don't have permission to add sources to this project." };
    return { ok: false, error: dbErrorMessage(insert.error, "save the source") };
  }

  revalidatePath(`/projects/${input.projectId}/library`);
  return { ok: true, source: toSource(insert.data) };
}

/**
 * Saves an edit. `expectedUpdatedAt` is the version the person started from; if someone else
 * saved in the meantime, nothing is overwritten and their version comes back to compare.
 */
export async function updateSource(input: { sourceId: string; expectedUpdatedAt?: string; fields: unknown }): Promise<SourceResult> {
  if (!uuid.safeParse(input.sourceId).success) return { ok: false, error: "Unknown source." };
  const parsed = fieldsSchema.safeParse(input.fields);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const auth = await actionUser();
  if (!auth.ok) return auth;

  let query = auth.supabase.from("sources").update(parsed.data).eq("id", input.sourceId);
  if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "Another source in this library already has that DOI." };
  if (error) return { ok: false, error: dbErrorMessage(error, "save the changes") };

  if (!data) {
    // Either someone else saved first, or row-level security refused, or it was deleted.
    const current = await auth.supabase.from("sources").select(COLUMNS).eq("id", input.sourceId).maybeSingle();
    if (current.data && input.expectedUpdatedAt && current.data.updated_at !== input.expectedUpdatedAt) {
      return {
        ok: false,
        error: "Someone else changed this source while you were editing. Their version is shown now; make your changes again.",
        conflict: toSource(current.data),
      };
    }
    return { ok: false, error: "You can't change this source, or it was deleted." };
  }

  revalidatePath(`/projects/${data.project_id}/library`);
  return { ok: true, source: toSource(data) };
}

/** Deletes a source (or puts a deleted one back). Citations of it keep showing it, with a warning. */
export async function setSourceDeleted(sourceId: string, deleted: boolean): Promise<DeleteResult> {
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "Unknown source." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc("set_source_deleted", { p_source: sourceId, p_deleted: deleted });
  if (error?.code === UNIQUE_VIOLATION) {
    return { ok: false, error: "A source with the same DOI was added since, so this one can't come back. Edit that one instead." };
  }
  if (error) return { ok: false, error: dbErrorMessage(error, deleted ? "delete this source" : "restore this source") };

  const row = await auth.supabase.from("sources").select("project_id").eq("id", sourceId).maybeSingle();
  if (row.data) revalidatePath(`/projects/${row.data.project_id}/library`);
  return { ok: true, deletedAt: data ?? null };
}

export type ImportPreview = { source: SourceFields; duplicate: boolean };
export type PreviewResult = { ok: true; format: "bibtex" | "ris"; items: ImportPreview[]; skipped: number } | { ok: false; error: string };
export type ImportResult = { ok: true; added: Source[]; skipped: number } | { ok: false; error: string };

/** Keys of everything already in the library (not deleted), for spotting duplicates. */
async function existingKeys(
  auth: Extract<Awaited<ReturnType<typeof actionUser>>, { ok: true }>,
  projectId: string,
): Promise<{ keys: Set<string> } | { error: { code?: string; message?: string } }> {
  const { data, error } = await auth.supabase
    .from("sources")
    .select("title, year, doi")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (error || !data) return { error: error ?? {} };
  return { keys: new Set(data.flatMap((s) => duplicateKeys(s))) };
}

/** Reads a BibTeX or RIS file and marks the references already in the library. Nothing is saved. */
export async function previewImport(projectId: string, text: string): Promise<PreviewResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Unknown project." };
  if (typeof text !== "string") return { ok: false, error: "Choose a .bib or .ris file." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  const parsed = parseReferences(text);
  if (!parsed.ok) return parsed;
  const existing = await existingKeys(auth, projectId);
  if ("error" in existing) return { ok: false, error: dbErrorMessage(existing.error, "check the library") };

  const seen = new Set(existing.keys);
  const items = parsed.sources.map((source) => {
    const keys = duplicateKeys(source);
    const duplicate = keys.some((k) => seen.has(k));
    keys.forEach((k) => seen.add(k));
    return { source, duplicate };
  });
  return { ok: true, format: parsed.format, items, skipped: parsed.skipped };
}

/** Adds the chosen references. Ones already in the library (by DOI, or title and year) are skipped. */
export async function importSources(input: { projectId: string; requestId: string; sources: unknown }): Promise<ImportResult> {
  if (!uuid.safeParse(input.projectId).success) return { ok: false, error: "Unknown project." };
  if (!uuid.safeParse(input.requestId).success) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const parsed = z.array(fieldsSchema).min(1, "Choose at least one reference.").max(IMPORT_LIMITS.entries).safeParse(input.sources);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const auth = await actionUser();
  if (!auth.ok) return auth;
  const existing = await existingKeys(auth, input.projectId);
  if ("error" in existing) return { ok: false, error: dbErrorMessage(existing.error, "check the library") };

  const seen = existing.keys;
  const rows = parsed.data.flatMap((fields, i) => {
    const keys = duplicateKeys(fields);
    if (keys.some((k) => seen.has(k))) return [];
    keys.forEach((k) => seen.add(k));
    return [{ ...fields, project_id: input.projectId, created_by: auth.user.id, client_request_id: rowRequestId(input.requestId, i) }];
  });
  const skipped = parsed.data.length - rows.length;
  if (rows.length === 0) return { ok: true, added: [], skipped };

  const batch = await auth.supabase.from("sources").insert(rows).select(COLUMNS);
  let added = batch.data?.map(toSource) ?? [];
  if (batch.error?.code === UNIQUE_VIOLATION) {
    // A retry of this import, or a co-author adding one of these meanwhile: add them one by one.
    added = [];
    for (const row of rows) {
      const one = await auth.supabase.from("sources").insert(row).select(COLUMNS).single();
      if (one.data) added.push(toSource(one.data));
      else if (one.error && one.error.code !== UNIQUE_VIOLATION) return { ok: false, error: dbErrorMessage(one.error, "import the references") };
    }
  } else if (batch.error) {
    if (batch.error.code === "42501") return { ok: false, error: "You don't have permission to add sources to this project." };
    return { ok: false, error: dbErrorMessage(batch.error, "import the references") };
  }

  revalidatePath(`/projects/${input.projectId}/library`);
  return { ok: true, added, skipped: skipped + rows.length - added.length };
}

/** `complete` is false while some manuscript has never been saved by the server, so isn't counted. */
export type UsageResult = { ok: true; citations: number; documents: number; complete: boolean } | { ok: false; error: string };

/** How often a source is cited across the project's manuscripts, as the server last saw them. */
export async function sourceUsage(sourceId: string): Promise<UsageResult> {
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "Unknown source." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("document_citations").select("citations").eq("source_id", sourceId);
  if (error) return { ok: false, error: dbErrorMessage(error, "check where this source is cited") };
  const { data: source } = await auth.supabase.from("sources").select("project_id").eq("id", sourceId).maybeSingle();
  const { data: complete } = source
    ? await auth.supabase.rpc("citation_index_complete", { p_project: source.project_id })
    : { data: false };
  return { ok: true, citations: data.reduce((sum, row) => sum + row.citations, 0), documents: data.length, complete: complete === true };
}

export type BibliographyResult = { ok: true; entries: BibliographyEntry[] } | { ok: false; error: string };

/**
 * The reference list for a manuscript, formatted on the server with the style's CSL file.
 * `sourceIds` is in order of first citation; sources outside the project are left out.
 */
export async function bibliography(input: { projectId: string; sourceIds: string[]; style: string }): Promise<BibliographyResult> {
  if (!uuid.safeParse(input.projectId).success) return { ok: false, error: "Unknown project." };
  if (!isCitationStyle(input.style)) return { ok: false, error: "Unknown citation style." };
  const ids = z.array(uuid).max(2000).safeParse(input.sourceIds);
  if (!ids.success) return { ok: false, error: "Couldn't read the citations." };
  if (ids.data.length === 0) return { ok: true, entries: [] };

  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("sources").select(COLUMNS).eq("project_id", input.projectId).in("id", ids.data);
  if (error) return { ok: false, error: dbErrorMessage(error, "format the references") };

  const byId = new Map(data.map((row) => [row.id, toSource(row)]));
  const ordered = ids.data.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  try {
    return { ok: true, entries: formatBibliography(ordered, input.style) };
  } catch (e) {
    console.error("[bibliography]", e);
    return { ok: false, error: "Couldn't format the references in this style." };
  }
}

export type SourceDetailsResult =
  | { ok: true; abstract: string | null; addedBy: string | null; addedAt: string; fileId: string | null }
  | { ok: false; error: string };

/** What a citation's hover card shows beyond what the editor already has: the abstract, and who added the source. */
export async function sourceDetails(sourceId: string): Promise<SourceDetailsResult> {
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "Unknown source." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.from("sources").select("abstract, created_by, created_at").eq("id", sourceId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error, "load the source") };
  if (!data) return { ok: false, error: "This source isn't in the library any more." };
  let addedBy: string | null = null;
  if (data.created_by) {
    const profile = await auth.supabase.from("profiles").select("full_name").eq("id", data.created_by).maybeSingle();
    addedBy = data.created_by === auth.user.id ? "you" : (profile.data?.full_name ?? null);
  }
  // A paper attached in Files, so the citation card can open it. Optional, like the abstract.
  const file = await auth.supabase.from("project_files").select("id").eq("source_id", sourceId).order("created_at").limit(1).maybeSingle();
  return { ok: true, abstract: data.abstract, addedBy, addedAt: data.created_at, fileId: file.error ? null : (file.data?.id ?? null) };
}

export type LibraryUsageResult = ({ ok: true } & LibraryUsage) | { ok: false; error: string };

/** How often each source in the project is cited, for grouping the library. */
export async function libraryUsage(projectId: string): Promise<LibraryUsageResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Unknown project." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  try {
    return { ok: true, ...(await loadUsage(auth.supabase, projectId)) };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e as Parameters<typeof dbErrorMessage>[0], "check where sources are cited") };
  }
}
