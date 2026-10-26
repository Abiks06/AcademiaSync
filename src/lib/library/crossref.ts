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

type CrossrefWork = {
  DOI?: string;
  type?: string;
  title?: string[];
  author?: { family?: string; given?: string; name?: string }[];
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  URL?: string;
  abstract?: string;
  issued?: { "date-parts"?: (number | null)[][] };
  "published-print"?: { "date-parts"?: (number | null)[][] };
  "published-online"?: { "date-parts"?: (number | null)[][] };
};

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
};

/** Crossref returns titles and abstracts with inline HTML or JATS markup. */
function stripMarkup(text: string) {
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

function clean(value: string | undefined, max: number) {
  const text = value ? stripMarkup(value) : "";
  return text ? text.slice(0, max) : null;
}

function yearFrom(work: CrossrefWork) {
  for (const date of [work.issued, work["published-print"], work["published-online"]]) {
    const year = date?.["date-parts"]?.[0]?.[0];
    if (typeof year === "number" && year >= 1000 && year <= 2200) return year;
  }
  return null;
}

/** Turns a Crossref work into the fields of our form, ready for a person to check and save. */
export function mapCrossrefWork(work: CrossrefWork): SourceFields | null {
  const title = clean(work.title?.[0], 500);
  if (!title) return null;

  const authors: Author[] = (work.author ?? [])
    .map((a) => ({ family: (a.family ?? a.name ?? "").trim(), given: (a.given ?? "").trim() }))
    .filter((a) => a.family)
    .slice(0, 100);

  const doi = work.DOI ? normalizeDoi(work.DOI) : null;
  const url = work.URL && /^https?:\/\//.test(work.URL) ? work.URL.slice(0, 2000) : null;

  return {
    kind: KIND_BY_TYPE[work.type ?? ""] ?? "other",
    title,
    authors,
    year: yearFrom(work),
    container: clean(work["container-title"]?.[0], 300),
    volume: clean(work.volume, 40),
    issue: clean(work.issue, 40),
    pages: clean(work.page, 40),
    publisher: clean(work.publisher, 300),
    doi,
    url: doi ? null : url,
    abstract: clean(work.abstract, 10000),
    notes: null,
  };
}

export type LookupResult = { ok: true; source: SourceFields } | { ok: false; error: string };

/** Looks a DOI up on Crossref. Never throws: callers get a message they can show. */
export async function lookupDoi(input: string): Promise<LookupResult> {
  const doi = normalizeDoi(input);
  if (!doi) return { ok: false, error: "That doesn't look like a DOI. It starts with 10. and contains a slash, e.g. 10.1021/es2031505." };

  let response: Response;
  try {
    response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { Accept: "application/json", "User-Agent": "AcademiaSync/1.0 (research workspace)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Couldn't reach Crossref just now. Try again, or fill the details in by hand." };
  }
  if (response.status === 404) return { ok: false, error: "Crossref has no record of that DOI. Check it for typos, or fill the details in by hand." };
  if (!response.ok) return { ok: false, error: "Crossref had a problem. Try again in a moment, or fill the details in by hand." };

  const body = (await response.json().catch(() => null)) as { message?: CrossrefWork } | null;
  const source = body?.message ? mapCrossrefWork(body.message) : null;
  if (!source) return { ok: false, error: "Crossref's record for that DOI has no title, so it can't be used. Fill the details in by hand." };
  return { ok: true, source: { ...source, doi: source.doi ?? doi } };
}
