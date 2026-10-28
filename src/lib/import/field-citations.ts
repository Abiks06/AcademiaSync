import { DOMParser, type Document as XDocument, type Element as XElement } from "@xmldom/xmldom";
import { mapCslItem } from "@/lib/library/csl-json";
import { FIELD_LIMITS, normalizeDoi } from "@/lib/library/crossref";
import type { Author, SourceFields, SourceKind } from "@/lib/library/types";

/** One source in a citation read from a Word file, with what the citation said about it. */
export type FieldItem = {
  source: SourceFields;
  locator?: string;
  prefix?: string;
  suffix?: string;
  /** Zotero's "Smith (2020)": the name is typed before the citation, which shows only the year. */
  suppressAuthor?: boolean;
  /** EndNote's "Smith (2020)": the citation itself shows the name and the year. */
  authorYear?: boolean;
};

/** Zotero and Mendeley store each cited item as CSL-JSON, the format BibTeX import already reads. */
export function cslToSource(itemData: unknown): SourceFields | null {
  return mapCslItem(itemData);
}

const cut = (value: string | null | undefined, max: number) => {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
};

/** "Smith, John A." or "John A. Smith" or an organisation. */
function personFrom(text: string): Author | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes(",")) {
    const [family, ...given] = t.split(",");
    return { family: family.trim().slice(0, FIELD_LIMITS.name), given: given.join(",").trim().slice(0, FIELD_LIMITS.name) };
  }
  const words = t.split(" ");
  if (words.length === 1) return { family: t.slice(0, FIELD_LIMITS.name), given: "" };
  return { family: words.at(-1)!.slice(0, FIELD_LIMITS.name), given: words.slice(0, -1).join(" ").slice(0, FIELD_LIMITS.name) };
}

const ENDNOTE_KIND: Record<string, SourceKind> = {
  "journal article": "article",
  "magazine article": "article",
  "newspaper article": "article",
  "electronic article": "article",
  book: "book",
  "edited book": "book",
  "electronic book": "book",
  "book section": "chapter",
  "electronic book section": "chapter",
  "conference paper": "conference",
  "conference proceedings": "conference",
  thesis: "thesis",
  report: "report",
  "government document": "report",
  "web page": "web",
  dataset: "dataset",
};

const text = (el: XElement | undefined | null) => el?.textContent ?? "";
const first = (root: XElement, path: string[]) => {
  let nodes: XElement[] = [root];
  for (const name of path) nodes = nodes.flatMap((n) => [...n.getElementsByTagName(name)] as XElement[]);
  return nodes[0];
};

function parse(xml: string): XDocument | null {
  if (/<!DOCTYPE/i.test(xml.slice(0, 2000))) return null;
  let failed = false;
  const doc = new DOMParser({ onError: (level) => void (level === "fatalError" && (failed = true)) }).parseFromString(xml, "application/xml");
  return failed ? null : doc;
}

/**
 * EndNote keeps each citation as <EndNote><Cite>…<record>…</record></Cite></EndNote>,
 * with the whole reference in the record.
 */
export function endnoteToSources(xml: string): FieldItem[] {
  const doc = parse(xml);
  if (!doc) return [];
  return ([...doc.getElementsByTagName("Cite")] as XElement[]).flatMap((cite) => {
    const record = cite.getElementsByTagName("record")[0] as XElement | undefined;
    if (!record) return [];
    const title = cut(text(first(record, ["titles", "title"])), FIELD_LIMITS.title);
    if (!title) return [];
    const authors = ([...record.getElementsByTagName("author")] as XElement[])
      .filter((a) => a.parentNode && (a.parentNode as XElement).nodeName === "authors" && ((a.parentNode.parentNode as XElement)?.nodeName ?? "") === "contributors")
      .map((a) => personFrom(text(a)))
      .filter((a): a is Author => a !== null)
      .slice(0, 100);
    const year = Number(text(first(record, ["dates", "year"])).trim().slice(0, 4));
    const doiText = text(first(record, ["electronic-resource-num"]));
    const doi = doiText ? normalizeDoi(doiText) : null;
    const kind = ENDNOTE_KIND[(record.getElementsByTagName("ref-type")[0] as XElement | undefined)?.getAttribute("name")?.toLowerCase() ?? ""] ?? "other";
    const container = cut(text(first(record, ["titles", "secondary-title"])) || text(first(record, ["periodical", "full-title"])), FIELD_LIMITS.container);
    const url = text(first(record, ["urls", "url"])).trim();
    const pages = cut(text(first(cite, ["Pages"])), FIELD_LIMITS.short)?.replace(/^p{1,2}\.\s*/, "");
    const source: SourceFields = {
      kind,
      title,
      authors,
      year: year >= 1000 && year <= 2200 ? year : null,
      container,
      volume: cut(text(first(record, ["volume"])), FIELD_LIMITS.short),
      issue: cut(text(first(record, ["number"])), FIELD_LIMITS.short),
      pages: cut(text(first(record, ["pages"])), FIELD_LIMITS.short),
      publisher: cut(text(first(record, ["publisher"])), FIELD_LIMITS.publisher),
      doi,
      url: !doi && /^https?:\/\//i.test(url) ? url.slice(0, FIELD_LIMITS.url) : null,
      abstract: null,
      notes: null,
    };
    const prefix = cut(text(first(cite, ["Prefix"])), 60)?.replace(/`/g, "") ?? undefined;
    const suffix = cut(text(first(cite, ["Suffix"])), 60)?.replace(/`/g, "") ?? undefined;
    return [{ source, locator: pages ?? undefined, prefix, suffix, authorYear: cite.getAttribute("AuthorYear") === "1" }];
  });
}

const WORD_KIND: Record<string, SourceKind> = {
  JournalArticle: "article",
  ArticleInAPeriodical: "article",
  Book: "book",
  BookSection: "chapter",
  ConferenceProceedings: "conference",
  Report: "report",
  InternetSite: "web",
  DocumentFromInternetSite: "web",
};

/** Word's own citation tool: <b:Sources><b:Source><b:Tag>Smi20</b:Tag>… in a custom XML part. */
export function wordSourcesToSources(doc: XDocument): Map<string, SourceFields> {
  const B = "http://schemas.openxmlformats.org/officeDocument/2006/bibliography";
  const out = new Map<string, SourceFields>();
  const get = (el: XElement, name: string) => text(el.getElementsByTagNameNS(B, name)[0] as XElement | undefined);
  for (const s of [...doc.getElementsByTagNameNS(B, "Source")] as XElement[]) {
    const tag = get(s, "Tag").trim();
    const title = cut(get(s, "Title"), FIELD_LIMITS.title);
    if (!tag || !title) continue;
    const authorBlock = ([...s.getElementsByTagNameNS(B, "Author")] as XElement[]).find((a) => (a.parentNode as XElement)?.localName === "Author");
    const people = authorBlock ? ([...authorBlock.getElementsByTagNameNS(B, "Person")] as XElement[]) : [];
    const corporate = authorBlock ? get(authorBlock, "Corporate") : "";
    const authors: Author[] = people.length
      ? people.map((p) => ({ family: get(p, "Last").trim().slice(0, FIELD_LIMITS.name), given: [get(p, "First"), get(p, "Middle")].join(" ").trim().slice(0, FIELD_LIMITS.name) })).filter((a) => a.family)
      : corporate
        ? [{ family: corporate.trim().slice(0, FIELD_LIMITS.name), given: "" }]
        : [];
    const year = Number(get(s, "Year").trim().slice(0, 4));
    const doi = normalizeDoi(get(s, "DOI"));
    const url = get(s, "URL").trim();
    out.set(tag, {
      kind: WORD_KIND[get(s, "SourceType")] ?? "other",
      title,
      authors: authors.slice(0, 100),
      year: year >= 1000 && year <= 2200 ? year : null,
      container: cut(get(s, "JournalName") || get(s, "BookTitle") || get(s, "PeriodicalTitle") || get(s, "ConferenceName"), FIELD_LIMITS.container),
      volume: cut(get(s, "Volume"), FIELD_LIMITS.short),
      issue: cut(get(s, "Issue"), FIELD_LIMITS.short),
      pages: cut(get(s, "Pages"), FIELD_LIMITS.short),
      publisher: cut(get(s, "Publisher"), FIELD_LIMITS.publisher),
      doi,
      url: !doi && /^https?:\/\//i.test(url) ? url.slice(0, FIELD_LIMITS.url) : null,
      abstract: null,
      notes: null,
    });
  }
  return out;
}
