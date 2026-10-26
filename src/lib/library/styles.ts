import type { CitationItem, CitationMode } from "./citations";
import type { SourceFields } from "./types";

export const CITATION_STYLES = ["apa", "harvard", "chicago", "ieee", "vancouver"] as const;
export type CitationStyle = (typeof CITATION_STYLES)[number];

export const STYLE_LABEL: Record<CitationStyle, string> = {
  apa: "APA 7",
  harvard: "Harvard (Cite Them Right)",
  chicago: "Chicago (author-date)",
  ieee: "IEEE",
  vancouver: "Vancouver",
};

export function isCitationStyle(value: unknown): value is CitationStyle {
  return typeof value === "string" && (CITATION_STYLES as readonly string[]).includes(value);
}

/** Numeric styles number sources by first appearance; the others cite author and year. */
export function isNumericStyle(style: CitationStyle) {
  return style === "ieee" || style === "vancouver";
}

type Citable = Pick<SourceFields, "title" | "authors" | "year">;

/** What a document's citations need to know about the whole set of cited sources. */
export type CiteContext = {
  style: CitationStyle;
  lookup: (id: string) => Citable | undefined;
  /** 1-based numbers in order of first appearance, for numeric styles. */
  numbers: Map<string, number>;
  /** "a", "b"… when two cited works share authors and year, for author-date styles. */
  suffixes: Map<string, string>;
};

function shortTitle(title: string) {
  const words = title.trim().split(/\s+/);
  return words.length > 4 ? `${words.slice(0, 4).join(" ")}…` : title.trim();
}

/** The author part of an author-date citation, e.g. "Lusher & Hollman" or "Lusher et al.". */
export function authorNames(s: Citable, style: CitationStyle, mode: CitationMode = "parenthetical") {
  const names = s.authors.map((a) => a.family);
  if (names.length === 0) return `“${shortTitle(s.title)}”`;
  const and = style === "apa" && mode === "parenthetical" ? "&" : "and";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  // Chicago lists up to three authors; APA and Harvard shorten from three.
  if (style === "chicago" && names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names[0]} et al.`;
}

function disambiguationKey(s: Citable) {
  return `${s.authors.map((a) => a.family.toLowerCase()).join("|") || s.title.toLowerCase()}#${s.year ?? "nd"}`;
}

/** Numbers and year suffixes for the sources a document cites, in order of first appearance. */
export function citeContext(style: CitationStyle, citedIds: string[], lookup: (id: string) => Citable | undefined): CiteContext {
  const numbers = new Map(citedIds.map((id, i) => [id, i + 1]));
  const groups = new Map<string, { id: string; title: string }[]>();
  for (const id of citedIds) {
    const s = lookup(id);
    if (!s) continue;
    const key = disambiguationKey(s);
    groups.set(key, [...(groups.get(key) ?? []), { id, title: s.title }]);
  }
  const suffixes = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((g, i) => suffixes.set(g.id, String.fromCharCode(97 + (i % 26))));
  }
  return { style, lookup, numbers, suffixes };
}

/** "45" reads as a page, "45-50" as pages; anything else ("ch. 3", "fig. 2") is shown as typed. */
function formatLocator(locator: string, style: CitationStyle) {
  const bare = /^\d+$/.test(locator);
  const range = /^\d+\s*[-–]\s*\d+$/.test(locator);
  if (!bare && !range) return locator;
  const pages = locator.replace(/\s*[-–]\s*/, "–");
  if (style === "chicago") return pages;
  return `${range ? "pp." : "p."} ${pages}`;
}

function wrap(prefix: string | undefined, body: string, suffix: string | undefined) {
  return `${prefix ? `${prefix} ` : ""}${body}${suffix ? ` ${suffix}` : ""}`;
}

/** Collapses [1, 2, 3, 5] to "1–3, 5". */
function numberList(nums: number[], separator: string) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join(separator));
    i = j;
  }
  return runs.join(separator);
}

/**
 * The text of one in-text citation in the document's style, e.g. "(Lusher, 2017, p. 4)",
 * "Lusher (2017)", "[3]" or "(1–3)". Sources the library doesn't have show as "?".
 */
export function formatCitation(items: CitationItem[], mode: CitationMode, ctx: CiteContext) {
  if (items.length === 0) return "(?)";
  const { style } = ctx;

  if (isNumericStyle(style)) {
    const [open, close] = style === "ieee" ? ["[", "]"] : ["(", ")"];
    const simple = items.every((i) => !i.locator && !i.prefix && !i.suffix);
    const nums = items.map((i) => ctx.numbers.get(i.sourceId));
    let refs: string;
    if (simple && nums.every((n): n is number => n !== undefined)) {
      refs = style === "ieee" && nums.length > 1 ? numberList(nums, "], [").replace(/–/g, "]–[") : numberList(nums, ",");
      refs = `${open}${refs}${close}`;
    } else {
      refs = items
        .map((i) => {
          const n = ctx.numbers.get(i.sourceId) ?? "?";
          return `${open}${wrap(i.prefix, `${n}${i.locator ? `, ${formatLocator(i.locator, style)}` : ""}`, i.suffix)}${close}`;
        })
        .join(style === "ieee" ? ", " : "");
    }
    if (mode === "narrative") {
      const first = ctx.lookup(items[0].sourceId);
      return first ? `${authorNames(first, style, "narrative")} ${refs}` : refs;
    }
    return refs;
  }

  const comma = style === "chicago" ? "" : ",";
  const parts = items.map((item) => {
    const s = ctx.lookup(item.sourceId);
    if (!s) return { names: "?", date: "", item };
    const date = `${s.year ?? "n.d."}${ctx.suffixes.get(item.sourceId) ?? ""}`;
    return { names: authorNames(s, style, mode), date, item };
  });

  if (mode === "narrative") {
    return parts
      .map(({ names, date, item }) => {
        const inner = [date, item.locator && formatLocator(item.locator, style)].filter(Boolean).join(", ");
        return wrap(item.prefix, `${names} (${inner || "?"})`, item.suffix);
      })
      .join("; ");
  }

  const inner = parts
    .map(({ names, date, item }) => {
      const body = date ? `${names}${comma} ${date}` : names;
      const located = item.locator ? `${body}, ${formatLocator(item.locator, style)}` : body;
      return wrap(item.prefix, located, item.suffix);
    })
    .join("; ");
  return `(${inner})`;
}
