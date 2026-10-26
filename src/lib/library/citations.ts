/** The part of a ProseMirror node we read: anything that can walk its descendants. */
type Walkable = {
  descendants: (visit: (node: { type: { name: string }; attrs: Record<string, unknown> }) => boolean | void) => void;
};

export const CITATION_NODE = "citation";

/** Source ids cited in a document, in order of first appearance, plus how many citations there are. */
export function collectCitations(doc: Walkable) {
  const ids: string[] = [];
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name !== CITATION_NODE) return;
    count += 1;
    const id = node.attrs.sourceId;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  });
  return { ids, count };
}
