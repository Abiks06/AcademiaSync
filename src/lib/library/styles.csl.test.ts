import { describe, expect, it } from "vitest";
import { formatBibliography, formatCitationsWithCsl } from "./bibliography";
import { citeContext, formatCitation, type CitationStyle } from "./styles";
import type { Author, SourceFields } from "./types";

/**
 * The editor formats in-text citations itself, live in the browser. These tests hold it to
 * citeproc running the same CSL files the reference list uses, so the citation in the text
 * and the entry in the references always agree (initials, extra names, 2020a and 2020b).
 */

type Source = SourceFields & { id: string };
const base: Omit<SourceFields, "authors" | "year" | "title"> = {
  kind: "article", container: null, volume: null, issue: null, pages: null, publisher: null, doi: null, url: null, abstract: null, notes: null,
};
const P = (family: string, given: string): Author => ({ family, given });
const src = (id: string, authors: Author[], year: number | null, title = `Study ${id}`): Source => ({ ...base, id, authors, year, title });

function ours(style: CitationStyle, sources: Source[], citations: { id: string; locator?: string }[][]) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const order = [...new Set(citations.flat().map((c) => c.id))];
  const ctx = citeContext(style, order, (id) => byId.get(id));
  return citations.map((c) => formatCitation(c.map((i) => ({ sourceId: i.id, locator: i.locator })), "parenthetical", ctx));
}

const AUTHOR_DATE = ["apa", "harvard", "chicago"] as const;
const one = (...ids: string[]) => ids.map((id) => [{ id }]);

const cases: Record<string, [Source[], { id: string; locator?: string }[][]]> = {
  "same author, same year": [[src("a", [P("Smith", "John")], 2020, "Zebra study"), src("b", [P("Smith", "John")], 2020, "Apple study")], one("a", "b")],
  "different people, same family name": [[src("a", [P("Smith", "John")], 2020), src("b", [P("Smith", "Anna")], 2021)], one("a", "b")],
  "same family name, same year": [[src("a", [P("Smith", "John")], 2020), src("b", [P("Smith", "Anna")], 2020)], one("a", "b")],
  "same initials": [[src("a", [P("Smith", "John")], 2020), src("b", [P("Smith", "Jane")], 2020), src("c", [P("Smith", "Anna")], 2021)], one("a", "b", "c")],
  "three authors, different second": [[src("a", [P("Lee", "Amy"), P("Kim", "Bo"), P("Park", "Cy")], 2019), src("b", [P("Lee", "Amy"), P("Choi", "Dan"), P("Park", "Cy")], 2019)], one("a", "b")],
  "four authors, different last": [[src("a", [P("Wu", "A"), P("Xu", "B"), P("Yu", "C"), P("Zu", "D")], 2017), src("b", [P("Wu", "A"), P("Xu", "B"), P("Yu", "C"), P("Qu", "D")], 2017)], one("a", "b")],
  "identical author lists": [[src("a", [P("Lee", "A"), P("Kim", "B"), P("Park", "C")], 2019, "X"), src("b", [P("Lee", "A"), P("Kim", "B"), P("Park", "C")], 2019, "Y"), src("c", [P("Lee", "A"), P("Choi", "B"), P("Park", "C")], 2019, "Z")], one("a", "b", "c")],
  "second author shares a given-name clash": [[src("a", [P("Lee", "Amy"), P("Kim", "Bo")], 2019), src("b", [P("Lee", "Amy"), P("Kim", "Cy")], 2019)], one("a", "b")],
  "no date": [[src("a", [P("Smith", "John")], null), src("b", [P("Smith", "John")], null)], one("a", "b")],
  "organisation and person": [[src("a", [P("Smith", "John")], 2020), src("b", [P("Smith", "")], 2020, "Report")], one("a", "b")],
  "hyphenated and double given names": [[src("a", [P("Smith", "Jean-Paul")], 2020), src("b", [P("Smith", "John Paul")], 2021)], one("a", "b")],
  "six authors": [[src("a", ["A", "B", "C", "D", "E", "F"].map((f) => P(f, "X")), 2020)], one("a")],
  "page locators": [[src("a", [P("Smith", "John")], 2020)], [[{ id: "a", locator: "4" }], [{ id: "a", locator: "4-6" }]]],
  "several works in one citation": [
    [src("a", [P("Smith", "John")], 2020, "Zeta"), src("b", [P("Smith", "John")], 2020, "Alpha"), src("c", [P("Adams", "Q")], 2022), src("d", [P("Smith", "John")], 2018)],
    [[{ id: "c" }, { id: "d" }], [{ id: "a" }], [{ id: "b" }]],
  ],
};

describe.each(AUTHOR_DATE)("in-text citations match citeproc (%s)", (style) => {
  it.each(Object.keys(cases))("%s", (name) => {
    const [sources, citations] = cases[name];
    expect(ours(style, sources, citations)).toEqual(formatCitationsWithCsl(sources, style, citations));
  });
});

/** A seeded random library of overlapping names, so clashes of every kind come up. */
function randomCase(seed: number): [Source[], { id: string }[][]] {
  let x = seed;
  const rand = (n: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % n;
  };
  const families = ["Smith", "Lee", "Kim", "Park", "Choi"];
  const givens = ["John", "Jane", "Anna", "Bo"];
  const sources = Array.from({ length: 2 + rand(5) }, (_, i) =>
    src(`s${i}`, Array.from({ length: 1 + rand(4) }, () => P(families[rand(families.length)], givens[rand(givens.length)])), [2019, 2020, 2020, null][rand(4)], `Title ${String.fromCharCode(65 + rand(26))}${i}`),
  );
  return [sources, sources.map((s) => [{ id: s.id }])];
}

describe.each(AUTHOR_DATE)("random libraries match citeproc (%s)", (style) => {
  it.each(Array.from({ length: 150 }, (_, i) => i + 1))("seed %i", (seed) => {
    const [sources, citations] = randomCase(seed);
    expect(ours(style, sources, citations)).toEqual(formatCitationsWithCsl(sources, style, citations));
  });
});

/**
 * citeproc keeps same-author, same-year works in the order they were cited ("2020b, 2020a");
 * in APA and Harvard, which sort a citation's works, we write them as the manuals do ("2020a,
 * 2020b"). Chicago keeps works as cited, like citeproc. Everything else must match.
 */
const suffixOrder = (citation: string) =>
  citation.replace(/(?:(?:\d{4}|n\.d\.-|no date )[a-z], )+(?:\d{4}|n\.d\.-|no date )[a-z]\b/g, (run) => run.split(", ").sort().join(", "));

describe.each(AUTHOR_DATE)("several works in one citation match citeproc (%s)", (style) => {
  it.each(Array.from({ length: 80 }, (_, i) => i + 5000))("seed %i", (seed) => {
    const [sources] = randomCase(seed);
    const ids = sources.map((s) => ({ id: s.id }));
    const citations = [ids.slice(0, 3), ids.slice(1), ids.slice(0, 1)].filter((c) => c.length > 0);
    expect(ours(style, sources, citations)).toEqual(formatCitationsWithCsl(sources, style, citations).map((c) => (style === "chicago" ? c : suffixOrder(c))));
  });
});

describe.each(AUTHOR_DATE)("the reference list carries the same a/b suffixes (%s)", (style) => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 9000))("seed %i", (seed) => {
    const [sources] = randomCase(seed);
    const ctx = citeContext(style, sources.map((s) => s.id), (id) => sources.find((s) => s.id === id));
    const entries = new Map(formatBibliography(sources, style).map((e) => [e.id, e.text]));
    for (const s of sources) {
      const suffix = ctx.suffixes.get(s.id);
      const year = s.year ?? (style === "harvard" ? "no date" : "n.d.");
      const written = suffix ? `${year}${s.year ? "" : style === "harvard" ? " " : "-"}${suffix}` : null;
      if (written) expect(entries.get(s.id)).toContain(written);
      else expect(entries.get(s.id)).not.toMatch(new RegExp(`${String(year).replace(/\./g, "\\.")}[- ]?[a-z]\\b`));
    }
  });
});
