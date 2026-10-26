import { describe, expect, it } from "vitest";
import { citeContext, formatCitation } from "./styles";

const lusher = { title: "Microplastics in the sea", authors: [{ family: "Lusher", given: "Amy" }], year: 2017 };
const pair = { title: "Plastic and fish", authors: [{ family: "Lusher", given: "Amy" }, { family: "Hollman", given: "Peter" }], year: 2017 };
const many = { title: "A review", authors: [{ family: "Hidalgo-Ruz", given: "V" }, { family: "Gutow", given: "L" }, { family: "Thompson", given: "R" }], year: 2012 };
const twinA = { title: "Beta study", authors: [{ family: "Smith", given: "J" }], year: 2020 };
const twinB = { title: "Alpha study", authors: [{ family: "Smith", given: "J" }], year: 2020 };
const library: Record<string, typeof lusher> = { l: lusher, p: pair, m: many, ta: twinA, tb: twinB };
const lookup = (id: string) => library[id];

const ctx = (style: Parameters<typeof citeContext>[0], ids = ["l", "p", "m"]) => citeContext(style, ids, lookup);

describe("author-date styles", () => {
  it("formats APA parenthetical and narrative citations", () => {
    expect(formatCitation([{ sourceId: "l" }], "parenthetical", ctx("apa"))).toBe("(Lusher, 2017)");
    expect(formatCitation([{ sourceId: "p" }], "parenthetical", ctx("apa"))).toBe("(Lusher & Hollman, 2017)");
    expect(formatCitation([{ sourceId: "p" }], "narrative", ctx("apa"))).toBe("Lusher and Hollman (2017)");
    expect(formatCitation([{ sourceId: "m", locator: "45" }], "parenthetical", ctx("apa"))).toBe("(Hidalgo-Ruz et al., 2012, p. 45)");
  });

  it("groups several sources with prefixes and page ranges", () => {
    expect(
      formatCitation([{ sourceId: "l", prefix: "see" }, { sourceId: "m", locator: "3-7" }], "parenthetical", ctx("apa")),
    ).toBe("(see Lusher, 2017; Hidalgo-Ruz et al., 2012, pp. 3–7)");
  });

  it("follows Harvard and Chicago punctuation", () => {
    expect(formatCitation([{ sourceId: "p", locator: "4" }], "parenthetical", ctx("harvard"))).toBe("(Lusher and Hollman, 2017, p. 4)");
    expect(formatCitation([{ sourceId: "m", locator: "4" }], "parenthetical", ctx("chicago"))).toBe("(Hidalgo-Ruz, Gutow, and Thompson 2012, 4)");
  });

  it("adds a and b to same-author, same-year works", () => {
    const c = ctx("apa", ["ta", "tb"]);
    expect(formatCitation([{ sourceId: "tb" }], "parenthetical", c)).toBe("(Smith, 2020a)");
    expect(formatCitation([{ sourceId: "ta" }], "parenthetical", c)).toBe("(Smith, 2020b)");
  });

  it("marks sources the library doesn't have", () => {
    expect(formatCitation([{ sourceId: "gone" }], "parenthetical", ctx("apa"))).toBe("(?)");
    expect(formatCitation([], "parenthetical", ctx("apa"))).toBe("(?)");
  });
});

describe("numeric styles", () => {
  it("numbers sources by first appearance and collapses runs", () => {
    const c = ctx("ieee", ["m", "l", "p"]);
    expect(formatCitation([{ sourceId: "l" }], "parenthetical", c)).toBe("[2]");
    expect(formatCitation([{ sourceId: "p" }, { sourceId: "m" }, { sourceId: "l" }], "parenthetical", c)).toBe("[1]–[3]");
    expect(formatCitation([{ sourceId: "l", locator: "12" }], "parenthetical", c)).toBe("[2, p. 12]");
    expect(formatCitation([{ sourceId: "m" }], "narrative", c)).toBe("Hidalgo-Ruz et al. [1]");
  });

  it("uses round brackets for Vancouver", () => {
    const c = ctx("vancouver", ["m", "l", "p"]);
    expect(formatCitation([{ sourceId: "m" }, { sourceId: "p" }], "parenthetical", c)).toBe("(1,3)");
    expect(formatCitation([{ sourceId: "m" }, { sourceId: "l" }, { sourceId: "p" }], "parenthetical", c)).toBe("(1–3)");
  });
});
