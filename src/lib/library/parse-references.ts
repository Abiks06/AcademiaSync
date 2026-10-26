import "server-only";
import { plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import { mapCslItem } from "./csl-json";
import type { SourceFields } from "./types";

export const IMPORT_LIMITS = { bytes: 900_000, entries: 500 } as const;

export type ParsedReferences =
  | { ok: true; format: "bibtex" | "ris"; sources: SourceFields[]; skipped: number }
  | { ok: false; error: string };

/** RIS records start with "TY  - "; anything else with an @entry is read as BibTeX. */
function detectFormat(text: string) {
  if (/^\s*TY {2}- /m.test(text)) return "ris" as const;
  if (/@\s*[a-zA-Z]+\s*[{(]/.test(text)) return "bibtex" as const;
  return null;
}

/**
 * Reads a BibTeX or RIS export (from Zotero, Mendeley, EndNote, Google Scholar…) into the
 * library's fields. The format is fixed before parsing, so text that looks like a DOI or a
 * link is never fetched from the network.
 */
export function parseReferences(text: string): ParsedReferences {
  if (text.length > IMPORT_LIMITS.bytes) return { ok: false, error: "That file is too large. Split it into files under 900 KB." };
  const format = detectFormat(text);
  if (!format) return { ok: false, error: "That doesn't look like a BibTeX (.bib) or RIS (.ris) file." };

  let items: unknown[];
  try {
    const options = { forceType: format === "ris" ? "@ris/file" : "@bibtex/text", generateGraph: false };
    const parsed = plugins.input.chain(text, options as Parameters<typeof plugins.input.chain>[1]);
    items = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[import] parse failed", error);
    return { ok: false, error: `The ${format === "ris" ? "RIS" : "BibTeX"} file couldn't be read. Check it opens in your reference manager.` };
  }
  if (items.length > IMPORT_LIMITS.entries) {
    return { ok: false, error: `That file has ${items.length} references. Import up to ${IMPORT_LIMITS.entries} at a time.` };
  }

  const sources: SourceFields[] = [];
  for (const item of items) {
    const source = mapCslItem(item);
    if (source) sources.push(source);
  }
  if (sources.length === 0) return { ok: false, error: "No references with a title were found in that file." };
  return { ok: true, format, sources, skipped: items.length - sources.length };
}
