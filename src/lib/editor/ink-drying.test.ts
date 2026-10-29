// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ySyncPlugin } from "y-prosemirror";
import { InkDrying, wetRanges } from "./ink-drying";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

/** An editor bound to a Y.Doc the way the Liveblocks extension binds it, with ink drying on. */
function editorOn(doc: Y.Doc, color: string | null = "#ff7a90") {
  const fragment = doc.getXmlFragment("manuscript");
  const sync = Extension.create({ name: "testSync", addProseMirrorPlugins: () => [ySyncPlugin(fragment)] });
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ undoRedo: false }), sync, InkDrying.configure({ remoteColor: () => color, quietUntil: () => 0 })],
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

function wetText(editor: Editor) {
  return wetRanges(editor.state).map((w) => editor.state.doc.textBetween(w.from, w.to));
}

describe("ink drying", () => {
  it("marks exactly what a co-author typed, not the rest of the paragraph", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const me = editorOn(mine);
    const them = editorOn(theirs);
    connect(mine, theirs);
    them.commands.insertContent("Plastic is everywhere.");
    // Everything so far arrived as one change; start from a clean slate.
    me.view.dispatch(me.state.tr);

    const before = wetRanges(me.state).length;
    them.commands.setTextSelection(them.state.doc.content.size - 1);
    them.commands.insertContent(" Even in the deep sea.");
    const wet = wetRanges(me.state).slice(before);
    expect(wet).toHaveLength(1);
    expect(me.state.doc.textBetween(wet[0].from, wet[0].to)).toBe(" Even in the deep sea.");
    expect(wet[0].color).toBe("#ff7a90");
  });

  it("never marks this tab's own typing", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const me = editorOn(mine);
    editorOn(theirs);
    connect(mine, theirs);
    me.commands.insertContent("My own words.");
    expect(wetRanges(me.state)).toHaveLength(0);
  });

  it("keeps a wet word on the right letters when someone types earlier in the text", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const me = editorOn(mine);
    const them = editorOn(theirs);
    connect(mine, theirs);
    me.commands.insertContent("Start. End.");
    them.commands.setTextSelection(them.state.doc.content.size - 1);
    them.commands.insertContent(" Wet");
    expect(wetText(me)).toContain(" Wet");

    // This tab types at the very start; the wet word moves along with its letters.
    me.commands.setTextSelection(1);
    me.commands.insertContent("Hello. ");
    expect(wetText(me)).toContain(" Wet");
    // And a co-author typing at the start does too.
    them.commands.setTextSelection(1);
    them.commands.insertContent("A");
    expect(wetText(me)).toEqual(expect.arrayContaining([" Wet", "A"]));
  });

  it("lets a big arrival, such as a restored version, come in dry", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const me = editorOn(mine);
    const them = editorOn(theirs);
    connect(mine, theirs);
    them.commands.insertContent(`<p>${"A long restored paragraph. ".repeat(80)}</p>`);
    expect(wetRanges(me.state)).toHaveLength(0);
  });

  it("stays dry when it can't tell whose change it was", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const me = editorOn(mine, null);
    const them = editorOn(theirs);
    connect(mine, theirs);
    them.commands.insertContent("Someone typed this.");
    expect(wetRanges(me.state)).toHaveLength(0);
  });
});
