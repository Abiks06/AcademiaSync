import { describe, expect, it } from "vitest";
import { matchScore, rank } from "./match";

describe("matchScore", () => {
  it("needs every word to match somewhere", () => {
    expect(matchScore("lost sea", "Lost at sea: where is all the plastic?")).not.toBeNull();
    expect(matchScore("lost river", "Lost at sea: where is all the plastic?")).toBeNull();
  });

  it("ignores case and accents, and searches keywords", () => {
    expect(matchScore("lusher", "Microplastics in fisheries", "Lüsher 2017")).not.toBeNull();
    expect(matchScore("MICRO", "microplastics")).not.toBeNull();
  });

  it("prefers word starts to letters scattered through the text", () => {
    const start = matchScore("sea", "Lost at sea")!;
    const inside = matchScore("sea", "Research methods")!;
    const scattered = matchScore("lst", "Lost at sea")!;
    expect(start).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(scattered);
  });

  it("matches everything for an empty query", () => {
    expect(matchScore("  ", "anything")).toBe(0);
  });
});

describe("rank", () => {
  it("puts the best match first and drops the rest", () => {
    const items = ["Research methods", "Sea level rise", "Lost at sea", "Glossary"];
    expect(rank(items, "sea", (label) => ({ label }))).toEqual(["Sea level rise", "Lost at sea", "Research methods"]);
  });

  it("keeps the original order on an empty query", () => {
    expect(rank(["b", "a"], "", (label) => ({ label }))).toEqual(["b", "a"]);
  });
});
