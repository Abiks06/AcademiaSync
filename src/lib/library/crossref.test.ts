import { describe, expect, it } from "vitest";
import { mapCrossrefWork, normalizeDoi } from "./crossref";

describe("normalizeDoi", () => {
  it("accepts the common ways people paste a DOI", () => {
    for (const input of [
      "10.1021/ES2031505",
      " doi:10.1021/es2031505 ",
      "https://doi.org/10.1021/es2031505",
      "http://dx.doi.org/10.1021/es2031505",
    ]) {
      expect(normalizeDoi(input)).toBe("10.1021/es2031505");
    }
  });
  it("rejects things that aren't DOIs", () => {
    for (const input of ["", "hello", "10.12/short", "https://example.org/10.1021/x y", "10.1021/has space"]) {
      expect(normalizeDoi(input)).toBeNull();
    }
  });
});

describe("mapCrossrefWork", () => {
  it("maps a typical journal article record", () => {
    const source = mapCrossrefWork({
      DOI: "10.1021/ES2031505",
      type: "journal-article",
      title: ["Microplastics in the <i>marine</i> environment &amp; beyond"],
      author: [
        { family: "Hidalgo-Ruz", given: "Valeria" },
        { name: "The Plastics Consortium" },
        { given: "No family name" },
      ],
      "container-title": ["Environmental Science & Technology"],
      volume: "46",
      issue: "6",
      page: "3060-3075",
      publisher: "American Chemical Society",
      URL: "https://doi.org/10.1021/es2031505",
      abstract: "<jats:p>Plastic <jats:italic>everywhere</jats:italic>.</jats:p>",
      issued: { "date-parts": [[2012, 3]] },
    });
    expect(source).toMatchObject({
      kind: "article",
      title: "Microplastics in the marine environment & beyond",
      year: 2012,
      container: "Environmental Science & Technology",
      volume: "46",
      issue: "6",
      pages: "3060-3075",
      doi: "10.1021/es2031505",
      url: null,
      abstract: "Plastic everywhere .",
    });
    expect(source?.authors).toEqual([
      { family: "Hidalgo-Ruz", given: "Valeria" },
      { family: "The Plastics Consortium", given: "" },
    ]);
  });

  it("falls back to other date fields and an unknown type", () => {
    const source = mapCrossrefWork({ title: ["Untyped"], type: "something-new", "published-online": { "date-parts": [[2021, null]] } });
    expect(source).toMatchObject({ kind: "other", year: 2021, authors: [], doi: null });
  });

  it("refuses a record with no usable title", () => {
    expect(mapCrossrefWork({ title: [] })).toBeNull();
    expect(mapCrossrefWork({ title: ["  <i> </i> "] })).toBeNull();
  });

  it("drops non-web URLs and implausible years", () => {
    const source = mapCrossrefWork({ title: ["T"], URL: "javascript:alert(1)", issued: { "date-parts": [[99]] } });
    expect(source).toMatchObject({ url: null, year: null });
  });
});
