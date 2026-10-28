import { describe, expect, it } from "vitest";
import type { DocJSON } from "@/lib/editor/ydoc";
import { findTypedCitations, parseEntry } from "./typed-citations";

const apaList = [
  "Woodall, L. C., Sanchez-Vidal, A., & Canals, M. (2014). The deep sea is a major sink for microplastic debris. Royal Society Open Science, 1(4), 140317. https://doi.org/10.1098/rsos.140317",
  "Lusher, A. (2017). Microplastics in fisheries and aquaculture. FAO.",
  "Smith, J. (2020a). Apple study. Journal, 1.",
  "Smith, J. (2020b). Zebra study. Journal, 2.",
  "Smith, J., & Lee, B. (2018). Joint work. Journal, 3.",
  "Thompson, R. C. (2004). Lost at sea. Science, 304.",
].map(parseEntry);

const para = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("parseEntry", () => {
  it("reads authors, year, suffix and DOI from APA, Harvard, IEEE and Vancouver entries", () => {
    expect(apaList[0]).toMatchObject({ families: ["Woodall", "Sanchez-Vidal", "Canals"], year: 2014, suffix: "", doi: "10.1098/rsos.140317", number: null });
    expect(apaList[3]).toMatchObject({ families: ["Smith"], year: 2020, suffix: "b" });
    expect(parseEntry("Woodall, L.C. et al. (2014) ‘The deep sea is a major sink’, Royal Society Open Science, 1(4).", 0)).toMatchObject({ families: ["Woodall"], year: 2014 });
    expect(parseEntry("[3] L. C. Woodall, A. Sanchez-Vidal, and M. Canals, “The deep sea is a major sink,” R. Soc. Open Sci., vol. 1, 2014.", 0)).toMatchObject({ number: 3, families: ["Woodall", "Sanchez-Vidal", "Canals"], year: 2014 });
    expect(parseEntry("12. Woodall LC, Sanchez-Vidal A. The deep sea is a major sink. R Soc Open Sci. 2014;1(4).", 0)).toMatchObject({ number: 12, families: ["Woodall", "Sanchez-Vidal"], year: 2014 });
  });
});

describe("findTypedCitations: author-date", () => {
  it("finds parenthetical citations with several works, prefixes and pages", () => {
    const { doc, citations } = findTypedCitations(para("Plastic sinks (see Woodall et al., 2014, p. 4; Lusher, 2017) and stays."), apaList);
    expect(citations).toHaveLength(1);
    expect(citations[0].parts.map((p) => [p.entry, p.prefix, p.locator])).toEqual([
      [0, "see", "4"],
      [1, undefined, undefined],
    ]);
    expect(doc.content![0].content).toEqual([
      { type: "text", text: "Plastic sinks " },
      { type: "citation", attrs: { pending: 0 } },
      { type: "text", text: " and stays." },
    ]);
  });

  it("finds narrative citations and tells a and b apart", () => {
    const { citations } = findTypedCitations(para("As Smith (2020b) and Smith and Lee (2018) showed, and Thompson (2004, p. 2) agreed."), apaList);
    expect(citations.map((c) => [c.mode, c.text, c.parts[0].entry, c.parts[0].locator])).toEqual([
      ["narrative", "Smith (2020b)", 3, undefined],
      ["narrative", "Smith and Lee (2018)", 4, undefined],
      ["narrative", "Thompson (2004, p. 2)", 5, "2"],
    ]);
  });

  it("collapses years by the same author", () => {
    const { citations } = findTypedCitations(para("(Smith, 2020a, 2020b)"), apaList);
    expect(citations[0].parts.map((p) => p.entry)).toEqual([2, 3]);
  });

  it("leaves a citation unmatched rather than guess", () => {
    const { citations } = findTypedCitations(para("(Smith, 2020) and (Jones, 2001)"), apaList);
    // Two Smith 2020 works and no letter: ambiguous. No Jones: missing.
    expect(citations.map((c) => c.parts[0].entry)).toEqual([null, null]);
  });

  it("ignores brackets that only mention a year", () => {
    const { citations } = findTypedCitations(para("Since the survey (2019) and (n = 2020 samples) nothing changed."), apaList);
    expect(citations).toEqual([]);
  });
});

describe("findTypedCitations: numeric", () => {
  const ieee = ["[1] A. Lusher, “Microplastics,” FAO, 2017.", "[2] L. C. Woodall, “The deep sea,” 2014.", "[3] R. C. Thompson, “Lost at sea,” 2004."].map(parseEntry);
  it("finds [n], lists and ranges", () => {
    const { citations } = findTypedCitations(para("Seen before [1], [2, 3] and [1–3] and [2, p. 7]."), ieee);
    expect(citations.map((c) => c.parts.map((p) => p.entry))).toEqual([[0], [1, 2], [0, 1, 2], [1]]);
    expect(citations[3].parts[0].locator).toBe("7");
  });
});
