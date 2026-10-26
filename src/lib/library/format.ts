import type { Author, Source, SourceFields } from "./types";

type Citable = Pick<SourceFields, "title" | "authors" | "year">;

/** "Jean-Paul Sartre" -> "J.-P." */
export function initials(given: string) {
  return given
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((name) =>
      name
        .split("-")
        .filter(Boolean)
        .map((part) => `${part[0]!.toUpperCase()}.`)
        .join("-"),
    )
    .join(" ");
}

function referenceName(a: Author) {
  const i = initials(a.given);
  return i ? `${a.family}, ${i}` : a.family;
}

function formatAuthorList(authors: Author[]) {
  const names = authors.map(referenceName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  // Beyond 20 authors, list the first 19, an ellipsis and the last.
  return `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`;
}

function yearOf(s: Pick<SourceFields, "year">) {
  return s.year ?? "n.d.";
}

function shortTitle(title: string) {
  const words = title.trim().split(/\s+/);
  return words.length > 4 ? `${words.slice(0, 4).join(" ")}…` : title.trim();
}

/** What appears in the text: "Lusher, 2017", "Lusher & Hollman, 2017", "Lusher et al., 2017". */
export function inTextLabel(s: Citable) {
  const { authors } = s;
  let who: string;
  if (authors.length === 0) who = `“${shortTitle(s.title)}”`;
  else if (authors.length === 1) who = authors[0].family;
  else if (authors.length === 2) who = `${authors[0].family} & ${authors[1].family}`;
  else who = `${authors[0].family} et al.`;
  return `${who}, ${yearOf(s)}`;
}

function endWithPeriod(text: string) {
  return /[.?!…]$/.test(text) ? text : `${text}.`;
}

/** One bibliography entry in a simplified APA 7 style, as plain text. */
export function formatReference(s: SourceFields) {
  const lead = s.authors.length > 0 ? `${formatAuthorList(s.authors)} (${yearOf(s)}). ` : "";
  const dated = s.authors.length > 0 ? "" : ` (${yearOf(s)}).`;
  const parts: string[] = [`${lead}${endWithPeriod(s.title)}${dated}`];

  if (s.kind === "chapter" && s.container) {
    parts.push(`In ${s.container}${s.pages ? ` (pp. ${s.pages})` : ""}.`);
    if (s.publisher) parts.push(endWithPeriod(s.publisher));
  } else if ((s.kind === "article" || s.kind === "conference" || s.kind === "other") && s.container) {
    const volume = s.volume ? `, ${s.volume}${s.issue ? `(${s.issue})` : ""}` : "";
    const pages = s.pages ? `, ${s.pages}` : "";
    parts.push(`${s.container}${volume}${pages}.`);
  } else {
    if (s.container) parts.push(endWithPeriod(s.container));
    if (s.publisher) parts.push(endWithPeriod(s.publisher));
  }

  if (s.doi) parts.push(`https://doi.org/${s.doi}`);
  else if (s.url) parts.push(s.url);
  return parts.join(" ");
}

/** Sort key for a bibliography: first author, then year, then title. */
export function bibliographyOrder(a: SourceFields, b: SourceFields) {
  const key = (s: SourceFields) => (s.authors[0]?.family ?? s.title).toLowerCase();
  return key(a).localeCompare(key(b)) || (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title);
}

const BIBTEX_TYPE: Record<SourceFields["kind"], string> = {
  article: "article",
  book: "book",
  chapter: "incollection",
  conference: "inproceedings",
  thesis: "phdthesis",
  report: "techreport",
  web: "misc",
  dataset: "misc",
  other: "misc",
};

function bibtexValue(value: string) {
  // Braces delimit a BibTeX value, so stray ones would break the entry.
  return value.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
}

function ascii(text: string) {
  return text.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").replace(/[^a-zA-Z0-9]/g, "");
}

function citeKey(s: SourceFields) {
  const author = ascii(s.authors[0]?.family ?? s.title.split(/\s+/)[0] ?? "ref").toLowerCase() || "ref";
  const firstWord = ascii(s.title.split(/\s+/).find((w) => w.length > 3) ?? "").toLowerCase();
  return `${author}${s.year ?? ""}${firstWord}`;
}

/** BibTeX for a set of sources, with unique cite keys. */
export function toBibtex(sources: SourceFields[]) {
  const used = new Map<string, number>();
  return sources
    .map((s) => {
      const base = citeKey(s);
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      const key = seen === 0 ? base : `${base}${String.fromCharCode(96 + seen)}`;

      const fields: [string, string | number | null][] = [
        // Organisation names stay in braces so BibTeX doesn't split them like a person's name.
        ["author", s.authors.map((a) => (a.given ? `${bibtexValue(a.family)}, ${bibtexValue(a.given)}` : `{${bibtexValue(a.family)}}`)).join(" and ") || null],
        ["title", s.title],
        ["year", s.year],
        [s.kind === "article" ? "journal" : s.kind === "chapter" || s.kind === "conference" ? "booktitle" : "howpublished", s.container],
        ["volume", s.volume],
        ["number", s.issue],
        ["pages", s.pages ? s.pages.replace(/(?<!-)-(?!-)/g, "--") : null],
        ["publisher", s.publisher],
        ["doi", s.doi],
        ["url", s.url],
      ];
      const body = fields
        .filter((f): f is [string, string | number] => f[1] !== null && f[1] !== "")
        .map(([name, value]) => `  ${name} = {${name === "author" ? String(value) : bibtexValue(String(value))}}`)
        .join(",\n");
      return `@${BIBTEX_TYPE[s.kind]}{${key},\n${body}\n}`;
    })
    .join("\n\n");
}

/** Everything the search box looks at, in one lowercase string. */
export function searchText(s: Source | SourceFields) {
  return [s.title, ...s.authors.map((a) => `${a.given} ${a.family}`), s.year, s.container, s.doi, s.publisher]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
