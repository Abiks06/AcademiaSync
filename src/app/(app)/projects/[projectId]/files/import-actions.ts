"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/supabase/action-user";
import { dbErrorMessage } from "@/lib/supabase/db-errors";
import { FILES_BUCKET, fileKind } from "@/lib/files/files";
import { DOCX_LIMITS, DocxError, parseDocx, type ParsedDocx } from "@/lib/import/docx";
import { analyzeImport, assembleDocument, type ImportAnalysis, type SourceStatus } from "@/lib/import/resolve";
import { lookupDoi, searchBibliographic } from "@/lib/library/crossref";
import { sanitizeAuthors } from "@/lib/library/authors";
import { duplicateKeys } from "@/lib/library/csl-json";
import { fieldsSchema, rowRequestId } from "@/lib/library/source-schema";
import { seedDocument } from "@/lib/documents/live-document";
import type { Source, SourceFields } from "@/lib/library/types";

const UNIQUE_VIOLATION = "23505";
const uuid = z.string().uuid();
const LIBRARY_COLUMNS =
  "id, project_id, kind, title, authors, year, container, volume, issue, pages, publisher, doi, url, notes, created_at, updated_at, deleted_at";
/** Crossref lookups stop after this long; whatever is left stays for a person to decide. */
const LOOKUP_BUDGET_MS = 40_000;

type Auth = Extract<Awaited<ReturnType<typeof actionUser>>, { ok: true }>;

export type ImportSourcePreview = {
  key: string;
  status: SourceStatus;
  fields: SourceFields | null;
  libraryId: string | null;
  written: string | null;
  citations: number;
};

export type ImportPreview = {
  title: string;
  origin: ImportAnalysis["origin"];
  sources: ImportSourcePreview[];
  citations: number;
  /** Citations that fit no entry of the reference list, as typed. They stay as text. */
  unmatched: string[];
  kept: ParsedDocx["kept"];
  /** The library, for linking a source by hand. */
  library: { id: string; label: string }[];
};

export type ImportPreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };
export type CreateImportResult = { ok: true; href: string; linked: number; asText: number; added: number } | { ok: false; error: string };

const pickFields = (s: SourceFields): SourceFields => ({
  kind: s.kind,
  title: s.title,
  authors: s.authors,
  year: s.year,
  container: s.container,
  volume: s.volume,
  issue: s.issue,
  pages: s.pages,
  publisher: s.publisher,
  doi: s.doi,
  url: s.url,
  abstract: null,
  notes: null,
});

const libraryLabel = (s: Source) => {
  const first = s.authors[0]?.family;
  const who = !first ? "" : s.authors.length > 2 ? `${first} et al.` : s.authors.length === 2 ? `${first} & ${s.authors[1].family}` : first;
  return `${who ? `${who} (${s.year ?? "n.d."}) · ` : ""}${s.title}`.slice(0, 160);
};

async function loadLibrary(auth: Auth, projectId: string): Promise<Source[] | { error: { code?: string; message?: string } }> {
  const { data, error } = await auth.supabase.from("sources").select(LIBRARY_COLUMNS).eq("project_id", projectId).is("deleted_at", null).limit(5000);
  if (error || !data) return { error: error ?? {} };
  return data.map((row) => ({ ...(row as unknown as Source), abstract: null, authors: sanitizeAuthors(row.authors) }));
}

/** The Word file behind a shelf row, read and parsed. Errors are sentences a person can act on. */
async function readWordFile(auth: Auth, fileId: string) {
  const { data: file, error } = await auth.supabase
    .from("project_files")
    .select("project_id, name, mime_type, size_bytes, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (error) return { error: dbErrorMessage(error, "open the file") };
  if (!file) return { error: "This file isn't in the project any more." };
  if (fileKind(file.mime_type) !== "word" || !/\.docx$/i.test(file.name)) {
    return { error: "Only Word .docx files can be turned into a manuscript. Save older .doc files as .docx first." };
  }
  if (file.size_bytes > DOCX_LIMITS.bytes) return { error: "That Word file is over 25 MB, which is too large to import." };
  const download = await auth.supabase.storage.from(FILES_BUCKET).download(file.storage_path);
  if (download.error || !download.data) return { error: "Couldn't read the file right now. Try again in a moment." };
  try {
    const parsed = await parseDocx(await download.data.arrayBuffer());
    return { file, parsed };
  } catch (e) {
    if (e instanceof DocxError) return { error: e.message };
    console.error("[import] couldn't parse", fileId, e);
    return { error: "Couldn't read this Word file. It may be damaged; try opening it in Word and saving it again." };
  }
}

const defaultTitle = (parsed: ParsedDocx, name: string) => (parsed.title?.trim() || name.replace(/\.docx$/i, "")).slice(0, 200);

/**
 * Reads a Word file from the shelf and works out what importing it would do: which sources
 * its citations use, which are in the library already, and what Crossref found for typed
 * references. Nothing is saved.
 */
export async function previewWordImport(fileId: string): Promise<ImportPreviewResult> {
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "Unknown file." };
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const read = await readWordFile(auth, fileId);
  if ("error" in read) return { ok: false, error: read.error! };
  const library = await loadLibrary(auth, read.file.project_id);
  if ("error" in library) return { ok: false, error: dbErrorMessage(library.error, "check the library") };

  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  const inTime = () => Date.now() < deadline;
  const analysis = await analyzeImport(read.parsed, library, {
    search: async (reference) => (inTime() ? searchBibliographic(reference) : null),
    doi: async (doi) => {
      if (!inTime()) return null;
      const found = await lookupDoi(doi);
      return found.ok ? found.source : null;
    },
  });

  return {
    ok: true,
    preview: {
      title: defaultTitle(read.parsed, read.file.name),
      origin: analysis.origin,
      sources: analysis.sources.map((s) => ({
        key: s.key,
        status: s.status,
        fields: s.fields ? pickFields(s.fields) : null,
        libraryId: s.libraryId,
        written: s.written,
        citations: s.citations,
      })),
      citations: analysis.citations.length,
      unmatched: analysis.citations.filter((c) => c.parts.some((p) => p.sourceKey === null)).map((c) => c.text).slice(0, 100),
      kept: read.parsed.kept,
      library: library.map((s) => ({ id: s.id, label: libraryLabel(s) })),
    },
  };
}

const decisionSchema = z.discriminatedUnion("use", [
  z.object({ use: z.literal("library"), id: uuid }),
  z.object({ use: z.literal("new"), fields: z.unknown() }),
  z.object({ use: z.literal("text") }),
]);

const createSchema = z.object({
  fileId: uuid,
  requestId: uuid,
  title: z.string().trim().min(1, "Give the manuscript a title.").max(200, "Keep the title under 200 characters."),
  decisions: z.record(z.string().max(80), decisionSchema).refine((d) => Object.keys(d).length <= 2000),
});

/**
 * Creates a manuscript from a Word file on the shelf, using the person's choice for each
 * source: a library source, a new one to add, or none (its citations stay as typed text).
 * Sources it adds skip anything the library already has. Sending the same request twice
 * opens the manuscript the first one made.
 */
export async function createManuscriptFromWord(input: z.input<typeof createSchema>): Promise<CreateImportResult> {
  const parsedInput = createSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: parsedInput.error.issues[0]?.message ?? "Check the details and try again." };
  const { fileId, requestId, title, decisions } = parsedInput.data;
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const read = await readWordFile(auth, fileId);
  if ("error" in read) return { ok: false, error: read.error! };
  const projectId = read.file.project_id;
  const library = await loadLibrary(auth, projectId);
  if ("error" in library) return { ok: false, error: dbErrorMessage(library.error, "check the library") };
  const libraryIds = new Set(library.map((s) => s.id));
  const analysis = await analyzeImport(read.parsed, library, null);

  // Each source's final choice. Without one, a source the file fully describes is added and a
  // library match is used; anything else stays as text.
  const linked = new Map<string, string>();
  const toAdd: { key: string; fields: SourceFields }[] = [];
  for (const source of analysis.sources) {
    const decision = decisions[source.key];
    if (decision?.use === "text") continue;
    if (decision?.use === "library") {
      if (!libraryIds.has(decision.id)) return { ok: false, error: "One of the chosen library sources was deleted meanwhile. Check the list and try again." };
      linked.set(source.key, decision.id);
      continue;
    }
    if (!decision && source.libraryId && source.status === "library") {
      linked.set(source.key, source.libraryId);
      continue;
    }
    const raw = decision?.use === "new" ? decision.fields : source.status === "new" ? source.fields : null;
    if (!raw) continue;
    const fields = fieldsSchema.safeParse(raw);
    if (!fields.success) {
      if (decision) return { ok: false, error: `“${(raw as { title?: string }).title ?? "A source"}”: ${fields.error.issues[0]?.message}` };
      continue;
    }
    toAdd.push({ key: source.key, fields: fields.data });
  }

  const document = await supabase.from("documents").insert({ project_id: projectId, title, created_by: user.id, client_request_id: requestId }).select("id").single();
  if (document.error?.code === UNIQUE_VIOLATION) {
    const existing = await supabase.from("documents").select("id").eq("created_by", user.id).eq("client_request_id", requestId).maybeSingle();
    if (!existing.data) return { ok: false, error: "Couldn't create the manuscript. Try again in a moment." };
    return { ok: true, href: `/projects/${projectId}/documents/${existing.data.id}`, linked: 0, asText: 0, added: 0 };
  }
  if (document.error) {
    if (document.error.code === "42501") return { ok: false, error: "You don't have permission to add manuscripts to this project." };
    return { ok: false, error: dbErrorMessage(document.error, "create the manuscript") };
  }
  const documentId = document.data.id;
  const fail = async (error: string) => {
    // Half an import is worse than none; sources already added stay, as the library is shared.
    await supabase.from("documents").delete().eq("id", documentId);
    return { ok: false as const, error };
  };

  // New sources: anything the library has by DOI or title and year is reused instead.
  const byKey = new Map(library.flatMap((s) => duplicateKeys(s).map((k) => [k, s.id] as const)));
  const rows = toAdd.flatMap(({ key, fields }, i) => {
    const existing = duplicateKeys(fields).map((k) => byKey.get(k)).find(Boolean);
    if (existing) {
      linked.set(key, existing);
      return [];
    }
    duplicateKeys(fields).forEach((k) => byKey.set(k, ""));
    return [{ ...fields, project_id: projectId, created_by: user.id, client_request_id: rowRequestId(requestId, i) }];
  });
  let added = 0;
  if (rows.length > 0) {
    const batch = await supabase.from("sources").insert(rows).select("id");
    if (batch.error?.code === UNIQUE_VIOLATION) {
      // A retry, or a co-author adding one of these meanwhile: add them one by one.
      for (const row of rows) {
        const one = await supabase.from("sources").insert(row).select("id").single();
        if (one.data) added += 1;
        else if (one.error && one.error.code !== UNIQUE_VIOLATION) return fail(dbErrorMessage(one.error, "add the sources"));
      }
    } else if (batch.error) {
      return fail(batch.error.code === "42501" ? "You don't have permission to add sources to this project." : dbErrorMessage(batch.error, "add the sources"));
    } else added = batch.data.length;

    const fresh = await loadLibrary(auth, projectId);
    if ("error" in fresh) return fail(dbErrorMessage(fresh.error, "add the sources"));
    const freshByKey = new Map(fresh.flatMap((s) => duplicateKeys(s).map((k) => [k, s.id] as const)));
    for (const { key, fields } of toAdd) {
      if (linked.has(key)) continue;
      const id = duplicateKeys(fields).map((k) => freshByKey.get(k)).find(Boolean);
      if (id) linked.set(key, id);
    }
  }

  const content = assembleDocument(analysis, linked);
  const counts = { linked: 0, asText: 0 };
  for (const c of analysis.citations) {
    if (c.parts.every((p) => p.sourceKey && linked.has(p.sourceKey))) counts.linked += 1;
    else counts.asText += 1;
  }
  const seeded = await seedDocument(documentId, supabase, content, `Imported from ${read.file.name}`.slice(0, 120), user.id).catch((error) => {
    console.error("[import] couldn't write the manuscript", error);
    return false;
  });
  if (!seeded) return fail("Couldn't save the imported text. Try again in a moment.");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/library`);
  return { ok: true, href: `/projects/${projectId}/documents/${documentId}`, added, ...counts };
}
