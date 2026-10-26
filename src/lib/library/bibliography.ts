import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Cite, plugins } from "@citation-js/core";
import "@citation-js/plugin-csl";
import { toCslItem } from "./csl-json";
import { isNumericStyle, type CitationStyle } from "./styles";
import type { SourceFields } from "./types";

/** The CSL file behind each style. Vancouver ships with citation-js. */
const TEMPLATE: Record<CitationStyle, { name: string; file?: string }> = {
  apa: { name: "as-apa", file: "apa.csl" },
  harvard: { name: "as-harvard", file: "harvard-cite-them-right.csl" },
  chicago: { name: "as-chicago", file: "chicago-author-date.csl" },
  ieee: { name: "as-ieee", file: "ieee.csl" },
  vancouver: { name: "vancouver" },
};

const registered = new Set<string>();
function template(style: CitationStyle) {
  const { name, file } = TEMPLATE[style];
  if (file && !registered.has(name)) {
    const xml = readFileSync(join(process.cwd(), "src/lib/library/csl", file), "utf8");
    plugins.config.get("@csl").styles.add(name, xml);
    registered.add(name);
  }
  return name;
}

const ALLOWED = new Set(["i", "b", "em", "strong", "sup", "sub", "span"]);
const KEPT_CLASSES = new Set(["csl-left-margin", "csl-right-inline"]);

/**
 * CSL output is HTML with italics and the like. Titles come from people and Crossref, so
 * keep only a few formatting tags, without attributes, before it reaches a page.
 */
export function sanitizeCslHtml(html: string) {
  return html
    .replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_, slash: string, tag: string, attrs: string) => {
      const name = tag.toLowerCase() === "div" ? "span" : tag.toLowerCase();
      if (!ALLOWED.has(name)) return "";
      if (slash) return `</${name}>`;
      const cls = /class="([^"]*)"/.exec(attrs)?.[1];
      return cls && KEPT_CLASSES.has(cls) ? `<${name} class="${cls}">` : `<${name}>`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export type BibliographyEntry = { id: string; html: string; text: string };

/**
 * The reference list for the cited sources in a CSL style. `sources` comes in order of first
 * citation, which numeric styles keep; author-date styles sort as the style says.
 */
export function formatBibliography(sources: (SourceFields & { id: string })[], style: CitationStyle): BibliographyEntry[] {
  if (sources.length === 0) return [];
  const cite = new Cite(sources.map((s) => toCslItem(s.id, s)));
  const name = template(style);
  const options = { template: name, lang: "en-GB", asEntryArray: true as const, ...(isNumericStyle(style) && { entry: sources.map((s) => s.id) }) };
  const html = cite.format("bibliography", { ...options, format: "html" as const }) as unknown as [string, string][];
  const text = new Map(cite.format("bibliography", { ...options, format: "text" as const }) as unknown as [string, string][]);
  return html.map(([id, entry]) => ({ id, html: sanitizeCslHtml(entry), text: (text.get(id) ?? "").trim() }));
}
