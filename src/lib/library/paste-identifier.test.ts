import { describe, expect, it } from "vitest";
import { identifierQuery, matchesIdentifier, pastedIdentifier } from "./paste-identifier";

describe("pastedIdentifier", () => {
  it("takes DOIs in every usual form", () => {
    expect(pastedIdentifier("10.1126/science.1094559")).toEqual({ kind: "doi", id: "10.1126/science.1094559" });
    expect(pastedIdentifier("https://doi.org/10.1126/SCIENCE.1094559")).toEqual({ kind: "doi", id: "10.1126/science.1094559" });
    expect(pastedIdentifier(" doi:10.1371/journal.pone.0111913 ")).toEqual({ kind: "doi", id: "10.1371/journal.pone.0111913" });
  });

  it("finds the DOI in a publisher's link and drops what follows it", () => {
    expect(pastedIdentifier("https://onlinelibrary.wiley.com/doi/full/10.1002/anie.201915678")).toEqual({ kind: "doi", id: "10.1002/anie.201915678" });
    expect(pastedIdentifier("https://www.science.org/doi/10.1126/science.1260352/abstract")).toEqual({ kind: "doi", id: "10.1126/science.1260352" });
    expect(pastedIdentifier("https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111913")).toBeNull();
  });

  it("takes arXiv and PubMed only when they say so", () => {
    expect(pastedIdentifier("https://arxiv.org/abs/2101.01234v2")).toEqual({ kind: "arxiv", id: "2101.01234" });
    expect(pastedIdentifier("arXiv:2101.01234")).toEqual({ kind: "arxiv", id: "2101.01234" });
    expect(pastedIdentifier("https://pubmed.ncbi.nlm.nih.gov/12345678/")).toEqual({ kind: "pubmed", id: "12345678" });
    expect(pastedIdentifier("PMID:12345678")).toEqual({ kind: "pubmed", id: "12345678" });
  });

  it("drops punctuation a sentence leaves on the end", () => {
    expect(pastedIdentifier("10.1126/science.1094559.")).toEqual({ kind: "doi", id: "10.1126/science.1094559" });
    expect(pastedIdentifier("https://doi.org/10.1126/science.1094559),")).toEqual({ kind: "doi", id: "10.1126/science.1094559" });
    expect(pastedIdentifier("doi:10.1126/science.1094559\u201d")).toEqual({ kind: "doi", id: "10.1126/science.1094559" });
    // Balanced parentheses are part of some DOIs.
    expect(pastedIdentifier("10.1016/S0140-6736(20)30183-5")).toEqual({ kind: "doi", id: "10.1016/s0140-6736(20)30183-5" });
    expect(pastedIdentifier("10.1016/S0140-6736(20)30183-5).")).toEqual({ kind: "doi", id: "10.1016/s0140-6736(20)30183-5" });
  });

  it("drops the version and page from bioRxiv and medRxiv links", () => {
    const id = { kind: "doi", id: "10.1101/2020.03.01.972133" };
    expect(pastedIdentifier("https://www.biorxiv.org/content/10.1101/2020.03.01.972133v2")).toEqual(id);
    expect(pastedIdentifier("https://www.biorxiv.org/content/10.1101/2020.03.01.972133v1.full.pdf")).toEqual(id);
    expect(pastedIdentifier("https://www.medrxiv.org/content/10.1101/2020.03.01.972133v3.full")).toEqual(id);
    expect(pastedIdentifier("https://doi.org/10.1101/2020.03.01.972133")).toEqual(id);
  });

  it("takes the old PubMed address", () => {
    expect(pastedIdentifier("https://www.ncbi.nlm.nih.gov/pubmed/12345678")).toEqual({ kind: "pubmed", id: "12345678" });
    expect(pastedIdentifier("http://ncbi.nlm.nih.gov/pubmed/12345678/")).toEqual({ kind: "pubmed", id: "12345678" });
  });

  it("ignores a link with a broken escape instead of throwing", () => {
    expect(pastedIdentifier("https://example.com/doi/10.1000/abc%E0%A4%A")).toBeNull();
  });

  it("leaves ordinary text alone", () => {
    for (const text of ["2101.01234", "12345678", "2024", "see 10.1126/science.1094559", "https://example.com/page", "hello", ""]) {
      expect(pastedIdentifier(text)).toBeNull();
    }
  });
});

describe("matchesIdentifier", () => {
  it("matches a library entry by DOI, arXiv note or PMID note", () => {
    expect(matchesIdentifier({ doi: "10.1126/science.1094559", notes: null }, { kind: "doi", id: "10.1126/science.1094559" })).toBe(true);
    expect(matchesIdentifier({ doi: null, notes: "arXiv:2101.01234" }, { kind: "arxiv", id: "2101.01234" })).toBe(true);
    expect(matchesIdentifier({ doi: "10.48550/arxiv.2101.01234", notes: null }, { kind: "arxiv", id: "2101.01234" })).toBe(true);
    expect(matchesIdentifier({ doi: null, notes: "PMID: 123" }, { kind: "pubmed", id: "123" })).toBe(true);
    expect(matchesIdentifier({ doi: null, notes: "PMID: 1234" }, { kind: "pubmed", id: "123" })).toBe(false);
  });

  it("writes the lookup query the importer understands", () => {
    expect(identifierQuery({ kind: "pubmed", id: "1" })).toBe("PMID:1");
    expect(identifierQuery({ kind: "arxiv", id: "2101.01234" })).toBe("arXiv:2101.01234");
  });
});
