// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Editor, Extension, generateHTML, generateJSON, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ySyncPlugin } from "y-prosemirror";
import { CitationNode } from "./citation-node";
import { canOpen, claimSchema, documentSchema, SCHEMA_VERSION } from "./schema-version";

// The schema and commands without the React view, as the server uses them.
const PlainCitation = CitationNode;

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

/** The editor's JSON without null attributes, which the Yjs document doesn't store. */
function stored(json: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(json, (key, value) => (value === null ? undefined : value)));
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

describe("server-side reading and restoring", () => {
  it("reads text, citations and plain text from the Yjs document alone", async () => {
    const { manuscriptJSON, plainText, citationCounts } = await import("./ydoc");
    const doc = new Y.Doc();
    const a = editorOn(doc, true);
    a.chain().insertContent("<h2>Intro</h2><p>Plastic <strong>everywhere</strong> </p>").insertCitation(cite).insertCitation(cite).run();

    const json = manuscriptJSON(doc);
    expect(json).toEqual(stored(a.getJSON()));
    expect(plainText(json)).toBe("Intro\n\nPlastic everywhere (Lusher, 2017, p. 4) (Lusher, 2017, p. 4) ");
    expect([...citationCounts(json)]).toEqual([[cite.items[0].sourceId, 2]]);
  });

  it("restores content into a live document, and every editor follows", async () => {
    const { replaceManuscript, manuscriptJSON, isBlank } = await import("./ydoc");
    const server = new Y.Doc();
    const browser = new Y.Doc();
    const b = editorOn(browser, true);
    connect(server, browser);
    b.chain().insertContent("Text written after the version").run();

    const version: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Methods" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }, { type: "text", text: " and " }, { type: "citation", attrs: cite }] },
      ],
    };
    replaceManuscript(server, version as never);

    expect(stored(b.getJSON())).toEqual(manuscriptJSON(server));
    expect(b.getText()).not.toContain("written after");
    expect(citations(b.getJSON())).toHaveLength(1);
    expect(b.getJSON().content?.[1].content?.[0].marks).toEqual([{ type: "bold" }]);
    expect(isBlank(new Y.Doc())).toBe(true);
    expect(isBlank(server)).toBe(false);
  });

  it("refuses to restore content the editor doesn't understand", async () => {
    const { isRestorable } = await import("./ydoc");
    expect(isRestorable({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ok" }] }] })).toBe(true);
    expect(isRestorable({ type: "doc", content: [{ type: "image" }] })).toBe(false);
    expect(isRestorable({ type: "doc", content: "nope" })).toBe(false);
    expect(isRestorable(null)).toBe(false);
  });
});
