import { describe, expect, it } from "vitest";
import { formatBibliography, sanitizeCslHtml } from "./bibliography";
import { CITATION_STYLES } from "./styles";
import type { SourceFields } from "./types";

const base: SourceFields = {
  kind: "article", title: "Microplastics in the marine environment", authors: [{ family: "Hidalgo-Ruz", given: "Valeria" }, { family: "Gutow", given: "Lars" }],
  year: 2012, container: "Environmental Science & Technology", volume: "46", issue: "6", pages: "3060-3075", publisher: null,
  doi: "10.1021/es2031505", url: null, abstract: null, notes: null,
};
const sources = [
  { ...base, id: "b" },
  { ...base, id: "a", title: "Microplastics in fisheries and aquaculture", authors: [{ family: "Lusher", given: "Amy" }], kind: "report" as const, year: 2017, container: null, volume: null, issue: null, pages: null, doi: null, publisher: "FAO" },
];

describe("formatBibliography", () => {
  it.each(CITATION_STYLES)("formats every style (%s)", (style) => {
    const entries = formatBibliography(sources, style);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.text.length > 20 && e.html.length > 20)).toBe(true);
  });

  it("sorts author-date styles by author, and numbers numeric styles in citation order", () => {
    expect(formatBibliography(sources, "apa").map((e) => e.id)).toEqual(["b", "a"]);
    const ieee = formatBibliography(sources, "ieee");
    expect(ieee.map((e) => e.id)).toEqual(["b", "a"]);
    expect(ieee[0].text).toMatch(/^\[1\]/);
  });

  it("italicises the journal in APA and keeps the ampersand escaped", () => {
    const [entry] = formatBibliography(sources, "apa");
    expect(entry.html).toContain("<i>Environmental Science &#38; Technology</i>");
  });

  it("strips anything but basic formatting", () => {
    expect(sanitizeCslHtml('<div class="csl-entry">A <i>b</i> <script>x</script><img src=x onerror=alert(1)><a href="javascript:1">c</a></div>')).toBe("<span>A <i>b</i> xc</span>");
  });
});

describe("locales", () => {
  const titled = { ...base, id: "q", title: "Many two", authors: [{ family: "Lee", given: "Amy" }, { family: "Choi", given: "Dan" }, { family: "Park", given: "Cy" }], year: 2019, container: "J. Test", volume: "1", issue: null, pages: "1-10", doi: null };

  it("gives Harvard British quote marks", () => {
    const [entry] = formatBibliography([titled], "harvard");
    expect(entry.text).toContain("‘Many two’");
    expect(entry.text).not.toMatch(/[“”]/);
  });

  it("keeps American quote marks for IEEE", () => {
    const [entry] = formatBibliography([titled], "ieee");
    expect(entry.text).toContain("“Many two,”");
  });
});
