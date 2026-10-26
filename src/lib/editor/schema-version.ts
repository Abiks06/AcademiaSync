import type * as Y from "yjs";

/**
 * The version of the editor's document schema (the kinds of node and mark it understands).
 * Raise it whenever a node or mark is added, and raise MIN_SCHEMA_VERSION with it when
 * older editors must stop editing.
 *
 * Why it matters: an editor that meets a node it doesn't know deletes it from the shared
 * document, for everyone. So an outdated tab must never edit a document written by a newer
 * one, and a newer tab must not add new kinds of node while an outdated tab is open on it.
 *
 * 1: text, headings, lists, quotes, code. 2: citations.
 */
export const SCHEMA_VERSION = 2;

/** Editors older than this can't get a token for a room at all. */
export const MIN_SCHEMA_VERSION = 2;

const META = "academiasync";
const SCHEMA_KEY = "schema";
const STYLE_KEY = "citationStyle";

/** The newest schema that has written to this document; 0 for a document that predates the field. */
export function documentSchema(doc: Y.Doc) {
  const value = doc.getMap(META).get(SCHEMA_KEY);
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

/** Records that this editor's schema has written to the document. Never lowers it. */
export function claimSchema(doc: Y.Doc) {
  if (documentSchema(doc) < SCHEMA_VERSION) doc.getMap(META).set(SCHEMA_KEY, SCHEMA_VERSION);
}

export function canOpen(doc: Y.Doc) {
  return documentSchema(doc) <= SCHEMA_VERSION;
}

/** Document settings shared live between everyone editing, like the citation style. */
export function documentMeta(doc: Y.Doc) {
  return doc.getMap(META);
}

export function readStyle(doc: Y.Doc) {
  return doc.getMap(META).get(STYLE_KEY);
}

export function writeStyle(doc: Y.Doc, style: string) {
  doc.getMap(META).set(STYLE_KEY, style);
}

/** Reads the schema version an auth request says its editor has. Missing means an editor from before versioning. */
export function requestSchema(body: unknown) {
  const value = (body as { schema?: unknown } | null)?.schema;
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}
