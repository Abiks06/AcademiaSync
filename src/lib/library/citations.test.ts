import { describe, expect, it } from "vitest";
import { citationItems, citationMode, collectCitations } from "./citations";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const node = (name: string, attrs: Record<string, unknown> = {}) => ({ type: { name }, attrs });
const doc = (...nodes: ReturnType<typeof node>[]) => ({ descendants: (visit: (n: ReturnType<typeof node>) => void) => nodes.forEach(visit) });

describe("collectCitations", () => {
  it("lists each cited source once, in order of first appearance, and counts every citation", () => {
    const result = collectCitations(
      doc(
        node("paragraph"),
        node("citation", { items: [{ sourceId: B }, { sourceId: A }] }),
        node("citation", { sourceId: A }),
        node("citation", { items: [{ sourceId: B }] }),
      ),
    );
    expect(result).toEqual({ ids: [B, A], count: 3 });
  });

  it("ignores other nodes and citations with no source", () => {
    const result = collectCitations(doc(node("text"), node("citation", { sourceId: null }), node("citation", {})));
    expect(result).toEqual({ ids: [], count: 2 });
  });
});

describe("citationItems", () => {
  it("reads the early single-source shape", () => {
    expect(citationItems({ sourceId: A })).toEqual([{ sourceId: A }]);
  });

  it("drops anything malformed that another editor wrote into the shared document", () => {
    expect(
      citationItems({
        items: [null, 5, { sourceId: "<script>" }, { sourceId: A, locator: 12, prefix: " see ", suffix: "x".repeat(500) }],
      }),
    ).toEqual([{ sourceId: A, prefix: "see", suffix: "x".repeat(60) }]);
  });

  it("caps the number of sources in one citation", () => {
    expect(citationItems({ items: Array.from({ length: 50 }, () => ({ sourceId: A })) })).toHaveLength(20);
  });

  it("defaults to a parenthetical citation", () => {
    expect(citationMode({})).toBe("parenthetical");
    expect(citationMode({ mode: "narrative" })).toBe("narrative");
    expect(citationMode({ mode: "<b>" })).toBe("parenthetical");
  });
});
