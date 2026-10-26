"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { lookupDoi, normalizeDoi } from "@/lib/library/crossref";
import { sanitizeAuthors } from "@/lib/library/authors";
import { SOURCE_KINDS, type Source, type SourceFields } from "@/lib/library/types";

export type SourceResult = { ok: true; source: Source } | { ok: false; error: string };
export type DeleteResult = { ok: true } | { ok: false; error: string };
export type LookupActionResult = { ok: true; source: SourceFields } | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, project_id, kind, title, authors, year, container, volume, issue, pages, publisher, doi, url, abstract, notes, created_at";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .nullish()
    .transform((v) => v || null);

const fieldsSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  title: z.string().trim().min(1, "A source needs a title.").max(500, "Keep the title under 500 characters."),
  authors: z
    .array(z.object({ family: z.string().trim().min(1).max(100), given: z.string().trim().max(100) }))
    .max(100, "That is more than 100 authors. Keep the first 100 and add the rest in the notes."),
  year: z
    .number()
    .int()
    .min(1000, "Enter a four-digit year.")
    .max(2200, "Enter a four-digit year.")
    .nullish()
    .transform((v) => v ?? null),
  container: text(300),
  volume: text(40),
  issue: text(40),
  pages: text(40),
  publisher: text(300),
  doi: text(200).transform((v, ctx) => {
    if (v === null) return null;
    const doi = normalizeDoi(v);
    if (!doi) ctx.issues.push({ code: "custom", message: "That DOI looks wrong. It starts with 10. and has a slash.", input: v });
    return doi;
  }),
  url: text(2000).refine((v) => v === null || /^https?:\/\//i.test(v), "A link must start with http:// or https://"),
  abstract: text(10000),
  notes: text(5000),
});

const uuid = z.string().uuid();

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the details and try again.";
}

function toSource(row: Record<string, unknown>): Source {
  return { ...(row as unknown as Source), authors: sanitizeAuthors(row.authors) };
}

export type SourceListResult = { ok: true; sources: Source[] } | { ok: false; error: string };

/** The project's current library, for open editors to catch up with what co-authors have added or removed. */
export async function listSources(projectId: string): Promise<SourceListResult> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Unknown project." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase
    .from("sources")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, sources: data.map(toSource) };
}

/** Fills the "add source" form from a DOI. Nothing is saved until the person confirms. */
export async function lookupSource(input: string): Promise<LookupActionResult> {
  const auth = await actionUser();
  if (!auth.ok) return auth;
  return lookupDoi(String(input ?? "").slice(0, 300));
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
    return { ok: false, error: `Couldn't save the source: ${insert.error.message}` };
  }

  revalidatePath(`/projects/${input.projectId}/library`);
  return { ok: true, source: toSource(insert.data) };
}

export async function updateSource(input: { sourceId: string; fields: unknown }): Promise<SourceResult> {
  if (!uuid.safeParse(input.sourceId).success) return { ok: false, error: "Unknown source." };
  const parsed = fieldsSchema.safeParse(input.fields);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const auth = await actionUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.from("sources").update(parsed.data).eq("id", input.sourceId).select(COLUMNS).maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "Another source in this library already has that DOI." };
  if (error) return { ok: false, error: `Couldn't save the changes: ${error.message}` };
  // No row back means row-level security refused the change, or the source is gone.
  if (!data) return { ok: false, error: "You can't change this source, or it was deleted." };

  revalidatePath(`/projects/${data.project_id}/library`);
  return { ok: true, source: toSource(data) };
}

export async function deleteSource(sourceId: string): Promise<DeleteResult> {
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "Unknown source." };
  const auth = await actionUser();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.from("sources").delete().eq("id", sourceId).select("project_id").maybeSingle();
  if (error) return { ok: false, error: `Couldn't delete the source: ${error.message}` };
  if (!data) return { ok: false, error: "You can't delete this source, or it was already deleted." };

  revalidatePath(`/projects/${data.project_id}/library`);
  return { ok: true };
}
