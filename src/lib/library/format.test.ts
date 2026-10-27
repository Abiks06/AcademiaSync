import { describe, expect, it } from "vitest";
import { bibliographyOrder, formatReference, inTextLabel, initials, toBibtex } from "./format";
import type { SourceFields } from "./types";

const article: SourceFields = {
  kind: "article",
  title: "Microplastics in the marine environment: A review of the methods",
  authors: [
    { family: "Hidalgo-Ruz", given: "Valeria" },
    { family: "Gutow", given: "Lars" },
    { family: "Thompson", given: "Richard C." },
  ],
  year: 2012,
  container: "Environmental Science & Technology",
  volume: "46",
  issue: "6",
  pages: "3060-3075",
  publisher: null,
  doi: "10.1021/es2031505",
  url: null,
  abstract: null,
  notes: null,
};

describe("initials", () => {
  it("handles several given names and hyphens", () => {
    expect(initials("Richard C.")).toBe("R. C.");
    expect(initials("Jean-Paul")).toBe("J.-P.");
    expect(initials("  ")).toBe("");
  });
});

describe("inTextLabel", () => {
  it("names one, two or many authors", () => {
    expect(inTextLabel({ ...article, authors: [article.authors[0]] })).toBe("Hidalgo-Ruz, 2012");
    expect(inTextLabel({ ...article, authors: article.authors.slice(0, 2) })).toBe("Hidalgo-Ruz & Gutow, 2012");
    expect(inTextLabel(article)).toBe("Hidalgo-Ruz et al., 2012");
  });
  it("falls back to a short title when there are no authors, and n.d. without a year", () => {
    expect(inTextLabel({ title: "A very long report title about plastics", authors: [], year: null })).toBe(
      "“A very long report…”, n.d.",
    );
  });
});

describe("formatReference", () => {
  it("formats a journal article", () => {
    expect(formatReference(article)).toBe(
      "Hidalgo-Ruz, V., Gutow, L., & Thompson, R. C. (2012). Microplastics in the marine environment: A review of the methods. " +
        "Environmental Science & Technology, 46(6), 3060-3075. https://doi.org/10.1021/es2031505",
    );
  });
  it("formats a chapter with pages and publisher", () => {
    const text = formatReference({
      ...article,
      kind: "chapter",
      authors: [{ family: "Lusher", given: "Amy" }],
      title: "Microplastics in the sea",
      container: "Marine Anthropogenic Litter",
      pages: "245-307",
      publisher: "Springer",
      doi: null,
      year: 2015,
    });
    expect(text).toBe("Lusher, A. (2015). Microplastics in the sea. In Marine Anthropogenic Litter (pp. 245-307). Springer.");
  });
  it("puts the title first when there are no authors, and ends titles with one period", () => {
    const text = formatReference({ ...article, authors: [], title: "Why?", year: null, container: null, doi: null, url: "https://example.org/x" });
    expect(text).toBe("Why? (n.d.). https://example.org/x");
  });
  it("lists the first 19 authors then the last when there are more than 20", () => {
    const authors = Array.from({ length: 25 }, (_, i) => ({ family: `Author${i + 1}`, given: "A" }));
    const text = formatReference({ ...article, authors });
    expect(text).toContain("Author19, A., … Author25, A. (2012).");
    expect(text).not.toContain("Author20,");
  });
});

describe("bibliographyOrder", () => {
  it("sorts by first author, then year", () => {
    const later = { ...article, year: 2020 };
    const other = { ...article, authors: [{ family: "Andrews", given: "B" }] };
    expect([later, article, other].sort(bibliographyOrder).map((s) => `${s.authors[0].family}${s.year}`)).toEqual([
      "Andrews2012",
      "Hidalgo-Ruz2012",
      "Hidalgo-Ruz2020",
    ]);
  });
});

describe("toBibtex", () => {
  it("writes an article entry with en-dash page ranges", () => {
    const text = toBibtex([article]);
    expect(text).toContain("@article{hidalgoruz2012microplastics,");
    expect(text).toContain("author = {Hidalgo-Ruz, Valeria and Gutow, Lars and Thompson, Richard C.}");
    expect(text).toContain("journal = {Environmental Science \\& Technology}");
    expect(text).toContain("title = {{Microplastics in the marine environment: A review of the methods}}");
    expect(text).toContain("pages = {3060--3075}");
    expect(text).toContain("doi = {10.1021/es2031505}");
  });
  it("escapes LaTeX special characters so the file compiles", () => {
    const text = toBibtex([{ ...article, title: "R&D at 50% for $5 #1 my_file ~x^2", container: "A & B" }]);
    expect(text).toContain("title = {{R\\&D at 50\\% for \\$5 \\#1 my\\_file \\textasciitilde{}x\\textasciicircum{}2}}");
    expect(text).toContain("journal = {A \\& B}");
    expect(text).not.toMatch(/[^\\]&/);
  });
  it("keeps DOIs and links verbatim", () => {
    const text = toBibtex([{ ...article, doi: "10.1000/a_b%c", url: "https://example.org/a_b" }]);
    expect(text).toContain("doi = {10.1000/a_b%c}");
    expect(text).toContain("url = {https://example.org/a_b}");
  });
  it("keeps cite keys unique past z", () => {
    const keys = toBibtex(Array.from({ length: 30 }, () => article)).match(/^@\w+\{[^,]+/gm)!.map((k) => k.split("{")[1]);
    expect(new Set(keys).size).toBe(30);
    expect(keys[27]).toBe("hidalgoruz2012microplasticsaa");
    expect(keys.join()).not.toContain("{");
  });
  it("keeps cite keys unique", () => {
    const text = toBibtex([article, article, article]);
    expect(text).toContain("{hidalgoruz2012microplastics,");
    expect(text).toContain("{hidalgoruz2012microplasticsa,");
    expect(text).toContain("{hidalgoruz2012microplasticsb,");
  });
  it("strips braces that would break an entry and braces organisation authors", () => {
    const text = toBibtex([{ ...article, title: "A {broken} \\title", authors: [{ family: "World Health Organization", given: "" }] }]);
    expect(text).toContain("title = {{A broken title}}");
    expect(text).toContain("author = {{World Health Organization}}");
  });
});
