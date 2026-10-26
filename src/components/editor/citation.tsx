"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { formatReference } from "@/lib/library/format";
import { citationItems, citationMode } from "@/lib/library/citations";
import { formatCitation } from "@/lib/library/styles";
import { CitationNode } from "@/lib/editor/citation-node";
import { useSources } from "./sources-context";

export type { CitationAttrs } from "@/lib/editor/citation-node";

/** The citation node with its live label, which follows the library and the document's style. */
export const Citation = CitationNode.extend({
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
