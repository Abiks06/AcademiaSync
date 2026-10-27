import { mapCrossrefWork } from "./crossref";
import type { SourceFields, SourceKind } from "./types";

/** CSL-JSON (what BibTeX and RIS parse into) is close enough to Crossref's format to share its mapper. */
export function mapCslItem(item: unknown): SourceFields | null {
  return mapCrossrefWork(item);
}

const CSL_TYPE: Record<SourceKind, string> = {
  article: "article-journal",
  book: "book",
  chapter: "chapter",
  conference: "paper-conference",
  thesis: "thesis",
  report: "report",
  web: "webpage",
  dataset: "dataset",
  other: "document",
};

/** A source as CSL-JSON, for formatting a bibliography with a CSL style. */
export function toCslItem(id: string, s: SourceFields) {
  return {
    id,
    type: CSL_TYPE[s.kind],
    title: s.title,
    // A source with no given name is usually an organisation, which CSL prints as written.
    author: s.authors.map((a) => (a.given ? { family: a.family, given: a.given } : { literal: a.family })),
    ...(s.year ? { issued: { "date-parts": [[s.year]] } } : {}),
    ...(s.container ? { "container-title": s.container } : {}),
    ...(s.volume ? { volume: s.volume } : {}),
    ...(s.issue ? { issue: s.issue } : {}),
    ...(s.pages ? { page: s.pages } : {}),
    ...(s.publisher ? { publisher: s.publisher } : {}),
    ...(s.doi ? { DOI: s.doi } : {}),
    ...(s.url ? { URL: s.url } : {}),
  };
}

/** Lowercase letters and digits only, so "The  Title." and "the title" match. */
function titleKey(title: string) {
  return title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

/** Matches a source already in the library: the same DOI, or the same title and year. */
export function duplicateKeys(s: Pick<SourceFields, "doi" | "title" | "year">) {
  const keys = [`t:${titleKey(s.title)}:${s.year ?? ""}`];
  if (s.doi) keys.push(`d:${s.doi}`);
  return keys;
}
