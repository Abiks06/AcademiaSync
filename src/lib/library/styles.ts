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

/** How much of a source's author list an author-date citation shows. */
type NameForm = {
  /** How many names are written before "et al.". */
  count: number;
  /** Per written name: family name only, with initials ("J. Smith") or with the full given name. */
  given: ("none" | "initials" | "full")[];
};

/** What a document's citations need to know about the whole set of cited sources. */
export type CiteContext = {
  style: CitationStyle;
  lookup: (id: string) => Citable | undefined;
  /** 1-based numbers in order of first appearance, for numeric styles. */
  numbers: Map<string, number>;
  /** "a", "b"… when two cited works would otherwise read the same, for author-date styles. */
  suffixes: Map<string, string>;
  /** Extra names or initials that tell apart works whose citations would otherwise read the same. */
  forms: Map<string, NameForm>;
};

type AuthorDateStyle = Exclude<CitationStyle, "ieee" | "vancouver">;

/**
 * The citation rules from each style's CSL file (src/lib/library/csl), so the in-text
 * citations agree with the reference list that citeproc formats from the same file.
 */
const RULES: Record<AuthorDateStyle, {
  etAlMin: number;
  etAlUseFirst: number;
  /** CSL's givenname-disambiguation-rule. */
  givenRule: "primary-name-with-initials" | "primary-name" | "by-cite";
  and: string;
  /** A comma before "and" with three or more names. */
  serialComma: boolean;
  /** Between the names and the year. */
  yearSeparator: string;
  noDate: string;
  /** Between "n.d." and its a/b suffix. */
  noDateSuffix: string;
  /** How several works in one citation are ordered. */
  sort: "author" | "year" | "none";
}> = {
  apa: { etAlMin: 3, etAlUseFirst: 1, givenRule: "primary-name-with-initials", and: "&", serialComma: true, yearSeparator: ", ", noDate: "n.d.", noDateSuffix: "-", sort: "author" },
  harvard: { etAlMin: 4, etAlUseFirst: 1, givenRule: "by-cite", and: "and", serialComma: false, yearSeparator: ", ", noDate: "no date", noDateSuffix: " ", sort: "year" },
  chicago: { etAlMin: 3, etAlUseFirst: 1, givenRule: "primary-name", and: "and", serialComma: true, yearSeparator: " ", noDate: "n.d.", noDateSuffix: "-", sort: "none" },
};

function shortTitle(title: string) {
  const words = title.trim().split(/\s+/);
  return words.length > 4 ? `${words.slice(0, 4).join(" ")}…` : title.trim();
}

/** "Jean-Paul" → "J.-P.", "John Paul" → "J. P." */
export function initials(given: string) {
  return given
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.split("-").map((p) => (p ? `${p[0].toUpperCase()}.` : "")).join("-"))
    .join(" ");
}

function defaultForm(s: Citable, style: AuthorDateStyle): NameForm {
  const { etAlMin, etAlUseFirst } = RULES[style];
  const count = s.authors.length >= etAlMin ? etAlUseFirst : s.authors.length;
  return { count, given: Array(count).fill("none") };
}

function writtenName(author: Citable["authors"][number], given: NameForm["given"][number]) {
  if (given === "none" || !author.given.trim()) return author.family;
  return `${given === "full" ? author.given.trim() : initials(author.given)} ${author.family}`;
}

/** The author part of an author-date citation, e.g. "Lusher & Hollman" or "Lusher et al.". */
export function authorNames(s: Citable, style: CitationStyle, mode: CitationMode = "parenthetical", form?: NameForm) {
  if (s.authors.length === 0) return `“${shortTitle(s.title)}”`;
  // Numeric styles name authors only in narrative citations, and do it the APA way.
  const rules = RULES[isNumericStyle(style) ? "apa" : (style as AuthorDateStyle)];
  const shown = form ?? defaultForm(s, isNumericStyle(style) ? "apa" : (style as AuthorDateStyle));
  const names = s.authors.slice(0, shown.count).map((a, i) => writtenName(a, shown.given[i] ?? "none"));
  if (shown.count < s.authors.length) return `${names.join(", ")}${names.length > 1 ? "," : ""} et al.`;
  const and = mode === "narrative" ? "and" : rules.and;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}${rules.serialComma ? "," : ""} ${and} ${names.at(-1)}`;
}

/** The year, with its a/b suffix, as the style writes it. */
function dateOf(s: Citable, style: AuthorDateStyle, suffix = "") {
  const rules = RULES[style];
  if (s.year != null) return `${s.year}${suffix}`;
  return suffix ? `${rules.noDate}${rules.noDateSuffix}${suffix}` : rules.noDate;
}

/** Everything that makes two citations read the same, before any a/b suffix. */
function label(s: Citable, style: AuthorDateStyle, form: NameForm) {
  return `${authorNames(s, style, "parenthetical", form)}\u0000${dateOf(s, style)}`;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.values()];
}

const sameText = (a: string, b: string) => a.trim() === b.trim();

/**
 * CSL's disambiguation, in its order: given names that are ambiguous across the document
 * (APA and Chicago), then more names, then given names within a clash (Harvard), and
 * finally a/b/c after the year in reference-list order.
 */
function disambiguate(style: AuthorDateStyle, cited: { id: string; s: Citable }[]) {
  const rules = RULES[style];
  const forms = new Map(cited.map(({ id, s }) => [id, defaultForm(s, style)]));

  // 1. A first author who shares a family name with another cited first author gets initials,
  // or (Chicago) the full given name when initials don't tell them apart. Whatever the year.
  if (rules.givenRule !== "by-cite") {
    for (const { id, s } of cited) {
      const first = s.authors[0];
      if (!first?.given.trim() || forms.get(id)!.count === 0) continue;
      const namesakes = cited
        .map((c) => c.s.authors[0])
        // An organisation (no given name) never counts as a namesake here.
        .filter((a) => a?.given.trim() && a.family === first.family && !sameText(a.given, first.given));
      const initialsDiffer = namesakes.some((a) => initials(a.given) !== initials(first.given));
      const initialsClash = namesakes.some((a) => initials(a.given) === initials(first.given));
      if (rules.givenRule === "primary-name" && initialsClash) forms.get(id)!.given[0] = "full";
      else if (initialsDiffer) forms.get(id)!.given[0] = "initials";
    }
  }

  const clashes = () =>
    groupBy(cited, ({ id, s }) => label(s, style, forms.get(id)!)).filter((g) => g.length > 1);

  // 2. Works that still read the same show more names, until each differs from the others.
  for (const group of clashes()) {
    for (const { id, s } of group) {
      const families = s.authors.map((a) => a.family);
      const others = group
        .filter((o) => o.id !== id)
        .map((o) => o.s.authors.map((a) => a.family))
        .filter((f) => f.join("\u0000") !== families.join("\u0000"));
      if (others.length === 0) continue;
      const form = forms.get(id)!;
      let n = form.count;
      const differs = (count: number) =>
        others.every((f) => f.slice(0, count).join("\u0000") !== families.slice(0, count).join("\u0000") || (count >= f.length) !== (count >= families.length));
      while (n < families.length && !differs(n)) n++;
      form.given = [...form.given, ...Array(n - form.count).fill("none")];
      form.count = n;
    }
  }

  // 3. Harvard: names that share a family name within a clash get initials, or full given names.
  if (rules.givenRule === "by-cite") {
    for (const group of clashes()) {
      for (const { id, s } of group) {
        const form = forms.get(id)!;
        for (let i = 0; i < form.count; i++) {
          const mine = s.authors[i];
          if (!mine.given.trim()) continue;
          const namesakes = group
            .filter((o) => o.id !== id)
            .map((o) => o.s.authors[i])
            .filter((a) => a && a.family === mine.family && !sameText(a.given, mine.given));
          if (namesakes.length === 0) continue;
          form.given[i] = namesakes.some((a) => initials(a.given) === initials(mine.given)) ? "full" : "initials";
        }
      }
    }
  }

  // 4. Whatever still reads the same gets a, b, c… in the order of the reference list.
  const suffixes = new Map<string, string>();
  const sortName = (s: Citable) =>
    s.authors.map((a) => `${a.family} ${style === "chicago" ? a.given : initials(a.given)}`).join(", ") || s.title;
  for (const group of clashes()) {
    group
      .sort((a, b) => sortName(a.s).localeCompare(sortName(b.s)) || a.s.title.localeCompare(b.s.title))
      .forEach((g, i) => suffixes.set(g.id, yearSuffix(i)));
  }
  return { forms, suffixes };
}

/** a…z, then aa, ab… as citeproc does. */
function yearSuffix(i: number): string {
  return i < 26 ? String.fromCharCode(97 + i) : yearSuffix(Math.floor(i / 26) - 1) + String.fromCharCode(97 + (i % 26));
}

/** Numbers, names and year suffixes for the sources a document cites, in order of first appearance. */
export function citeContext(style: CitationStyle, citedIds: string[], lookup: (id: string) => Citable | undefined): CiteContext {
  const numbers = new Map(citedIds.map((id, i) => [id, i + 1]));
  if (isNumericStyle(style)) return { style, lookup, numbers, suffixes: new Map(), forms: new Map() };
  const cited = [...new Set(citedIds)].flatMap((id) => {
    const s = lookup(id);
    return s ? [{ id, s }] : [];
  });
  const { forms, suffixes } = disambiguate(style as AuthorDateStyle, cited);
  return { style, lookup, numbers, suffixes, forms };
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

  const adStyle = style as AuthorDateStyle;
  const rules = RULES[adStyle];
  const parts = items.map((item) => {
    const s = ctx.lookup(item.sourceId);
    if (!s) return { names: "?", date: "", year: null as number | null, item };
    return { names: authorNames(s, style, mode, ctx.forms.get(item.sourceId)), date: dateOf(s, adStyle, ctx.suffixes.get(item.sourceId)), year: s.year, item };
  });
  const located = (date: string, item: CitationItem) => (item.locator ? `${date}, ${formatLocator(item.locator, style)}` : date);

  if (mode === "narrative") {
    return parts.map(({ names, date, item }) => wrap(item.prefix, `${names} (${(date && located(date, item)) || "?"})`, item.suffix)).join("; ");
  }

  // APA orders the works in one citation by author then year (undated first), Harvard by year
  // (undated last) then name; Chicago keeps them as written. Ties keep their order.
  const authorKey = (id: string) => {
    const authors = ctx.lookup(id)?.authors ?? [];
    return (authors.length >= 3 ? authors.slice(0, 1) : authors).map((a) => `${a.family}, ${a.given}`).join("; ");
  };
  const byYear = (a: number | null, b: number | null, undated: number) => (a ?? undated) - (b ?? undated);
  let ordered = [...parts];
  if (rules.sort === "author") {
    ordered.sort((a, b) => authorKey(a.item.sourceId).localeCompare(authorKey(b.item.sourceId)) || byYear(a.year, b.year, -Infinity));
  }
  if (rules.sort === "year") ordered.sort((a, b) => byYear(a.year, b.year, Infinity) || a.names.localeCompare(b.names));
  // Sorted styles also bring each author's works together, where the first of them stands.
  if (rules.sort !== "none") {
    ordered = groupBy(ordered, (p) => (p.date ? p.names : `\u0000${p.item.sourceId}`)).flatMap((works) =>
      // "2020a, 2020b", as the manuals show it. (citeproc leaves same-year works as cited.)
      works.sort((a, b) => (a.year === b.year ? (ctx.suffixes.get(a.item.sourceId) ?? "").localeCompare(ctx.suffixes.get(b.item.sourceId) ?? "") : 0)),
    );
  }

  // Works by the same authors share their names: "(Smith, 2018, 2020a)".
  const groups: string[] = [];
  let previous: (typeof ordered)[number] | null = null;
  for (const part of ordered) {
    const { names, date, item } = part;
    if (previous && date && previous.date && previous.names === names && !item.prefix && !previous.item.suffix) {
      groups[groups.length - 1] += `, ${located(date, item)}`;
      if (item.suffix) groups[groups.length - 1] += ` ${item.suffix}`;
    } else {
      // Chicago writes "(Smith 2020)" but "(Smith, n.d.)".
      const separator = date.startsWith(rules.noDate) ? ", " : rules.yearSeparator;
      const body = date ? `${names}${separator}${located(date, item)}` : names;
      groups.push(wrap(item.prefix, body, item.suffix));
    }
    previous = part;
  }
  return `(${groups.join("; ")})`;
}
