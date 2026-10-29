import type { DocJSON } from "@/lib/editor/ydoc";
import { CITATION_NODE } from "@/lib/library/citations";

/**
 * Citations typed by hand, like "(Smith & Lee, 2020, p. 4)", "Smith et al. (2019a)" or "[3]",
 * found in the text and tied to entries of the typed reference list. Nothing here guesses
 * beyond what the text says: a citation that fits no entry, or more than one, is left for a
 * person to decide.
 */

/** One entry of a typed reference list, with what can be read from it reliably. */
export type ReferenceEntry = {
  index: number;
  text: string;
  /** "[3]" or "3." at the start, for numeric styles. */
  number: number | null;
  /** Family names of the authors, as written, in order. */
  families: string[];
  year: number | null;
  /** "a" in "2020a". */
  suffix: string;
  doi: string | null;
};

export type TypedPart = { entry: number | null; locator?: string; prefix?: string; written: string };
export type TypedCitation = { key: number; parts: TypedPart[]; mode: "parenthetical" | "narrative"; text: string };

const YEAR = "(?:1[5-9]|20)\\d{2}";
const NAME = "\\p{Lu}[\\p{L}'’\\-]+(?:\\s+\\p{Lu}[\\p{L}'’\\-]+)?";

/** Lowercase, without accents, so "Sánchez" and "Sanchez" match. */
export const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "'").trim();

export function parseEntry(text: string, index: number): ReferenceEntry {
  const t = text.replace(/\s+/g, " ").trim();
  const numbered = /^\s*(?:\[(\d{1,4})\]|(\d{1,4})[.)])\s+/.exec(t);
  const rest = numbered ? t.slice(numbered[0].length) : t;
  const yearMatch = new RegExp(`\\((${YEAR})([a-z]?)\\)|\\b(${YEAR})([a-z]?)\\b`).exec(rest);
  const year = yearMatch ? Number(yearMatch[1] ?? yearMatch[3]) : null;
  const suffix = yearMatch ? (yearMatch[2] ?? yearMatch[4] ?? "") : "";
  // The authors come before the year (author-date) or before the quoted title (IEEE).
  const authorPart = rest.slice(0, yearMatch && yearMatch.index < 400 ? yearMatch.index : Math.min(rest.length, 200)).split(/[“"‘]/)[0];
  const families = authorFamilies(authorPart);
  const doi = /\b(10\.\d{4,9}\/[^\s"<>]+?)[.,;)]?(?:\s|$)/.exec(rest)?.[1]?.toLowerCase() ?? null;
  return { index, text: t, number: numbered ? Number(numbered[1] ?? numbered[2]) : null, families, year, suffix, doi };
}

/** "Woodall, L. C., Sanchez-Vidal, A., & Lee, B." → Woodall, Sanchez-Vidal, Lee; also "L. C. Woodall and A. Lee" and "Woodall LC, Lee A". */
function authorFamilies(part: string) {
  const pieces = part
    .replace(/\bet al\.?/g, "")
    .split(/,|;|\s&\s|\sand\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const piece of pieces) {
    // Vancouver: "Sanchez-Vidal A. The deep sea…": the last author, then the title starts.
    const vancouverLast = /^(\p{Lu}[\p{L}'’-]+)\s+\p{Lu}{1,3}\.\s/u.exec(piece);
    if (vancouverLast) {
      out.push(vancouverLast[1]);
      break;
    }
    const words = piece.split(/\s+/).filter((w) => /\p{L}/u.test(w));
    // Words that are initials ("L.", "LC", "A.-M.") are given names, not family names.
    const names = words.filter((w) => !/^(?:\p{Lu}\.?-?)+$/u.test(w) && /^\p{Lu}/u.test(w));
    if (names.length) out.push(names.at(-1)!.replace(/[.:]$/, ""));
    if (out.length >= 20) break;
  }
  return out;
}

const PREFIX = /^(see also|see|e\.g\.,?|cf\.|i\.e\.,?|for example,?|for a review,? see)\s+/i;

/** One part of a parenthetical citation, e.g. "see Smith et al., 2019a, p. 4" → names, years, locator. */
function parsePart(raw: string) {
  let part = raw.trim();
  const prefix = PREFIX.exec(part)?.[1];
  if (prefix) part = part.slice(prefix.length).trim();
  const locator = /,\s*((?:pp?\.|ch\.|chap\.|para\.|sec\.)\s*[\w–-]+(?:\s*[–-]\s*\w+)?)\s*$/i.exec(part);
  if (locator) part = part.slice(0, locator.index).trim();
  const years = new RegExp(`(?:,\\s*|\\s+)((?:${YEAR}[a-z]?|n\\.d\\.(?:-[a-z])?)(?:\\s*,\\s*(?:${YEAR}[a-z]?|n\\.d\\.(?:-[a-z])?))*)$`).exec(part);
  if (!years) return null;
  const names = part.slice(0, years.index).trim();
  if (!new RegExp(`^${NAME}`, "u").test(names)) return null;
  const families = authorFamilies(names);
  if (families.length === 0) return null;
  const list = years[1].split(/\s*,\s*/).map((y) => {
    const m = new RegExp(`^(${YEAR})([a-z]?)$`).exec(y);
    return m ? { year: Number(m[1]), suffix: m[2] } : { year: null, suffix: /-([a-z])$/.exec(y)?.[1] ?? "" };
  });
  return { prefix, locator: locator?.[1].replace(/^pp?\.\s*/i, ""), families, years: list, etAl: /\bet al\b/.test(names) };
}

/** The entry a citation of these names and this year points to, or null if none or several fit. */
function matchEntry(entries: ReferenceEntry[], families: string[], year: number | null, suffix: string, etAl: boolean) {
  const first = fold(families[0]);
  let fits = entries.filter((e) => e.families[0] && fold(e.families[0]) === first && e.year === year);
  // "Smith & Lee" must have Lee second; "Smith et al." must have three or more authors.
  if (!etAl && families.length > 1) fits = fits.filter((e) => families.every((f, i) => e.families[i] && fold(e.families[i]) === fold(f)));
  if (etAl) fits = fits.filter((e) => e.families.length >= 2) as ReferenceEntry[];
  if (!etAl && families.length === 1 && fits.length > 1) fits = fits.filter((e) => e.families.length === 1);
  if (suffix) {
    const exact = fits.filter((e) => e.suffix === suffix);
    if (exact.length === 1) return exact[0].index;
    // Lists without the letters printed: the nth work of that author and year is "a", "b"…
    const nth = suffix.charCodeAt(0) - 97;
    return fits.length > nth && fits.every((e) => !e.suffix) ? fits[nth].index : null;
  }
  return fits.length === 1 ? fits[0].index : null;
}

type Match = { start: number; end: number; parts: TypedPart[]; mode: "parenthetical" | "narrative" };

function findInText(text: string, entries: ReferenceEntry[], numeric: boolean): Match[] {
  const found: Match[] = [];
  const taken = (s: number, e: number) => found.some((m) => s < m.end && e > m.start);

  if (numeric) {
    // [3], [1, 4], [2–5], [3, p. 12]
    for (const m of text.matchAll(/\[(\d{1,4}(?:\s*[–,-]\s*\d{1,4})*)(?:,\s*(pp?\.\s*[\w–-]+))?\]/g)) {
      const numbers: number[] = [];
      for (const piece of m[1].split(",")) {
        const range = /^\s*(\d+)\s*[–-]\s*(\d+)\s*$/.exec(piece);
        if (range) for (let n = Number(range[1]); n <= Number(range[2]) && numbers.length < 50; n++) numbers.push(n);
        else numbers.push(Number(piece.trim()));
      }
      const parts = numbers.map((n) => ({ entry: entries.find((e) => e.number === n)?.index ?? null, written: `[${n}]` }));
      if (m[2] && parts.length === 1) Object.assign(parts[0], { locator: m[2].replace(/^pp?\.\s*/i, "") });
      found.push({ start: m.index, end: m.index + m[0].length, parts, mode: "parenthetical" });
    }
    return found;
  }

  // Narrative: Smith (2020), Smith and Lee (2020a, p. 4), Smith et al. (2019)
  const narrative = new RegExp(
    `(${NAME}(?:\\s+et al\\.?|\\s+(?:and|&)\\s+${NAME}|(?:,\\s+${NAME})*,?\\s+(?:and|&)\\s+${NAME})?)\\s+\\((${YEAR}[a-z]?|n\\.d\\.)(?:,\\s*((?:pp?\\.)\\s*[\\w–-]+))?\\)`,
    "gu",
  );
  for (const m of text.matchAll(narrative)) {
    const names = m[1].replace(/^(?:The|In|As|By|From|And|But|While|Unlike|Following|According to)\s+/, "");
    const start = m.index + (m[1].length - names.length);
    const part = parsePart(`${names}, ${m[2]}`);
    if (!part) continue;
    const { year, suffix } = part.years[0];
    found.push({
      start,
      end: m.index + m[0].length,
      mode: "narrative",
      parts: [{ entry: matchEntry(entries, part.families, year, suffix, part.etAl), locator: m[3]?.replace(/^pp?\.\s*/i, ""), written: m[0].slice(start - m.index) }],
    });
  }

  // Parenthetical: (Smith, 2020; see Lee et al., 2019a, p. 4)
  for (const m of text.matchAll(new RegExp(`\\(([^()]*?\\b(?:${YEAR}[a-z]?|n\\.d\\.)\\b[^()]*?)\\)`, "g"))) {
    if (taken(m.index, m.index + m[0].length)) continue;
    const pieces = m[1].split(/\s*;\s*/);
    const parts: TypedPart[] = [];
    for (const piece of pieces) {
      const part = parsePart(piece);
      if (!part) {
        parts.length = 0;
        break;
      }
      part.years.forEach(({ year, suffix }, i) =>
        parts.push({
          entry: matchEntry(entries, part.families, year, suffix, part.etAl),
          written: piece,
          ...(i === 0 && part.prefix && { prefix: part.prefix }),
          ...(i === part.years.length - 1 && part.locator && { locator: part.locator }),
        }),
      );
    }
    if (parts.length) found.push({ start: m.index, end: m.index + m[0].length, parts, mode: "parenthetical" });
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * Finds typed citations in the manuscript and puts pending citation nodes in their place.
 * Keys continue from `firstKey`, so they never clash with field citations.
 */
export function findTypedCitations(doc: DocJSON, entries: ReferenceEntry[], firstKey = 0) {
  const numbered = entries.filter((e) => e.number !== null).length;
  const numeric = entries.length > 0 && numbered >= entries.length * 0.8;
  const citations: TypedCitation[] = [];

  const walk = (node: DocJSON): DocJSON => {
    if (!node.content) return node;
    const content: DocJSON[] = [];
    for (const child of node.content) {
      // Links and code are left alone.
      if (child.type !== "text" || child.marks?.some((m) => m.type === "link" || m.type === "code")) {
        content.push(walk(child));
        continue;
      }
      const text = child.text ?? "";
      let at = 0;
      for (const m of findInText(text, entries, numeric)) {
        if (m.start > at) content.push({ ...child, text: text.slice(at, m.start) });
        const key = firstKey + citations.length;
        citations.push({ key, parts: m.parts, mode: m.mode, text: text.slice(m.start, m.end) });
        content.push({ type: CITATION_NODE, attrs: { pending: key } });
        at = m.end;
      }
      if (at < text.length) content.push(at === 0 ? child : { ...child, text: text.slice(at) });
    }
    return { ...node, content };
  };

  return { doc: walk(doc), citations };
}
