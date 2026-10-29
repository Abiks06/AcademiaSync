"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shallow, useOthers, useSelf } from "@liveblocks/react/suspense";
import type { Editor } from "@tiptap/react";
import { useHighlight } from "@/lib/editor/highlight";
import { wetRanges } from "@/lib/editor/ink-drying";

/**
 * The manuscript's spine: a slim map of the whole text beside the page. One mark per
 * paragraph, longer marks for headings, a window for what's on screen. It shows where your
 * co-authors are and where they've just written, and lights up every paragraph that cites
 * the source you're pointing at. Click anywhere on it to go there.
 */

type Block = {
  /** Its index among the manuscript's top-level blocks, as collaborators' positions are counted. */
  index: number;
  top: number;
  height: number;
  heading: number;
  label: string;
  sources: string[];
  wet: string | null;
  /** A rough line length, so the marks look like text rather than a barcode. */
  fill: number;
};

/** Where the sticky editor bar ends, so "going to" something lands just below it. */
function readingLine() {
  return window.innerWidth >= 1024 ? 96 : 140;
}

export function Spine({ editor }: { editor: Editor }) {
  const highlight = useHighlight();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [total, setTotal] = useState(1);
  const [view, setView] = useState({ top: 0, height: 0 });
  const rail = useRef<HTMLDivElement>(null);
  const [railHeight, setRailHeight] = useState(0);

  const selfId = useSelf((me) => me.id);
  // Where everyone else's cursor is, by paragraph, in their colour.
  const here = useOthers(
    (others) => {
      const at: Record<number, string> = {};
      for (const o of others) {
        if (o.id === selfId || o.presence.block === undefined) continue;
        at[o.presence.block] ??= o.info?.color ?? "var(--iris)";
      }
      return at;
    },
    shallow,
  );

  const measure = useCallback(() => {
    if (editor.isDestroyed) return;
    const dom = editor.view.dom;
    const base = dom.getBoundingClientRect().top;
    const { doc } = editor.state;
    const wet = wetRanges(editor.state);
    const next: Block[] = [];
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      const el = editor.view.nodeDOM(pos);
      const start = pos;
      pos += node.nodeSize;
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      const ids = [...el.querySelectorAll<HTMLElement>("[data-source-ids]")].flatMap((c) => (c.dataset.sourceIds ?? "").split(" "));
      next.push({
        index: i,
        top: r.top - base,
        height: r.height,
        heading: node.type.name === "heading" ? Number(node.attrs.level) || 1 : 0,
        label: node.textContent.slice(0, 80),
        sources: ids,
        wet: wet.find((w) => w.from < pos && w.to > start)?.color ?? null,
        fill: 0.55 + ((node.textContent.length * 7) % 40) / 100,
      });
    }
    setBlocks(next);
    setTotal(Math.max(1, dom.getBoundingClientRect().height));
  }, [editor]);

  const measureView = useCallback(() => {
    if (editor.isDestroyed) return;
    const r = editor.view.dom.getBoundingClientRect();
    const top = Math.max(0, readingLine() - r.top);
    const bottom = Math.min(r.height, window.innerHeight - r.top);
    setView({ top, height: Math.max(0, bottom - top) });
  }, [editor]);

  useEffect(() => {
    let frame = 0;
    let viewFrame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        measureView();
      });
    };
    const scrolled = () => {
      cancelAnimationFrame(viewFrame);
      viewFrame = requestAnimationFrame(measureView);
    };
    soon();
    // `transaction` also catches ink drying out, which changes no text.
    editor.on("transaction", soon);
    const resize = new ResizeObserver(soon);
    resize.observe(editor.view.dom);
    if (rail.current) {
      const el = rail.current;
      const railResize = new ResizeObserver(() => setRailHeight(el.clientHeight));
      railResize.observe(el);
      resize.observe(el);
      setRailHeight(el.clientHeight);
      window.addEventListener("scroll", scrolled, { passive: true });
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(viewFrame);
        editor.off("transaction", soon);
        resize.disconnect();
        railResize.disconnect();
        window.removeEventListener("scroll", scrolled);
      };
    }
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", soon);
      resize.disconnect();
    };
  }, [editor, measure, measureView]);

  const scale = railHeight / total;
  const goTo = (docY: number) => {
    const top = editor.view.dom.getBoundingClientRect().top + window.scrollY + docY - readingLine();
    window.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <nav aria-label="Manuscript outline" className="sticky top-24 hidden lg:block">
      <div
        ref={rail}
        className="relative h-[min(62vh,34rem)] w-8 cursor-pointer"
        onClick={(e) => {
          // Clicks on the heading buttons handle themselves.
          if ((e.target as HTMLElement).closest("button")) return;
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
          goTo(scale > 0 ? y / scale : 0);
        }}
      >
        {/* What's on screen now. */}
        <div
          aria-hidden
          className="absolute -left-1.5 w-11 rounded-[5px] border border-line bg-iris-soft/30 transition-[transform,height] duration-150 ease-out"
          style={{ height: Math.max(8, view.height * scale), transform: `translateY(${view.top * scale}px)` }}
        />
        {blocks.map((b, i) => {
          const lit = !!highlight && b.sources.includes(highlight.sourceId);
          const person = here[b.index];
          const color = lit ? "var(--iris)" : (b.wet ?? person ?? (b.heading ? "var(--faint)" : "var(--line-strong)"));
          const y = b.top * scale;
          // A paragraph draws as lines of text, about one per four pixels; a heading as one bold rule.
          const h = b.heading ? 3 : Math.max(2, Math.min(b.height * scale - 3, 72));
          const width = b.heading ? (b.heading === 1 ? 32 : 26) : Math.round(24 * b.fill);
          const mark = (
            <span
              aria-hidden
              className="absolute left-0 block rounded-[1px] transition-[width,filter] duration-300"
              style={{
                top: y,
                height: h,
                width: lit ? width + 6 : width,
                background: b.heading || h < 5 ? color : `repeating-linear-gradient(to bottom, ${color} 0 2px, transparent 2px 4px)`,
                filter: lit ? "drop-shadow(0 0 4px var(--iris))" : b.wet ? `drop-shadow(0 0 4px ${b.wet})` : undefined,
              }}
            />
          );
          return (
            <span key={i}>
              {mark}
              {b.heading > 0 && (
                <button
                  type="button"
                  onClick={() => goTo(b.top)}
                  title={b.label}
                  aria-label={`Go to ${b.label || "heading"}`}
                  className="absolute -left-1 h-3.5 w-10 rounded"
                  style={{ top: y - 5 }}
                />
              )}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
