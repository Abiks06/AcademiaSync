/** The part of a ProseMirror node we read: anything that can walk its descendants. */
type Walkable = {
  descendants: (visit: (node: { type: { name: string }; attrs: Record<string, unknown> }) => boolean | void) => void;
};

export const CITATION_NODE = "citation";

/** One source inside an in-text citation, with an optional page or other locator. */
export type CitationItem = { sourceId: string; locator?: string; prefix?: string; suffix?: string };

/** "(Lusher, 2017)" is parenthetical; "Lusher (2017)" is narrative. */
export type CitationMode = "parenthetical" | "narrative";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

/**
 * The sources a citation node cites. Attributes come from the shared document, which any
 * editor can write to, so everything is checked here. Early citations held one `sourceId`.
 */
export function citationItems(attrs: Record<string, unknown>): CitationItem[] {
  const raw = Array.isArray(attrs.items) ? attrs.items : typeof attrs.sourceId === "string" ? [{ sourceId: attrs.sourceId }] : [];
  return raw.slice(0, 20).flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { sourceId, locator, prefix, suffix } = item as Record<string, unknown>;
    if (typeof sourceId !== "string" || !UUID.test(sourceId)) return [];
    const clean: CitationItem = { sourceId };
    const l = text(locator, 40);
    const p = text(prefix, 60);
    const s = text(suffix, 60);
    if (l) clean.locator = l;
    if (p) clean.prefix = p;
    if (s) clean.suffix = s;
    return [clean];
  });
}

export function citationMode(attrs: Record<string, unknown>): CitationMode {
  return attrs.mode === "narrative" ? "narrative" : "parenthetical";
}

/** Source ids cited in a document, in order of first appearance, plus how many citations there are. */
export function collectCitations(doc: Walkable) {
  const ids: string[] = [];
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name !== CITATION_NODE) return;
    count += 1;
    for (const { sourceId } of citationItems(node.attrs)) if (!ids.includes(sourceId)) ids.push(sourceId);
  });
  return { ids, count };
}
