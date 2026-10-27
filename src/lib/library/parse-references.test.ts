import { describe, expect, it } from "vitest";
import { parseReferences } from "./parse-references";
import { duplicateKeys, toCslItem } from "./csl-json";

const BIBTEX = String.raw`
@article{lusher2017,
  title = {Microplastics in {Fisheries} and Aquaculture},
  author = {Lusher, Amy and Hollman, Peter and {Food and Agriculture Organization}},
  journal = {FAO Fisheries and Aquaculture Technical Paper},
  year = {2017},
  pages = {1--126},
  doi = {10.1234/ABC.def}
}
@misc{notitle, author = {Nobody, A}, year = {2001}}
`;

const RIS = `TY  - BOOK
TI  - Reading Scientific Texts
AU  - Lee, Ann
PY  - 2019
PB  - Example Press
ER  - 
`;

describe("parseReferences", () => {
  it("reads BibTeX, keeping organisations as one author and skipping entries without a title", () => {
    const result = parseReferences(BIBTEX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("bibtex");
    expect(result.skipped).toBe(1);
    const [source] = result.sources;
    expect(source.kind).toBe("article");
    expect(source.title).toBe("Microplastics in Fisheries and Aquaculture");
    expect(source.authors).toEqual([
      { family: "Lusher", given: "Amy" },
      { family: "Hollman", given: "Peter" },
      { family: "Food and Agriculture Organization", given: "" },
    ]);
    expect(source.year).toBe(2017);
    expect(source.doi).toBe("10.1234/abc.def");
  });

  it("reads RIS", () => {
    const result = parseReferences(RIS);
    expect(result.ok && result.format).toBe("ris");
    expect(result.ok && result.sources[0]).toMatchObject({ kind: "book", title: "Reading Scientific Texts", year: 2019, publisher: "Example Press" });
  });

  it("never treats the text as something to fetch", () => {
    expect(parseReferences("10.1000/xyz").ok).toBe(false);
    expect(parseReferences("https://example.org/refs.bib").ok).toBe(false);
  });

  it("refuses oversized files", () => {
    expect(parseReferences(`@misc{a, title={x}}\n${" ".repeat(1_000_000)}`).ok).toBe(false);
  });
});

describe("duplicateKeys", () => {
  it("matches the same title and year regardless of case and punctuation, or the same DOI", () => {
    const a = duplicateKeys({ title: "The Title.", year: 2020, doi: null });
    const b = duplicateKeys({ title: "the  title", year: 2020, doi: "10.1/x" });
    expect(a.some((k) => b.includes(k))).toBe(true);
    expect(duplicateKeys({ title: "Other", year: 1, doi: "10.1/x" }).some((k) => b.includes(k))).toBe(true);
    expect(duplicateKeys({ title: "The Title", year: 2021, doi: null }).some((k) => a.includes(k))).toBe(false);
  });
});

describe("toCslItem", () => {
  it("writes organisations as literal names", () => {
    const item = toCslItem("x", {
      kind: "report", title: "T", authors: [{ family: "WHO", given: "" }], year: 2020, container: null, volume: null,
      issue: null, pages: null, publisher: null, doi: null, url: null, abstract: null, notes: null,
    });
    expect(item.author).toEqual([{ literal: "WHO" }]);
    expect(item.issued).toEqual({ "date-parts": [[2020]] });
  });
});
