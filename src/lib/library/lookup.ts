import { clean, FIELD_LIMITS, lookupDoi, normalizeDoi, politeUserAgent, readCapped, type LookupResult } from "./crossref";
import type { Author } from "./types";

/** What a pasted identifier is: a DOI, an arXiv id, or a PubMed id. */
export type Identifier = { kind: "doi" | "arxiv" | "pubmed"; id: string };

const ARXIV_NEW = /^(\d{4}\.\d{4,5})(v\d+)?$/;
const ARXIV_OLD = /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/i;

export function detectIdentifier(input: string): Identifier | null {
  const text = input.trim();
  const doi = normalizeDoi(text);
  if (doi) {
    // arXiv's own DOIs resolve better through arXiv.
    const arxivDoi = doi.match(/^10\.48550\/arxiv\.(.+)$/);
    return arxivDoi ? { kind: "arxiv", id: arxivDoi[1] } : { kind: "doi", id: doi };
  }
  const arxiv = text.replace(/^(?:https?:\/\/)?(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i, "").replace(/^arxiv:\s*/i, "").replace(/\.pdf$/i, "");
  const a = arxiv.match(ARXIV_NEW) ?? arxiv.match(ARXIV_OLD);
  if (a) return { kind: "arxiv", id: a[1] };
  const pmid = text.replace(/^(?:https?:\/\/)?pubmed\.ncbi\.nlm\.nih\.gov\//i, "").replace(/^pmid:?\s*/i, "").replace(/\/$/, "");
  if (/^\d{1,9}$/.test(pmid)) return { kind: "pubmed", id: pmid };
  return null;
}

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function splitName(full: string): Author {
  const words = full.trim().split(/\s+/);
  if (words.length === 1) return { family: words[0], given: "" };
  return { family: words[words.length - 1], given: words.slice(0, -1).join(" ") };
}

/** Maps one arXiv Atom entry. Exported for tests. */
export function mapArxivEntry(xml: string, id: string): LookupResult {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  const tag = (name: string, scope = entry ?? "") => scope.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
  const title = entry ? clean(decodeXml(tag("title") ?? ""), FIELD_LIMITS.title) : null;
  if (!entry || !title || /^Error$/i.test(title)) return { ok: false, error: "arXiv has no paper with that id. Check it for typos." };
  const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
    .map((m) => splitName(clean(decodeXml(m[1]), FIELD_LIMITS.name * 2) ?? ""))
    .filter((a) => a.family)
    .map((a) => ({ family: a.family.slice(0, FIELD_LIMITS.name), given: a.given.slice(0, FIELD_LIMITS.name) }))
    .slice(0, 100);
  const published = tag("published");
  const year = published ? Number(published.slice(0, 4)) : NaN;
  const doi = tag("arxiv:doi");
  return {
    ok: true,
    source: {
      kind: "article",
      title,
      authors,
      year: year >= 1990 && year <= 2200 ? year : null,
      container: "arXiv",
      volume: null,
      issue: null,
      pages: null,
      publisher: null,
      doi: doi ? normalizeDoi(decodeXml(doi)) : normalizeDoi(`10.48550/arXiv.${id}`),
      url: null,
      abstract: clean(decodeXml(tag("summary") ?? ""), FIELD_LIMITS.abstract),
      notes: `arXiv:${id}`,
    },
  };
}

async function lookupArxiv(id: string): Promise<LookupResult> {
  let text: string | null;
  try {
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`, {
      headers: { "User-Agent": politeUserAgent() },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, error: "arXiv had a problem. Try again in a moment, or fill the details in by hand." };
    text = await readCapped(response);
  } catch {
    return { ok: false, error: "Couldn't reach arXiv just now. Try again, or fill the details in by hand." };
  }
  return text ? mapArxivEntry(text, id) : { ok: false, error: "arXiv sent something we couldn't read." };
}

/** Maps a PubMed esummary record. Exported for tests. */
export function mapPubmedSummary(body: unknown, pmid: string): LookupResult {
  const record = (body as { result?: Record<string, unknown> } | null)?.result?.[pmid] as Record<string, unknown> | undefined;
  const title = record ? clean(record.title, FIELD_LIMITS.title)?.replace(/\.$/, "") : null;
  if (!record || !title) return { ok: false, error: "PubMed has no article with that id. Check it for typos." };
  const authors = (Array.isArray(record.authors) ? record.authors : [])
    .flatMap((a) => {
      const name = clean((a as Record<string, unknown>)?.name, FIELD_LIMITS.name * 2);
      if (!name) return [];
      // PubMed writes "Lusher AL": family name, then initials.
      const [family, ...rest] = name.split(" ");
      return [{ family: family.slice(0, FIELD_LIMITS.name), given: rest.join(" ").slice(0, FIELD_LIMITS.name) }];
    })
    .slice(0, 100);
  const year = Number(String(record.pubdate ?? "").slice(0, 4));
  const ids = Array.isArray(record.articleids) ? (record.articleids as Record<string, unknown>[]) : [];
  const doiValue = ids.find((i) => i?.idtype === "doi")?.value;
  return {
    ok: true,
    source: {
      kind: "article",
      title,
      authors,
      year: year >= 1000 && year <= 2200 ? year : null,
      container: clean(record.fulljournalname, FIELD_LIMITS.container) ?? clean(record.source, FIELD_LIMITS.container),
      volume: clean(record.volume, FIELD_LIMITS.short),
      issue: clean(record.issue, FIELD_LIMITS.short),
      pages: clean(record.pages, FIELD_LIMITS.short),
      publisher: null,
      doi: typeof doiValue === "string" ? normalizeDoi(doiValue) : null,
      url: typeof doiValue === "string" && normalizeDoi(doiValue) ? null : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      abstract: null,
      notes: `PMID: ${pmid}`,
    },
  };
}

async function lookupPubmed(pmid: string): Promise<LookupResult> {
  let body: unknown = null;
  try {
    const response = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(pmid)}`,
      { headers: { "User-Agent": politeUserAgent() }, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!response.ok) return { ok: false, error: "PubMed had a problem. Try again in a moment, or fill the details in by hand." };
    const text = await readCapped(response);
    body = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, error: "Couldn't reach PubMed just now. Try again, or fill the details in by hand." };
  }
  return mapPubmedSummary(body, pmid);
}

// Metadata for an identifier rarely changes, so repeat lookups in one server instance are free.
const cache = new Map<string, { at: number; result: LookupResult }>();
const CACHE_MS = 24 * 60 * 60_000;

/** Looks up a DOI, arXiv id or PubMed id. Never throws. */
export async function lookupIdentifier(input: string): Promise<LookupResult> {
  const ident = detectIdentifier(input);
  if (!ident) {
    return { ok: false, error: "Paste a DOI (10.1021/…), an arXiv id (2101.01234) or a PubMed id (12345678)." };
  }
  const key = `${ident.kind}:${ident.id.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const result =
    ident.kind === "doi" ? await lookupDoi(ident.id) : ident.kind === "arxiv" ? await lookupArxiv(ident.id) : await lookupPubmed(ident.id);
  if (result.ok) {
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), result });
  }
  return result;
}
