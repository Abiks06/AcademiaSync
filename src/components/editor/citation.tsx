"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { formatReference, inTextLabel } from "@/lib/library/format";
import { CITATION_NODE } from "@/lib/library/citations";
import { useSources } from "./sources-context";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      /** Inserts a citation of a library source at the cursor. */
      insertCitation: (attrs: { sourceId: string; label: string }) => ReturnType;
    };
  }
}

/**
 * An in-text citation like (Lusher, 2017). The document stores only the source's id and the
 * label it had when cited. The label shown comes from the library, so fixing a typo in a
 * source fixes every citation of it.
 */
export const Citation = Node.create({
  name: CITATION_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { sourceId: { default: null }, label: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-citation]",
        getAttrs: (el) => ({ sourceId: el.getAttribute("data-source-id"), label: el.getAttribute("data-label") ?? "" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-citation": "", "data-source-id": node.attrs.sourceId, "data-label": node.attrs.label, class: "citation" }),
      `(${node.attrs.label})`,
    ];
  },

  renderText({ node }) {
    return `(${node.attrs.label})`;
  },

  addCommands() {
    return {
      insertCitation:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([{ type: CITATION_NODE, attrs }, { type: "text", text: " " }]),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationView, { as: "span" });
  },
});

function CitationView({ node, selected }: NodeViewProps) {
  const { byId } = useSources();
  const source = byId.get(String(node.attrs.sourceId));
  // An empty library map means the library hasn't loaded; only call a citation missing once it has.
  const missing = !source && byId.size > 0;
  const label = source ? inTextLabel(source) : String(node.attrs.label || "source");

  return (
    <NodeViewWrapper
      as="span"
      className={`citation${selected ? " is-selected" : ""}${missing ? " is-missing" : ""}`}
      title={source ? formatReference(source) : missing ? "This source was deleted from the library" : undefined}
      data-citation=""
    >
      ({label}
      {missing && " ⚠"})
    </NodeViewWrapper>
  );
}
