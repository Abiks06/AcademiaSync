import { describe, expect, it } from "vitest";
import { authorsToText, parseAuthors, sanitizeAuthors } from "./authors";

describe("parseAuthors", () => {
  it("reads 'Family, Given' lines", () => {
    expect(parseAuthors("Lusher, Amy L.\nHollman, Peter")).toEqual([
      { family: "Lusher", given: "Amy L." },
      { family: "Hollman", given: "Peter" },
    ]);
  });
  it("reads 'Given Family' lines, a lone name and ignores blanks and Windows line endings", () => {
    expect(parseAuthors("Amy L. Lusher\r\n\r\nWHO\r\n  ")).toEqual([
      { family: "Lusher", given: "Amy L." },
      { family: "WHO", given: "" },
    ]);
  });
  it("round-trips", () => {
    const authors = [{ family: "Lusher", given: "Amy" }, { family: "WHO", given: "" }];
    expect(parseAuthors(authorsToText(authors))).toEqual(authors);
  });
  it("drops a line with no family name", () => {
    expect(parseAuthors(", Amy")).toEqual([]);
  });
});

describe("sanitizeAuthors", () => {
  it("keeps well-formed authors and drops everything else", () => {
    expect(sanitizeAuthors([null, 3, "x", {}, { family: "" }, { family: "Lusher" }, { family: "Hu", given: 4 }])).toEqual([
      { family: "Lusher", given: "" },
      { family: "Hu", given: "" },
    ]);
    expect(sanitizeAuthors({ family: "x" })).toEqual([]);
  });
});
