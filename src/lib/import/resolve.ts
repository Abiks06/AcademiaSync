import type { DocJSON } from "@/lib/editor/ydoc";
import { CITATION_NODE, type CitationItem } from "@/lib/library/citations";
import { duplicateKeys } from "@/lib/library/csl-json";
import type { BibliographicMatch } from "@/lib/library/crossref";
import type { Source, SourceFields } from "@/lib/library/types";
import type { ParsedDocx, PendingCitation } from "./docx";
import { findTypedCitations, fold, parseEntry, type ReferenceEntry, type TypedCitation } from "./typed-citations";

/**
 * How sure the import is about each source:
 * - library: already in the project's library (same DOI, or same title and year)
 * - new: exact reference data from the file's citation fields, to be added
 * - matched: a typed reference that Crossref found and that agrees on first author and year
 * - suggested: Crossref's best guess, which a person must confirm
 * - unresolved: nothing reliable; its citations stay as typed text unless a person links one
 */
export type SourceStatus = "library" | "new" | "matched" | "suggested" | "unresolved";

export type ImportSource = {
  key: string;
  status: SourceStatus;
  /** What would be added, or what the library already has. Null when nothing was found. */
  fields: SourceFields | null;
  libraryId: string | null;
  /** The reference as typed in the file, for typed reference lists. */
  written: string | null;
  score: number | null;
  /** How many citations in the text point to it. */
  citations: number;
};

export type ImportAnalysis = {
  origin: "fields" | "typed" | "none";
  doc: DocJSON;
  sources: ImportSource[];
  /** Citations (by key) and which source keys each part uses; null where a part matched nothing. */
  citations: { key: number; text: string; mode: "parenthetical" | "narrative"; parts: { sourceKey: string | null; locator?: string; prefix?: string; suffix?: string }[] }[];
};

const libraryIndex = (library: Source[]) => {
  const byKey = new Map<string, Source>();
  for (const s of library) if (!s.deleted_at) for (const k of duplicateKeys(s)) byKey.set(k, s);
  return byKey;
};

const findInLibrary = (byKey: Map<string, Source>, fields: SourceFields) => {
  for (const k of duplicateKeys(fields)) if (byKey.has(k)) return byKey.get(k)!;
  return null;
};

/** The key a field citation's source is known by: its DOI, or its title and year. */
const fieldKey = (fields: SourceFields) => `f:${duplicateKeys(fields).at(-1)}`;

const words = (s: string) => new Set(fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));

/** Whether a found record is the reference as typed: same first author and year, and most title words present. */
export function agrees(entry: ReferenceEntry, found: SourceFields) {
  if (entry.year !== null && found.year !== entry.year) return false;
  const first = found.authors[0]?.family;
  if (entry.families[0] && (!first || fold(first) !== fold(entry.families[0]))) return false;
  const title = words(found.title);
  if (title.size === 0) return false;
  const inEntry = words(entry.text);
  const shared = [...title].filter((w) => inEntry.has(w)).length;
  return shared / title.size >= 0.6;
}

/** A typed entry the library already has: by DOI, or same first author and year and a title that fits. */
function libraryMatch(library: Source[], entry: ReferenceEntry) {
  const live = library.filter((s) => !s.deleted_at);
  if (entry.doi) {
    const byDoi = live.find((s) => s.doi === entry.doi);
    if (byDoi) return byDoi;
  }
  const fits = live.filter((s) => agrees(entry, s));
  return fits.length === 1 ? fits[0] : null;
}

type Lookups = {
  /** Crossref search for a typed reference. */
  search: (reference: string) => Promise<BibliographicMatch | null>;
  /** Crossref record for a DOI. */
  doi: (doi: string) => Promise<SourceFields | null>;
};

/** Crossref scores above this, with author, year and title agreeing, link without asking. */
const SURE_SCORE = 50;
/** Below this, a Crossref result isn't worth suggesting. */
const SUGGEST_SCORE = 30;
/** Typed references looked up on Crossref, at most, and how many at once. */
const MAX_LOOKUPS = 400;
const PARALLEL = 4;

async function inParallel<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Works out, for a parsed Word file, which sources its citations need and how sure we are
 * about each. Field citations need no lookups. Typed references are matched to the library
 * first, then by DOI, then by Crossref search, unless `lookups` is null (as when the
 * manuscript is finally created from a person's decisions).
 */
export async function analyzeImport(parsed: ParsedDocx, library: Source[], lookups: Lookups | null): Promise<ImportAnalysis> {
  const byKey = libraryIndex(library);

  if (parsed.citations.length > 0) {
    const sources = new Map<string, ImportSource>();
    const citations = parsed.citations.map((c: PendingCitation) => ({
      key: c.key,
      text: c.text,
      mode: c.mode,
      parts: c.items.map((item) => {
        const key = fieldKey(item.source);
        const known = sources.get(key);
        if (known) known.citations += 1;
        else {
          const existing = findInLibrary(byKey, item.source);
          sources.set(key, {
            key,
            status: existing ? "library" : "new",
            fields: existing ?? item.source,
            libraryId: existing?.id ?? null,
            written: null,
            score: null,
            citations: 1,
          });
        }
        return { sourceKey: key, locator: item.locator, prefix: item.prefix, suffix: item.suffix };
      }),
    }));
    return { origin: "fields", doc: parsed.doc, sources: [...sources.values()], citations };
  }

  const entries = parsed.referenceList.map(parseEntry);
  const typed = findTypedCitations(parsed.doc, entries);
  if (entries.length === 0 && typed.citations.length === 0) return { origin: "none", doc: parsed.doc, sources: [], citations: [] };

  const uses = new Map<number, number>();
  for (const c of typed.citations) for (const p of c.parts) if (p.entry !== null) uses.set(p.entry, (uses.get(p.entry) ?? 0) + 1);

  const sources = await inParallel(entries, PARALLEL, async (entry): Promise<ImportSource> => {
    const base = { key: `e:${entry.index}`, written: entry.text, citations: uses.get(entry.index) ?? 0, score: null };
    const existing = libraryMatch(library, entry);
    if (existing) return { ...base, status: "library", fields: existing, libraryId: existing.id };
    if (!lookups || entry.index >= MAX_LOOKUPS) return { ...base, status: "unresolved", fields: null, libraryId: null };
    if (entry.doi) {
      const found = await lookups.doi(entry.doi);
      if (found) {
        const inLibrary = findInLibrary(byKey, found);
        return inLibrary
          ? { ...base, status: "library", fields: inLibrary, libraryId: inLibrary.id }
          : { ...base, status: agrees(entry, found) ? "matched" : "suggested", fields: found, libraryId: null };
      }
    }
    const match = await lookups.search(entry.text);
    if (!match || match.score < SUGGEST_SCORE) return { ...base, status: "unresolved", fields: null, libraryId: null };
    const inLibrary = findInLibrary(byKey, match.source);
    const sure = match.score >= SURE_SCORE && agrees(entry, match.source);
    if (inLibrary && sure) return { ...base, status: "library", fields: inLibrary, libraryId: inLibrary.id, score: match.score };
    return { ...base, status: sure ? "matched" : "suggested", fields: match.source, libraryId: inLibrary?.id ?? null, score: match.score };
  });

  const citations = typed.citations.map((c: TypedCitation) => ({
    key: c.key,
    text: c.text,
    mode: c.mode,
    parts: c.parts.map((p) => ({ sourceKey: p.entry === null ? null : `e:${p.entry}`, locator: p.locator, prefix: p.prefix })),
  }));
  return { origin: "typed", doc: typed.doc, sources, citations };
}

/**
 * The finished manuscript: each pending citation becomes a real citation of library sources,
 * or, if any of its parts has no source, goes back to the text it had in the file. A wrong
 * link is worse than a missing one.
 */
export function assembleDocument(analysis: ImportAnalysis, sourceIds: Map<string, string>): DocJSON {
  const byKey = new Map(analysis.citations.map((c) => [c.key, c]));
  const swap = (node: DocJSON): DocJSON[] => {
    if (node.type === CITATION_NODE) {
      const c = byKey.get(Number(node.attrs?.pending));
      if (!c) return [];
      const items: CitationItem[] = [];
      for (const part of c.parts) {
        const sourceId = part.sourceKey ? sourceIds.get(part.sourceKey) : undefined;
        if (!sourceId) return [{ type: "text", text: c.text }];
        items.push({ sourceId, ...(part.locator && { locator: part.locator }), ...(part.prefix && { prefix: part.prefix }), ...(part.suffix && { suffix: part.suffix }) });
      }
      return [{ type: CITATION_NODE, attrs: { items: items.slice(0, 20), mode: c.mode, label: c.text } }];
    }
    if (!node.content) return [node];
    const content: DocJSON[] = [];
    for (const child of node.content.flatMap(swap)) {
      const last = content.at(-1);
      // Text put back next to text with the same marks joins it.
      if (child.type === "text" && last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(child.marks ?? [])) {
        content[content.length - 1] = { ...last, text: (last.text ?? "") + (child.text ?? "") };
      } else content.push(child);
    }
    return [{ ...node, content }];
  };
  return swap(analysis.doc)[0];
}
