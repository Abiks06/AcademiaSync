import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import { CITATION_NODE, citationItems } from "@/lib/library/citations";

/** The Yjs field the editor's text lives in (useLiveblocksExtension({ field })). */
export const MANUSCRIPT_FIELD = "manuscript";

export type DocJSON = { type: string; attrs?: Record<string, unknown>; content?: DocJSON[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };

/** The manuscript as ProseMirror JSON, read straight from the Yjs document (no editor needed). */
export function manuscriptJSON(doc: Y.Doc): DocJSON {
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(MANUSCRIPT_FIELD)) as DocJSON;
  return { type: "doc", content: (json.content ?? []).map(tidy) };
}

/** Marks without attributes come back with an empty object; drop it, as the editor does. */
function tidy(node: DocJSON): DocJSON {
  return {
    ...node,
    ...(node.marks && { marks: node.marks.map((m) => (m.attrs && Object.keys(m.attrs).length ? m : { type: m.type })) }),
    ...(node.content && { content: node.content.map(tidy) }),
  };
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "bulletList", "orderedList", "horizontalRule"]);

/** Plain text for search, history previews and export: blocks on their own lines, citations as their label. */
export function plainText(node: DocJSON): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === CITATION_NODE) return String(node.attrs?.label || "(citation)");
  const inner = (node.content ?? []).map(plainText);
  if (node.type === "doc" || node.type === "bulletList" || node.type === "orderedList" || node.type === "blockquote") {
    return inner.filter(Boolean).join("\n\n");
  }
  return inner.join("");
}

/** How many times each source is cited in a manuscript. */
export function citationCounts(node: DocJSON, counts = new Map<string, number>()) {
  if (node.type === CITATION_NODE) {
    for (const { sourceId } of citationItems(node.attrs ?? {})) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
  }
  node.content?.forEach((child) => citationCounts(child, counts));
  return counts;
}

/** Node and mark types the editor understands. A version with anything else can't be restored. */
const NODES = new Set([...BLOCKS, "doc", "text", "hardBreak", CITATION_NODE]);
const MARKS = new Set(["bold", "italic", "strike", "code", "link", "underline"]);

/** Checks that stored content has only nodes the editor knows, so restoring can't blank the document. */
export function isRestorable(node: unknown, depth = 0): node is DocJSON {
  if (depth > 200 || typeof node !== "object" || node === null) return false;
  const n = node as DocJSON;
  if (typeof n.type !== "string" || !NODES.has(n.type)) return false;
  if (n.type === "text" && typeof n.text !== "string") return false;
  if (n.content !== undefined && (!Array.isArray(n.content) || !n.content.every((c) => isRestorable(c, depth + 1)))) return false;
  return true;
}

function textAttributes(marks: DocJSON["marks"]) {
  const attrs: Record<string, Record<string, unknown>> = {};
  // Comment highlights are left out: their threads stay in the comments list.
  for (const mark of marks ?? []) if (MARKS.has(mark.type)) attrs[mark.type] = mark.attrs ?? {};
  return Object.keys(attrs).length ? attrs : undefined;
}

/** Yjs types for a list of children, merging neighbouring text runs the way the editor stores them. */
function toYChildren(content: DocJSON[]): (Y.XmlElement | Y.XmlText)[] {
  const out: (Y.XmlElement | Y.XmlText)[] = [];
  let run: { insert: string; attributes?: Record<string, unknown> }[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const text = new Y.XmlText();
    text.applyDelta(run);
    out.push(text);
    run = [];
  };
  for (const node of content) {
    if (node.type === "text") {
      if (node.text) run.push({ insert: node.text, attributes: textAttributes(node.marks) });
      continue;
    }
    flush();
    const element = new Y.XmlElement(node.type);
    for (const [key, value] of Object.entries(node.attrs ?? {})) if (value !== null && value !== undefined) element.setAttribute(key, value as string);
    element.insert(0, toYChildren(node.content ?? []));
    out.push(element);
  }
  flush();
  return out;
}

/**
 * Replaces the manuscript with `content` in one Yjs transaction. Sent as one update, so
 * everyone's editor moves to the restored text together; nobody's browser does the restore.
 */
export function replaceManuscript(doc: Y.Doc, content: DocJSON) {
  const fragment = doc.getXmlFragment(MANUSCRIPT_FIELD);
  const children = toYChildren(content.content ?? []);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, children.length ? children : [new Y.XmlElement("paragraph")]);
  });
}

/** True for a document that has never been written to, like a room that was lost or recreated. */
export function isBlank(doc: Y.Doc) {
  return doc.store.clients.size === 0;
}
