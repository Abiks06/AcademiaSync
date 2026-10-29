import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { CitationNode } from "@/lib/editor/citation-node";
import type { DocJSON } from "@/lib/editor/ydoc";
import { DocxError, parseDocx } from "./docx";
import { field, makeDocx, p, r } from "./docx-fixture";

const schema = getSchema([StarterKit, CitationNode]);
/** Fills pending citations with a dummy source, then checks the editor's schema accepts the document. */
function assertEditorAccepts(doc: DocJSON) {
  const fill = (n: DocJSON): DocJSON => ({
    ...n,
    ...(n.type === "citation" && { attrs: { items: [{ sourceId: "00000000-0000-4000-8000-000000000000" }], mode: "parenthetical", label: "" } }),
    ...(n.content && { content: n.content.map(fill) }),
  });
  schema.nodeFromJSON(fill(doc)).check();
}

const zoteroCitation = (items: unknown[]) =>
  `ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify({ citationID: "x", properties: { formattedCitation: "(Smith, 2020)", noteIndex: 0 }, citationItems: items, schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json" })}`;
const smith = { id: 1, type: "article-journal", title: "Plastic in the deep", author: [{ family: "Smith", given: "John" }], issued: { "date-parts": [[2020]] }, DOI: "10.1000/deep", "container-title": "Ocean Letters" };
const lee = { id: 2, type: "book", title: "Sediments", author: [{ family: "Lee", given: "Amy" }], issued: { "date-parts": [[2019]] } };

describe("parseDocx: text", () => {
  it("keeps headings, lists, quotes, links and marks", async () => {
    const parsed = await parseDocx(
      await makeDocx(
        p(r("Chapter two"), "Title") +
          p(r("Introduction"), "Heading1") +
          p(r("German heading style"), "berschrift2") +
          p(r("Plain ") + r("bold", "<w:b/>") + r(" and ") + r("italic", "<w:i/>") + r(" not bold", '<w:b w:val="0"/>')) +
          p(r("first"), undefined, { id: 1 }) +
          p(r("nested"), undefined, { id: 1, level: 1 }) +
          p(r("second"), undefined, { id: 1 }) +
          p(r("one"), undefined, { id: 2 }) +
          p(r("A quote"), "Quote") +
          p(`<w:hyperlink r:id="rId9">${r("a link")}</w:hyperlink> and <w:hyperlink r:id="rId10">${r("a bad link")}</w:hyperlink>`.replace(" and ", r(" and "))) +
          p(`<w:del><w:r><w:delText>deleted</w:delText></w:r></w:del>${r("kept")}<w:ins>${r(" inserted")}</w:ins>`),
      ),
    );
    expect(parsed.title).toBe("Chapter two");
    const [h1, h2, para, bullets, numbers, quote, links, tracked] = parsed.doc.content!;
    expect(h1).toEqual({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Introduction" }] });
    expect(h2.attrs).toEqual({ level: 2 });
    expect(para.content).toEqual([
      { type: "text", text: "Plain " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "text", text: " and " },
      { type: "text", text: "italic", marks: [{ type: "italic" }] },
      { type: "text", text: " not bold" },
    ]);
    expect(bullets.type).toBe("bulletList");
    expect(bullets.content).toHaveLength(2);
    expect(bullets.content![0].content![1].type).toBe("bulletList");
    expect(numbers.type).toBe("orderedList");
    expect(quote.type).toBe("blockquote");
    expect(links.content![0]).toEqual({ type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "https://example.org/paper" } }] });
    expect(links.content!.at(-1)).toEqual({ type: "text", text: " and a bad link" });
    expect(tracked.content).toEqual([{ type: "text", text: "kept inserted" }]);
    assertEditorAccepts(parsed.doc);
  });

  it("marks tables, figures, equations and footnotes it can't hold yet", async () => {
    const parsed = await parseDocx(
      await makeDocx(
        p(r("Before")) +
          `<w:tbl><w:tr><w:tc>${p(r("cell"))}</w:tc></w:tr></w:tbl>` +
          p(`<w:r><w:drawing/></w:r>`) +
          p(`<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>`) +
          p(r("Claim") + `<w:r><w:footnoteReference w:id="2"/></w:r>`),
        {
          "word/footnotes.xml": `<?xml version="1.0"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:type="separator" w:id="0"/><w:footnote w:id="2">${p(r(" See the appendix."))}</w:footnote></w:footnotes>`,
        },
      ),
    );
    const texts = parsed.doc.content!.map((b) => JSON.stringify(b));
    expect(texts.some((t) => t.includes("[Table 1: in the original file]"))).toBe(true);
    expect(texts.some((t) => t.includes("[Figure 1: in the original file]"))).toBe(true);
    expect(texts.some((t) => t.includes("[Equation 1: in the original file]"))).toBe(true);
    expect(texts.some((t) => t.includes("Claim[1]"))).toBe(true);
    expect(parsed.kept).toEqual({ tables: 1, figures: 1, equations: 1, footnotes: 1 });
    expect(parsed.doc.content!.at(-2)).toMatchObject({ type: "heading", content: [{ text: "Notes" }] });
    expect(JSON.stringify(parsed.doc.content!.at(-1))).toContain("See the appendix.");
    assertEditorAccepts(parsed.doc);
  });
});

describe("parseDocx: reference manager citations", () => {
  it("reads Zotero citations with locators and drops Zotero's reference list", async () => {
    const parsed = await parseDocx(
      await makeDocx(
        p(r("Sediments hold fibres ") + field(zoteroCitation([{ id: 1, itemData: smith, locator: "4", label: "page" }, { id: 2, itemData: lee, prefix: "see", label: "chapter", locator: "3" }]), "(Smith, 2020, p. 4; see Lee, 2019)") + r(".")) +
          p(r("As ") + r("Smith") + r(" ") + field(zoteroCitation([{ id: 1, itemData: smith, "suppress-author": true }]), "(2020)") + r(" showed.")) +
          p(r("References"), "Heading1") +
          `<w:p>${'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> ADDIN ZOTERO_BIBL {"uncited":[]} CSL_BIBLIOGRAPHY </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'}${r("Lee, A. (2019). Sediments.")}</w:p>` +
          `<w:p>${r("Smith, J. (2020). Plastic in the deep.")}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
      ),
    );
    expect(parsed.citations).toHaveLength(2);
    const [first, second] = parsed.citations;
    expect(first.origin).toBe("zotero");
    expect(first.text).toBe("(Smith, 2020, p. 4; see Lee, 2019)");
    expect(first.items.map((i) => [i.source.title, i.locator, i.prefix])).toEqual([
      ["Plastic in the deep", "4", undefined],
      ["Sediments", "ch. 3", "see"],
    ]);
    expect(first.items[0].source).toMatchObject({ doi: "10.1000/deep", year: 2020, container: "Ocean Letters", authors: [{ family: "Smith", given: "John" }] });
    // "As Smith (2020) showed": the typed name goes, and the citation writes it instead.
    expect(second.mode).toBe("narrative");
    expect(parsed.doc.content![1].content).toEqual([{ type: "text", text: "As " }, { type: "citation", attrs: { pending: 1 } }, { type: "text", text: " showed." }]);
    expect(parsed.doc.content![0].content).toEqual([{ type: "text", text: "Sediments hold fibres " }, { type: "citation", attrs: { pending: 0 } }, { type: "text", text: "." }]);
    // The reference list and its heading are gone.
    expect(parsed.doc.content).toHaveLength(2);
    expect(parsed.referenceList).toEqual([]);
    assertEditorAccepts(parsed.doc);
  });

  it("reads Mendeley Cite citations from content controls", async () => {
    const json = JSON.stringify({ citationItems: [{ id: "a", itemData: lee }], properties: { noteIndex: 0 } });
    const tag = `MENDELEY_CITATION_v3_${Buffer.from(json).toString("base64")}`;
    const parsed = await parseDocx(await makeDocx(p(r("Text ") + `<w:sdt><w:sdtPr><w:tag w:val="${tag}"/></w:sdtPr><w:sdtContent>${r("(Lee, 2019)")}</w:sdtContent></w:sdt>`)));
    expect(parsed.citations[0]).toMatchObject({ origin: "mendeley", text: "(Lee, 2019)" });
    expect(parsed.citations[0].items[0].source.title).toBe("Sediments");
  });

  it("reads EndNote citations, including base64 field data", async () => {
    const record = `<EndNote><Cite><Author>Woodall</Author><Year>2014</Year><Pages>4</Pages><record><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Woodall, Lucy C.</author><author>Sanchez-Vidal, Anna</author></authors></contributors><titles><title>The deep sea is a major sink for microplastic debris</title><secondary-title>Royal Society Open Science</secondary-title></titles><volume>1</volume><number>4</number><dates><year>2014</year></dates><electronic-resource-num>10.1098/rsos.140317</electronic-resource-num></record></Cite></EndNote>`;
    const plain = await parseDocx(await makeDocx(p(field(`ADDIN EN.CITE ${record}`, "(Woodall et al., 2014, p. 4)"))));
    const encoded = await parseDocx(await makeDocx(p(field("ADDIN EN.CITE ADDIN EN.CITE.DATA ", "(Woodall et al., 2014)", Buffer.from(record).toString("base64")))));
    for (const parsed of [plain, encoded]) {
      expect(parsed.citations[0].origin).toBe("endnote");
      expect(parsed.citations[0].items[0].source).toMatchObject({
        kind: "article",
        title: "The deep sea is a major sink for microplastic debris",
        authors: [{ family: "Woodall", given: "Lucy C." }, { family: "Sanchez-Vidal", given: "Anna" }],
        year: 2014,
        doi: "10.1098/rsos.140317",
        container: "Royal Society Open Science",
      });
      expect(parsed.citations[0].items[0].locator).toBe("4");
    }
  });

  it("reads Word's own citations and their sources", async () => {
    const sources = `<?xml version="1.0"?><b:Sources xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography" SelectedStyle="\\APA.XSL"><b:Source><b:Tag>Lus17</b:Tag><b:SourceType>Report</b:SourceType><b:Author><b:Author><b:NameList><b:Person><b:Last>Lusher</b:Last><b:First>Amy</b:First></b:Person></b:NameList></b:Author></b:Author><b:Title>Microplastics in fisheries and aquaculture</b:Title><b:Year>2017</b:Year><b:Publisher>FAO</b:Publisher></b:Source></b:Sources>`;
    const parsed = await parseDocx(await makeDocx(p(field(" CITATION Lus17 \\p 12 \\l 2057 ", "(Lusher, 2017, p. 12)")), { "customXml/item1.xml": sources }));
    expect(parsed.citations[0]).toMatchObject({ origin: "word" });
    expect(parsed.citations[0].items[0]).toMatchObject({ locator: "12", source: { title: "Microplastics in fisheries and aquaculture", kind: "report", year: 2017, authors: [{ family: "Lusher", given: "Amy" }] } });
  });
});

describe("parseDocx: typed references", () => {
  it("takes the typed reference list out of the text", async () => {
    const parsed = await parseDocx(
      await makeDocx(
        p(r("Plastic sinks (Woodall et al., 2014).")) +
          p(r("References"), "Heading1") +
          p(r("Woodall, L. C., et al. (2014). The deep sea is a major sink for microplastic debris. Royal Society Open Science, 1(4).")) +
          p(r("Lusher, A. (2017). Microplastics in fisheries and aquaculture. FAO.")) +
          p(r("Appendix"), "Heading1") +
          p(r("Extra")),
      ),
    );
    expect(parsed.referenceList).toHaveLength(2);
    expect(parsed.referenceList[1]).toMatch(/^Lusher/);
    expect(parsed.doc.content!.map((b) => b.type)).toEqual(["paragraph", "heading", "paragraph"]);
  });
});

describe("parseDocx: unsafe files", () => {
  it("refuses files that aren't Word documents, have macros or declare entities", async () => {
    await expect(parseDocx(new TextEncoder().encode("not a zip"))).rejects.toBeInstanceOf(DocxError);
    const macro = await JSZip.loadAsync(await makeDocx(p(r("x"))));
    macro.file("word/vbaProject.bin", "x");
    await expect(parseDocx(await macro.generateAsync({ type: "uint8array" }))).rejects.toThrow(/macros/);
    const evil = await JSZip.loadAsync(await makeDocx(p(r("x"))));
    evil.file("word/document.xml", `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`);
    await expect(parseDocx(await evil.generateAsync({ type: "uint8array" }))).rejects.toBeInstanceOf(DocxError);
  });
});
