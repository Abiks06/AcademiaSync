import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { DocJSON } from "@/lib/editor/ydoc";
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

  it("keeps links and list starts in Markdown", () => {
    const json: DocJSON = {
      type: "doc",
      content: [
        p({ type: "text", text: "FAO", marks: [{ type: "link", attrs: { href: "https://fao.org" } }] }),
        { type: "orderedList", attrs: { start: 3 }, content: [li(p(t("three"))), li(p(t("four")))] },
      ],
    };
    expect(toMarkdown({ ...input, json, references: [] })).toBe("# Plastics\n\n[FAO](<https://fao.org>)\n\n3. three\n4. four\n");
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

const t = (text: string, ...marks: string[]): DocJSON => ({ type: "text", text, ...(marks.length && { marks: marks.map((type) => ({ type })) }) });
const p = (...content: DocJSON[]): DocJSON => ({ type: "paragraph", content });
const li = (...content: DocJSON[]): DocJSON => ({ type: "listItem", content });

async function wordXml(json: DocJSON, references: ExportInput["references"] = []) {
  const zip = await JSZip.loadAsync(await toDocx({ ...input, json, references }));
  const read = (name: string) => zip.file(name)!.async("string");
  const [document, styles, numbering, rels] = await Promise.all([read("word/document.xml"), read("word/styles.xml"), read("word/numbering.xml"), read("word/_rels/document.xml.rels")]);
  const body = document.slice(document.indexOf("<w:body>"));
  return { body, styles, numbering, rels, paragraphs: body.split(/(?=<w:p[ >])/).slice(1) };
}

const styleXml = (styles: string, id: string) => new RegExp(`<w:style [^>]*w:styleId="${id}".*?</w:style>`).exec(styles)?.[0] ?? "";

describe("Word export formatting", () => {
  it("gives headings real weight and paragraphs room to breathe", async () => {
    const { styles } = await wordXml({ type: "doc", content: [p(t("x"))] });
    expect(styles).toMatch(/<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300"\/>/);
    for (const id of ["Title", "Heading1", "Heading2", "Heading3"]) expect(styleXml(styles, id)).toContain("<w:b/>");
    expect(styleXml(styles, "Heading1")).toContain("<w:keepNext/>");
    expect(styles).not.toContain("2E74B5");
  });

  it("keeps a code block's lines and indentation", async () => {
    const { body } = await wordXml({ type: "doc", content: [{ type: "codeBlock", content: [t("a = 1\n  b\tc")] }] });
    expect(body).toContain('<w:pStyle w:val="Code"/>');
    expect(body).not.toMatch(/<w:t[^>]*>[^<]*\n/);
    expect(body).toContain("<w:br/>");
    expect(body).toContain("<w:tab/>");
    expect(body).toContain(">  b</w:t>");
  });

  it("writes links as clickable hyperlinks, and drops unsafe ones", async () => {
    const link = (text: string, href: string, ...marks: string[]): DocJSON => ({ type: "text", text, marks: [{ type: "link", attrs: { href } }, ...marks.map((type) => ({ type }))] });
    const { body, rels } = await wordXml({ type: "doc", content: [p(link("see ", "https://example.org/a"), link("this", "https://example.org/a", "bold"), t(" "), link("bad", "javascript:alert(1)"))] });
    expect(body.match(/<w:hyperlink /g)).toHaveLength(1);
    expect(body).toMatch(/<w:hyperlink [^>]*>.*see .*<w:b\/>.*this.*<\/w:hyperlink>/);
    expect(rels).toContain('Target="https://example.org/a"');
    expect(rels).not.toContain("javascript");
    expect(body).toContain(">bad</w:t>");
  });

  it("numbers lists from their start, lines up later paragraphs and restarts each list", async () => {
    const { paragraphs, numbering } = await wordXml({
      type: "doc",
      content: [
        { type: "orderedList", content: [li(p(t("one")), p(t("more about one"))), li(p(t("two")))] },
        p(t("between")),
        { type: "orderedList", attrs: { start: 5 }, content: [li(p(t("five")))] },
        { type: "bulletList", content: [li(p(t("dot")), { type: "bulletList", content: [li(p(t("inner")))] })] },
      ],
    });
    const numId = (text: string) => /<w:numId w:val="(\d+)"/.exec(paragraphs.find((x) => x.includes(`>${text}<`))!)?.[1];
    const ilvl = (text: string) => /<w:ilvl w:val="(\d+)"/.exec(paragraphs.find((x) => x.includes(`>${text}<`))!)?.[1];
    expect(numId("one")).toBe(numId("two"));
    expect(numId("five")).not.toBe(numId("one"));
    expect(numbering).toMatch(new RegExp(`<w:num w:numId="${numId("five")}"><w:abstractNumId w:val="\\d+"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/>`));
    expect(paragraphs.find((x) => x.includes(">more about one<"))).toContain('<w:ind w:left="720"/>');
    expect(ilvl("inner")).toBe("1");
    expect(numbering).toContain('w:lvlText w:val="\u2022"');
  });

  it("styles quotes, and keeps citations' own formatting", async () => {
    const { paragraphs } = await wordXml({
      type: "doc",
      content: [{ type: "blockquote", content: [p(t("quoted"))] }, p({ type: "citation", attrs: { items: [] }, marks: [{ type: "bold" }] })],
    });
    expect(paragraphs[1]).toContain('<w:pStyle w:val="Quote"/>');
    expect(paragraphs[2]).toMatch(/<w:b\/>.*\(Lusher, 2017\)/);
  });

  it("separates a numeric style's label from the reference with a tab", async () => {
    const html = '<span> <span class="csl-left-margin">[1]</span><span class="csl-right-inline">A. Lusher, <i>Microplastics</i>, 10<sup>th</sup> ed.</span> </span>';
    const { paragraphs } = await wordXml({ type: "doc", content: [] }, [{ html, text: "" }]);
    const entry = paragraphs.at(-1)!;
    expect(entry).toContain('<w:pStyle w:val="References"/>');
    expect(entry).toMatch(/>\[1\]<\/w:t><\/w:r><w:r><w:tab\/><\/w:r><w:r><w:t[^>]*>A\. Lusher, </);
    expect(entry).toContain('<w:vertAlign w:val="superscript"/>');
    expect(entry).not.toContain('w:val="false"');
    expect(entry).not.toMatch(/<w:t[^>]*> <\/w:t>/);
  });
});
