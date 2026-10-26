// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Editor, Extension, generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ySyncPlugin } from "y-prosemirror";
import { Citation } from "@/components/editor/citation";
import { canOpen, claimSchema, documentSchema, SCHEMA_VERSION } from "./schema-version";

// The React node view needs a React renderer; the schema and commands are what matter here.
const PlainCitation = Citation.extend({ addNodeView: () => null });

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

/** An editor bound to a Y.Doc the way the Liveblocks extension binds it. */
function editorOn(doc: Y.Doc, withCitations: boolean) {
  const fragment = doc.getXmlFragment("manuscript");
  const sync = Extension.create({ name: "testSync", addProseMirrorPlugins: () => [ySyncPlugin(fragment)] });
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ undoRedo: false }), ...(withCitations ? [PlainCitation] : []), sync],
  });
  editors.push(editor);
  return editor;
}

/** Keeps two documents in sync, as the Liveblocks server would. */
function connect(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u));
  b.on("update", (u: Uint8Array) => Y.applyUpdate(a, u));
}

function citations(json: JSONContent): JSONContent[] {
  return [...(json.type === "citation" ? [json] : []), ...(json.content ?? []).flatMap(citations)];
}

const cite = { items: [{ sourceId: "11111111-1111-4111-8111-111111111111", locator: "4" }], mode: "parenthetical" as const, label: "(Lusher, 2017, p. 4)" };

describe("editors on different schema versions", () => {
  it("an editor without the citation node deletes citations for everyone (why the gate exists)", () => {
    const current = new Y.Doc();
    const outdated = new Y.Doc();
    const a = editorOn(current, true);
    editorOn(outdated, false);
    connect(current, outdated);

    a.chain().insertContent("Microplastics are everywhere ").insertCitation(cite).run();

    // The shared document, which every other tab and the server see, has lost the citation.
    // If y-prosemirror ever stops deleting unknown nodes this fails, and the gate can be relaxed.
    const shared = current.getXmlFragment("manuscript").toString();
    expect(shared).toContain("Microplastics are everywhere");
    expect(shared).not.toContain("<citation");
  });

  it("the gate keeps outdated editors out once a newer one has written", () => {
    const current = new Y.Doc();
    const outdated = new Y.Doc();
    connect(current, outdated);
    expect(canOpen(outdated, 1)).toBe(true);

    claimSchema(current);
    expect(documentSchema(outdated)).toBe(SCHEMA_VERSION);
    expect(canOpen(outdated, 1)).toBe(false);
    expect(canOpen(outdated)).toBe(true);
  });

  it("claiming never lowers the version", () => {
    const doc = new Y.Doc();
    claimSchema(doc, SCHEMA_VERSION + 1);
    claimSchema(doc);
    expect(documentSchema(doc)).toBe(SCHEMA_VERSION + 1);
    expect(canOpen(doc)).toBe(false);
  });

  it("two current editors keep each other's citations", () => {
    const one = new Y.Doc();
    const two = new Y.Doc();
    const a = editorOn(one, true);
    const b = editorOn(two, true);
    connect(one, two);

    a.chain().insertContent("Text ").insertCitation(cite).run();
    expect(one.getXmlFragment("manuscript").toString()).toContain("<citation");
    expect(citations(b.getJSON())).toHaveLength(1);
    expect(citations(b.getJSON())[0].attrs).toMatchObject({ items: cite.items, mode: "parenthetical" });
  });

  it("concurrent citations made offline converge to the same document", () => {
    const one = new Y.Doc();
    const two = new Y.Doc();
    const a = editorOn(one, true);
    const b = editorOn(two, true);
    a.chain().insertCitation(cite).run();
    b.chain().insertCitation({ ...cite, items: [{ sourceId: "22222222-2222-4222-8222-222222222222" }] }).run();

    connect(one, two);
    expect(a.getJSON()).toEqual(b.getJSON());
    expect(citations(a.getJSON())).toHaveLength(2);
  });
});

describe("citation HTML", () => {
  const extensions = [StarterKit, PlainCitation];

  it("round-trips sources, locators and form", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "citation", attrs: { ...cite, mode: "narrative" } }] }] };
    const back = generateJSON(generateHTML(doc, extensions), extensions);
    expect(citations(back)[0].attrs).toMatchObject({ items: cite.items, mode: "narrative", label: cite.label });
  });

  it("reads citations from before multi-source citations", () => {
    const json = generateJSON('<p><span data-citation data-source-id="11111111-1111-4111-8111-111111111111">(Lusher, 2017)</span></p>', extensions);
    expect(citations(json)[0].attrs?.items).toEqual([{ sourceId: "11111111-1111-4111-8111-111111111111" }]);
  });

  it("drops a pasted citation with nothing valid in it", () => {
    const json = generateJSON('<p><span data-citation data-items="[{&quot;sourceId&quot;:&quot;nope&quot;}]">x</span></p>', extensions);
    expect(citations(json)).toHaveLength(0);
  });
});
