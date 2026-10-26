import { describe, expect, it } from "vitest";
import { htmlToRuns, toDocx, toMarkdown, type ExportInput } from "./export";

const input: ExportInput = {
  title: "Plastics",
  json: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plastic is " },
          { type: "text", text: "everywhere", marks: [{ type: "bold" }] },
          { type: "text", text: " " },
          { type: "citation", attrs: { items: [{ sourceId: "11111111-1111-4111-8111-111111111111" }] } },
        ],
      },
      { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] }] },
    ],
  },
  citationLabel: () => "(Lusher, 2017)",
  references: [{ html: "Lusher, A. (2017). <i>Microplastics</i>. FAO.", text: "Lusher, A. (2017). Microplastics. FAO." }],
};

describe("export", () => {
  it("writes Markdown with citations in their style and the reference list", () => {
    expect(toMarkdown(input)).toBe("# Plastics\n\n## Intro\n\nPlastic is **everywhere** (Lusher, 2017)\n\n1. First\n\n## References\n\nLusher, A. (2017). Microplastics. FAO.\n");
  });

  it("writes a Word file", async () => {
    const buffer = await toDocx(input);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(3000);
  });

  it("keeps the italics a style asks for", () => {
    const runs = htmlToRuns("A, B. <i>Title &#38; more</i>. Press.");
    expect(runs).toHaveLength(3);
  });
});
