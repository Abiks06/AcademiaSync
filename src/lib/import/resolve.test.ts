import { describe, expect, it } from "vitest";
import type { Source, SourceFields } from "@/lib/library/types";
import { parseDocx } from "./docx";
import { field, makeDocx, p, r } from "./docx-fixture";
import { analyzeImport, assembleDocument } from "./resolve";

const fields = (over: Partial<SourceFields>): SourceFields => ({
  kind: "article", title: "", authors: [], year: null, container: null, volume: null, issue: null, pages: null, publisher: null, doi: null, url: null, abstract: null, notes: null, ...over,
});
const inLibrary = (id: string, over: Partial<SourceFields>): Source => ({
  ...fields(over), id, project_id: "p", created_at: "", updated_at: "", deleted_at: null,
});

const woodall = fields({ title: "The deep sea is a major sink for microplastic debris", authors: [{ family: "Woodall", given: "Lucy" }], year: 2014, doi: "10.1098/rsos.140317" });
const lusher = fields({ title: "Microplastics in fisheries and aquaculture", authors: [{ family: "Lusher", given: "Amy" }], year: 2017, kind: "report" });

describe("analyzeImport: typed references", () => {
  const doc = async () =>
    parseDocx(
      await makeDocx(
        p(r("Plastic sinks (Woodall et al., 2014; Lusher, 2017; Ghost, 2001), as Thompson (2004) found.")) +
          p(r("References"), "Heading1") +
          p(r("Woodall, L. C., Sanchez-Vidal, A., & Canals, M. (2014). The deep sea is a major sink for microplastic debris. Royal Society Open Science, 1(4).")) +
          p(r("Lusher, A. (2017). Microplastics in fisheries and aquaculture. FAO.")) +
          p(r("Thompson, R. C. (2004). Lost at sea: where is all the plastic? Science, 304.")),
      ),
    );

  it("links the library first, then Crossref when it agrees, and asks about the rest", async () => {
    const parsed = await doc();
    const analysis = await analyzeImport(parsed, [inLibrary("lib-lusher", lusher)], {
      search: async (ref) =>
        ref.startsWith("Woodall")
          ? { source: woodall, score: 72 }
          : // A confident-looking Crossref hit for the wrong paper.
            { source: fields({ title: "Plastic on beaches", authors: [{ family: "Thompson", given: "R" }], year: 2009 }), score: 61 },
      doi: async () => null,
    });
    expect(analysis.origin).toBe("typed");
    expect(analysis.sources.map((s) => [s.key, s.status, s.libraryId])).toEqual([
      ["e:0", "matched", null],
      ["e:1", "library", "lib-lusher"],
      ["e:2", "suggested", null],
    ]);
    // Ghost 2001 has no reference: that part is unmatched.
    expect(analysis.citations[0].parts.map((p) => p.sourceKey)).toEqual(["e:0", "e:1", null]);
  });

  it("puts back the typed text of any citation that isn't fully linked", async () => {
    const parsed = await doc();
    const analysis = await analyzeImport(parsed, [], null);
    const assembled = assembleDocument(analysis, new Map([["e:2", "src-thompson"]]));
    expect(assembled.content![0].content).toEqual([
      { type: "text", text: "Plastic sinks (Woodall et al., 2014; Lusher, 2017; Ghost, 2001), as " },
      { type: "citation", attrs: { items: [{ sourceId: "src-thompson" }], mode: "narrative", label: "Thompson (2004)" } },
      { type: "text", text: " found." },
    ]);
  });
});

describe("analyzeImport: reference manager fields", () => {
  it("merges sources the library already has and counts citations", async () => {
    const zotero = (items: unknown[]) => `ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify({ citationItems: items })}`;
    const csl = { type: "article-journal", title: woodall.title, author: [{ family: "Woodall", given: "Lucy" }], issued: { "date-parts": [[2014]] }, DOI: woodall.doi };
    const other = { type: "book", title: "A new book", author: [{ family: "Ng", given: "K" }], issued: { "date-parts": [[2021]] } };
    const parsed = await parseDocx(await makeDocx(p(field(zotero([{ itemData: csl, locator: "3" }]), "(Woodall, 2014, p. 3)") + r(" and ") + field(zotero([{ itemData: csl }, { itemData: other }]), "(Woodall, 2014; Ng, 2021)"))));
    const analysis = await analyzeImport(parsed, [inLibrary("lib-woodall", woodall)], null);
    expect(analysis.sources.map((s) => [s.status, s.libraryId, s.citations])).toEqual([
      ["library", "lib-woodall", 2],
      ["new", null, 1],
    ]);
    const ids = new Map(analysis.sources.map((s) => [s.key, s.libraryId ?? "new-id"]));
    const assembled = assembleDocument(analysis, ids);
    expect(assembled.content![0].content![0]).toEqual({ type: "citation", attrs: { items: [{ sourceId: "lib-woodall", locator: "3" }], mode: "parenthetical", label: "(Woodall, 2014, p. 3)" } });
    expect(assembled.content![0].content![2].attrs!.items).toEqual([{ sourceId: "lib-woodall" }, { sourceId: "new-id" }]);
  });
});
