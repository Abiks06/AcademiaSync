import type { Author, SourceFields, SourceKind } from "./types";

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

/** Accepts "10.1/x", "doi:10.1/x" and "https://doi.org/10.1/x"; returns the bare lowercase DOI or null. */
export function normalizeDoi(input: string) {
  const bare = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return DOI_PATTERN.test(bare) ? bare : null;
}

/** Longest values the library accepts, mirrored from the save schema and the database checks. */
export const FIELD_LIMITS = { title: 500, name: 100, container: 300, short: 40, publisher: 300, abstract: 10000, url: 2000 } as const;

const KIND_BY_TYPE: Record<string, SourceKind> = {
  "journal-article": "article",
  "posted-content": "article",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "book-chapter": "chapter",
  "book-part": "chapter",
  "book-section": "chapter",
  "proceedings-article": "conference",
  dissertation: "thesis",
  report: "report",
  "report-component": "report",
  dataset: "dataset",
  // CSL-JSON names, used by BibTeX and RIS imports.
  "article-journal": "article",
  "article-magazine": "article",
  "article-newspaper": "article",
  article: "article",
  chapter: "chapter",
  "paper-conference": "conference",
  thesis: "thesis",
  webpage: "web",
  "post-weblog": "web",
};

/** Crossref returns titles and abstracts with inline HTML or JATS markup. */
export function stripMarkup(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** A string from a record field that may be a string, a list of strings, or junk. */
function str(value: unknown) {
  if (Array.isArray(value)) value = value.find((v) => typeof v === "string");
  return typeof value === "string" ? value : undefined;
}

export function clean(value: unknown, max: number) {
  const raw = str(value);
  const text = raw ? stripMarkup(raw) : "";
  return text ? text.slice(0, max) : null;
}

function yearFrom(work: Record<string, unknown>) {
  for (const key of ["issued", "published-print", "published-online"]) {
    const parts = (work[key] as { "date-parts"?: unknown } | undefined)?.["date-parts"];
    const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined;
    if (typeof year === "number" && year >= 1000 && year <= 2200) return year;
  }
  return null;
}

function authorsFrom(value: unknown): Author[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((a) => {
      if (typeof a !== "object" || a === null) return [];
      const r = a as Record<string, unknown>;
      const family = clean(r.family, FIELD_LIMITS.name) ?? clean(r.name, FIELD_LIMITS.name) ?? clean(r.literal, FIELD_LIMITS.name) ?? "";
      const given = clean(r.given, FIELD_LIMITS.name) ?? "";
      return family ? [{ family, given }] : [];
    })
    .slice(0, 100);
}

/**
 * Turns a Crossref work into the fields of our form, ready for a person to check and save.
 * Records come from outside, so every field is checked and trimmed to what saving accepts.
 */
export function mapCrossrefWork(work: unknown): SourceFields | null {
  if (typeof work !== "object" || work === null) return null;
  const w = work as Record<string, unknown>;
  const title = clean(w.title, FIELD_LIMITS.title);
  if (!title) return null;

  const rawDoi = str(w.DOI);
  const doi = rawDoi ? normalizeDoi(rawDoi) : null;
  const rawUrl = str(w.URL);
  const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl.slice(0, FIELD_LIMITS.url) : null;

  return {
    kind: KIND_BY_TYPE[str(w.type) ?? ""] ?? "other",
    title,
    authors: authorsFrom(w.author),
    year: yearFrom(w),
    container: clean(w["container-title"], FIELD_LIMITS.container),
    volume: clean(w.volume, FIELD_LIMITS.short),
    issue: clean(w.issue, FIELD_LIMITS.short),
    pages: clean(w.page, FIELD_LIMITS.short),
    publisher: clean(w.publisher, FIELD_LIMITS.publisher),
    doi,
    url: doi ? null : url,
    abstract: clean(w.abstract, FIELD_LIMITS.abstract),
    notes: null,
  };
}

export type LookupResult = { ok: true; source: SourceFields } | { ok: false; error: string };

/** Crossref asks callers to say who they are, which also gets faster, politer service. */
export function politeUserAgent() {
  const mailto = process.env.CROSSREF_MAILTO;
  return `AcademiaSync/1.0 (research workspace${mailto ? `; mailto:${mailto}` : ""})`;
}

/** Reads a response body, refusing anything larger than a metadata record should be. */
export async function readCapped(response: Response, maxBytes = 2_000_000) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) return null;
  const text = await response.text();
  return text.length > maxBytes ? null : text;
}

/** Looks a DOI up on Crossref. Never throws: callers get a message they can show. */
export async function lookupDoi(input: string): Promise<LookupResult> {
  const doi = normalizeDoi(input);
  if (!doi) return { ok: false, error: "That doesn't look like a DOI. It starts with 10. and contains a slash, e.g. 10.1021/es2031505." };

  let response: Response;
  try {
    response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": politeUserAgent() },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach Crossref just now. Try again, or fill the details in by hand." };
  }
  if (response.status === 404) return { ok: false, error: "Crossref has no record of that DOI. Check it for typos, or fill the details in by hand." };
  if (response.status === 429) return { ok: false, error: "Crossref is busy. Wait a few seconds and try again." };
  if (!response.ok) return { ok: false, error: "Crossref had a problem. Try again in a moment, or fill the details in by hand." };

  let body: { message?: unknown } | null = null;
  try {
    const text = await readCapped(response);
    body = text ? (JSON.parse(text) as { message?: unknown }) : null;
  } catch {
    body = null;
  }
  const source = body?.message ? mapCrossrefWork(body.message) : null;
  if (!source) return { ok: false, error: "Crossref's record for that DOI has no title, so it can't be used. Fill the details in by hand." };
  return { ok: true, source: { ...source, doi: source.doi ?? doi } };
}

export type BibliographicMatch = { source: SourceFields; score: number };

/**
 * Crossref's best match for a reference as typed, with its relevance score, or null.
 * Never throws: a failed search just means no suggestion.
 */
export async function searchBibliographic(reference: string): Promise<BibliographicMatch | null> {
  const query = reference.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (query.length < 15) return null;
  try {
    const params = new URLSearchParams({ "query.bibliographic": query, rows: "1", select: "DOI,title,author,issued,container-title,volume,issue,page,publisher,type,URL,score" });
    const response = await fetch(`https://api.crossref.org/works?${params}`, {
      headers: { Accept: "application/json", "User-Agent": politeUserAgent() },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const text = await readCapped(response);
    const item = text ? (JSON.parse(text) as { message?: { items?: unknown[] } }).message?.items?.[0] : null;
    const source = item ? mapCrossrefWork(item) : null;
    const score = Number((item as { score?: unknown } | null)?.score);
    return source && Number.isFinite(score) ? { source, score } : null;
  } catch {
    return null;
  }
}
