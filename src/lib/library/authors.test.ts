import { describe, expect, it } from "vitest";
import { authorsToText, parseAuthors } from "./authors";

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
