"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { citationItems, citationMode } from "@/lib/library/citations";
import { formatCitation } from "@/lib/library/styles";
import { CitationNode } from "@/lib/editor/citation-node";
import { useSources } from "./sources-context";
import { CitationCard } from "./citation-card";

export type { CitationAttrs } from "@/lib/editor/citation-node";

// Citations already in the text when the editor opens appear quietly; ones added after
// that (by you or a co-author) pop in.
let quietUntil = 0;
export function quietCitationsForAMoment() {
  quietUntil = performance.now() + 1500;
}

/** The citation node with its live label, which follows the library and the document's style. */
export const Citation = CitationNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CitationView, { as: "span" });
  },
});

const OPEN_DELAY = 280;
const CLOSE_DELAY = 160;

function CitationView({ node, selected, editor, getPos }: NodeViewProps) {
  const { byId, checking, cite, projectId, editCitation } = useSources();
  const [pop] = useState(() => performance.now() > quietUntil);
  const items = citationItems(node.attrs);
  const mode = citationMode(node.attrs);
  const sources = items.map((i) => byId.get(i.sourceId));
  // Only call a citation missing once the editor has checked the library for it.
  const missing = !checking && sources.some((s) => !s);
  const deleted = sources.some((s) => s?.deleted_at);
  const label = sources.some(Boolean) || !node.attrs.label ? formatCitation(items, mode, cite) : String(node.attrs.label);

  // The card opens on hover after a short pause, or when the citation is selected (a tap
  // on a phone, or arrowing onto it), and stays open while the pointer is over it.
  const anchor = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enter = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(true), hovered ? 0 : OPEN_DELAY);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(false), CLOSE_DELAY);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Selecting the citation again shows the card again after Escape hid it.
  const [wasSelected, setWasSelected] = useState(selected);
  if (selected !== wasSelected) {
    setWasSelected(selected);
    if (selected) setDismissed(false);
  }
  const open = (hovered || selected) && !dismissed && (sources.some(Boolean) || missing);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDismissed(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onEdit =
    editCitation && editor.isEditable
      ? () => {
          const pos = getPos();
          setHovered(false);
          if (typeof pos === "number") editCitation(pos);
        }
      : null;

  return (
    <NodeViewWrapper
      as="span"
      ref={anchor}
      className={`citation${selected ? " is-selected" : ""}${missing || deleted ? " is-missing" : ""}`}
      data-citation=""
      onPointerEnter={(e: React.PointerEvent) => e.pointerType === "mouse" && enter()}
      onPointerLeave={(e: React.PointerEvent) => e.pointerType === "mouse" && leave()}
    >
      <span className={pop ? "citation-pop" : undefined}>{label}</span>
      {(missing || deleted) && <span aria-label={missing ? "missing source" : "deleted source"}> ⚠</span>}
      <AnimatePresence>
        {open && (
          <CitationCard
            anchor={anchor}
            sources={sources}
            missing={missing}
            projectId={projectId}
            onEdit={onEdit}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={leave}
          />
        )}
      </AnimatePresence>
    </NodeViewWrapper>
  );
}
