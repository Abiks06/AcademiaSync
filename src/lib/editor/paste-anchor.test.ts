import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { initProseMirrorDoc, prosemirrorJSONToYDoc, relativePositionToAbsolutePosition } from "y-prosemirror";
import * as Y from "yjs";
import { anchorBefore } from "./paste-anchor";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
    text: {},
  },
});

function setup(text: string) {
  const doc = prosemirrorJSONToYDoc(schema, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const type = doc.getXmlFragment("prosemirror");
  const paragraph = type.get(0) as Y.XmlElement;
  return { doc, type, text: paragraph.get(0) as Y.XmlText };
}

function resolve(doc: Y.Doc, type: Y.XmlFragment, rel: Y.RelativePosition) {
  const { mapping } = initProseMirrorDoc(type, schema);
  return relativePositionToAbsolutePosition(doc, type, rel, mapping as never);
}

describe("anchorBefore", () => {
  it("stays where the link was pasted when someone types right there", () => {
    const { doc, type, text } = setup("hello world");
    const { mapping } = initProseMirrorDoc(type, schema);
    // After "hello": 1 for the paragraph's opening, 5 for the letters.
    const rel = anchorBefore(6, type, doc, mapping);
    text.insert(5, " there");
    expect(resolve(doc, type, rel)).toBe(6);
  });

  it("moves along when text goes in earlier in the paragraph", () => {
    const { doc, type, text } = setup("hello world");
    const { mapping } = initProseMirrorDoc(type, schema);
    const rel = anchorBefore(6, type, doc, mapping);
    text.insert(0, "Oh, ");
    expect(resolve(doc, type, rel)).toBe(10);
  });

  it("holds at the start of a paragraph", () => {
    const { doc, type, text } = setup("hello");
    const { mapping } = initProseMirrorDoc(type, schema);
    const rel = anchorBefore(1, type, doc, mapping);
    text.insert(5, "!");
    expect(resolve(doc, type, rel)).toBe(1);
  });
});
