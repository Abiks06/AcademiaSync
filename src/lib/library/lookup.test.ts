import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupDoi, mapCrossrefWork } from "./crossref";
import { detectIdentifier, mapArxivEntry, mapPubmedSummary } from "./lookup";

describe("detectIdentifier", () => {
  it("recognises DOIs, arXiv ids and PubMed ids in the ways people paste them", () => {
    expect(detectIdentifier("https://doi.org/10.1021/ES2031505")).toEqual({ kind: "doi", id: "10.1021/es2031505" });
    expect(detectIdentifier("arXiv:2101.01234v2")).toEqual({ kind: "arxiv", id: "2101.01234" });
    expect(detectIdentifier("https://arxiv.org/abs/hep-th/9901001")).toEqual({ kind: "arxiv", id: "hep-th/9901001" });
    expect(detectIdentifier("10.48550/arXiv.2101.01234")).toEqual({ kind: "arxiv", id: "2101.01234" });
    expect(detectIdentifier("PMID: 22356627")).toEqual({ kind: "pubmed", id: "22356627" });
    expect(detectIdentifier("PMID 22356627")).toEqual({ kind: "pubmed", id: "22356627" });
    expect(detectIdentifier("https://pubmed.ncbi.nlm.nih.gov/22356627/")).toEqual({ kind: "pubmed", id: "22356627" });
    expect(detectIdentifier("not an id")).toBeNull();
  });
});

describe("mapCrossrefWork with malformed records", () => {
  it("never throws on wrongly typed fields", () => {
    expect(mapCrossrefWork(null)).toBeNull();
    expect(mapCrossrefWork({ title: "A plain string title", author: [{ family: 5 }, null, "x", { name: "Org" }] })).toMatchObject({
      title: "A plain string title",
      authors: [{ family: "Org", given: "" }],
    });
  });

  it("trims long names to what saving accepts", () => {
    const source = mapCrossrefWork({ title: ["T"], author: [{ name: "The ".concat("Very ".repeat(40), "Long Collaboration") }] });
    expect(source!.authors[0].family.length).toBeLessThanOrEqual(100);
  });
});

describe("lookupDoi", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: string) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));

  it("explains each failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await lookupDoi("10.1021/x1")).toMatchObject({ ok: false, error: expect.stringContaining("Couldn't reach") });
    respond(404, "");
    expect(await lookupDoi("10.1021/x1")).toMatchObject({ ok: false, error: expect.stringContaining("no record") });
    respond(429, "");
    expect(await lookupDoi("10.1021/x1")).toMatchObject({ ok: false, error: expect.stringContaining("busy") });
    respond(500, "");
    expect(await lookupDoi("10.1021/x1")).toMatchObject({ ok: false, error: expect.stringContaining("problem") });
    respond(200, "{not json");
    expect(await lookupDoi("10.1021/x1")).toMatchObject({ ok: false });
    respond(200, JSON.stringify({ message: { title: 7 } }));
    expect(await lookupDoi("10.1021/x1")).toMatchObject({ ok: false });
  });

  it("returns a source that keeps the DOI", async () => {
    respond(200, JSON.stringify({ message: { title: ["Found"], author: [{ family: "Lusher", given: "Amy" }] } }));
    expect(await lookupDoi("10.1021/X1")).toMatchObject({ ok: true, source: { title: "Found", doi: "10.1021/x1" } });
  });
});

describe("mapArxivEntry", () => {
  it("reads title, authors, year and the arXiv DOI", () => {
    const xml = `<feed><entry><id>http://arxiv.org/abs/2101.01234v1</id><published>2021-01-05T00:00:00Z</published>
      <title>Deep  learning &amp; plastics</title><summary>We study things.</summary>
      <author><name>Amy L. Lusher</name></author><author><name>Peter Hollman</name></author></entry></feed>`;
    expect(mapArxivEntry(xml, "2101.01234")).toMatchObject({
      ok: true,
      source: {
        title: "Deep learning & plastics",
        authors: [{ family: "Lusher", given: "Amy L." }, { family: "Hollman", given: "Peter" }],
        year: 2021,
        container: "arXiv",
        doi: "10.48550/arxiv.2101.01234",
      },
    });
  });

  it("reports an unknown id", () => {
    expect(mapArxivEntry("<feed></feed>", "0000.00000")).toMatchObject({ ok: false });
  });
});

describe("mapPubmedSummary", () => {
  it("reads a summary record", () => {
    const body = {
      result: {
        "22356627": {
          title: "Microplastics in the marine environment.",
          authors: [{ name: "Hidalgo-Ruz V" }, { name: "Gutow L" }],
          pubdate: "2012 Mar 20",
          fulljournalname: "Environmental science & technology",
          volume: "46",
          issue: "6",
          pages: "3060-75",
          articleids: [{ idtype: "doi", value: "10.1021/es2031505" }],
        },
      },
    };
    expect(mapPubmedSummary(body, "22356627")).toMatchObject({
      ok: true,
      source: { title: "Microplastics in the marine environment", authors: [{ family: "Hidalgo-Ruz", given: "V" }, { family: "Gutow", given: "L" }], year: 2012, doi: "10.1021/es2031505", url: null },
    });
  });

  it("reports an unknown id", () => {
    expect(mapPubmedSummary({ result: {} }, "1")).toMatchObject({ ok: false });
  });
});
