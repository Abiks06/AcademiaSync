"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { formatReference } from "@/lib/library/format";
import { CITATION_NODE, citationItems, citationMode, type CitationItem, type CitationMode } from "@/lib/library/citations";
import { formatCitation } from "@/lib/library/styles";
import { useSources } from "./sources-context";

export type CitationAttrs = { items: CitationItem[]; mode: CitationMode; label: string };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      /** Inserts a citation at the cursor, or replaces the selected citation. */
      insertCitation: (attrs: CitationAttrs) => ReturnType;
    };
  }
}

function parseItems(el: HTMLElement) {
  try {
    return JSON.parse(el.getAttribute("data-items") ?? "null");
  } catch {
    return null;
  }
}

/**
 * An in-text citation like (Lusher, 2017, p. 4) or [3]. The document stores which sources it
 * cites, with locators. The text shown is worked out from the library and the document's
 * style every time, so fixing a typo in a source or switching style updates every citation.
 * `label` is only a copy of the last shown text, for plain-text views of the document.
 */
export const Citation = Node.create({
  name: CITATION_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    // Written out by renderHTML below, not as raw attributes.
    return {
      items: { default: [], rendered: false },
      mode: { default: "parenthetical", rendered: false },
      label: { default: "", rendered: false },
      // Early citations held a single source.
      sourceId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-citation]",
        getAttrs: (el) => {
          const items = citationItems({ items: parseItems(el), sourceId: el.getAttribute("data-source-id") });
          return items.length ? { items, mode: el.getAttribute("data-mode") ?? "parenthetical", label: el.getAttribute("data-label") ?? "" } : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const items = citationItems(node.attrs);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "citation",
        "data-citation": "",
        "data-items": JSON.stringify(items),
        "data-mode": citationMode(node.attrs),
        "data-label": node.attrs.label,
      }),
      String(node.attrs.label || "(citation)"),
    ];
  },

  renderText({ node }) {
    return String(node.attrs.label || "(citation)");
  },

  addCommands() {
    return {
      insertCitation:
        (attrs) =>
        ({ state, commands }) => {
          const selected = (state.selection as { node?: { type: { name: string } } }).node;
          if (selected?.type.name === CITATION_NODE) return commands.updateAttributes(CITATION_NODE, { ...attrs, sourceId: null });
          return commands.insertContent([{ type: CITATION_NODE, attrs }, { type: "text", text: " " }]);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationView, { as: "span" });
  },
});

function CitationView({ node, selected }: NodeViewProps) {
  const { byId, checking, cite } = useSources();
  const items = citationItems(node.attrs);
  const mode = citationMode(node.attrs);
  const sources = items.map((i) => byId.get(i.sourceId));
  // Only call a citation missing once the editor has checked the library for it.
  const missing = !checking && sources.some((s) => !s);
  const deleted = sources.some((s) => s?.deleted_at);
  const label = sources.some(Boolean) || !node.attrs.label ? formatCitation(items, mode, cite) : String(node.attrs.label);

  const title = missing
    ? "A source cited here isn't in this project's library"
    : sources
        .map((s) => (s ? `${s.deleted_at ? "Deleted from the library: " : ""}${formatReference(s)}` : ""))
        .filter(Boolean)
        .join("\n\n");

  return (
    <NodeViewWrapper
      as="span"
      className={`citation${selected ? " is-selected" : ""}${missing || deleted ? " is-missing" : ""}`}
      title={title || undefined}
      data-citation=""
    >
      {label}
      {(missing || deleted) && <span aria-label={missing ? "missing source" : "deleted source"}> ⚠</span>}
    </NodeViewWrapper>
  );
}
