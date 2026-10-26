import { describe, expect, it } from "vitest";
import { collectCitations } from "./citations";

const node = (name: string, attrs: Record<string, unknown> = {}) => ({ type: { name }, attrs });
const doc = (...nodes: ReturnType<typeof node>[]) => ({ descendants: (visit: (n: ReturnType<typeof node>) => void) => nodes.forEach(visit) });

describe("collectCitations", () => {
  it("lists each cited source once, in order of first appearance, and counts every citation", () => {
    const result = collectCitations(
      doc(node("paragraph"), node("citation", { sourceId: "b" }), node("citation", { sourceId: "a" }), node("citation", { sourceId: "b" })),
    );
    expect(result).toEqual({ ids: ["b", "a"], count: 3 });
  });
  it("ignores other nodes and citations with no source", () => {
    const result = collectCitations(doc(node("text"), node("citation", { sourceId: null }), node("citation", {})));
    expect(result).toEqual({ ids: [], count: 2 });
  });
});
