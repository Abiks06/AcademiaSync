"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Editor } from "@tiptap/react";
import { CITATION_NODE, citationItems } from "@/lib/library/citations";
import { KIND_LABEL, type Source } from "@/lib/library/types";
import { clearHighlight, setHighlight, useHighlight } from "@/lib/editor/highlight";
import { EXIT, SPRING } from "@/components/motion/tokens";
import { useSources } from "./sources-context";

/**
 * The living margin: each source sits beside the first sentence that cites it, like notes
 * in a scholar's copy. Later paragraphs that cite it again get a one-line reminder. Cards
 * keep clear of each other and of comment threads, and glide when the text moves.
 */

type Entry = {
  key: string;
  source: Source;
  full: boolean;
  /** Where the citation is, from the top of the margin. */
  want: number;
  uses: number;
};

const GAP = 10;
const GUESS = { full: 112, mini: 30 };

/** "Thompson", "Cole & Galloway", "Eriksen, Lebreton +6". */
function shortAuthors(source: Source) {
  const names = source.authors.map((a) => a.family || a.given).filter(Boolean);
  if (names.length === 0) return source.container ?? "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

function citationElements(editor: Editor, sourceId: string) {
  return [...editor.view.dom.querySelectorAll<HTMLElement>("[data-source-ids]")].filter((el) =>
    (el.dataset.sourceIds ?? "").split(" ").includes(sourceId),
  );
}

export function SourceMargin({ editor, column }: { editor: Editor; column: RefObject<HTMLElement | null> }) {
  const { byId } = useSources();
  const reduce = useReducedMotion();
  const highlight = useHighlight();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tops, setTops] = useState<Record<string, number>>({});
  const heights = useRef(new Map<string, number>());
  const [measured, setMeasured] = useState(0);

  // Where each source is cited, in reading order. Collected again when the text changes or
  // reflows, one frame at a time however fast people type.
  useEffect(() => {
    const collect = () => {
      const root = column.current;
      if (!root || editor.isDestroyed) return;
      const base = root.getBoundingClientRect().top;
      const seen = new Map<string, { entry: Entry; blocks: Set<number> }>();
      const list: Entry[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== CITATION_NODE) return;
        const el = editor.view.nodeDOM(pos);
        if (!(el instanceof HTMLElement)) return false;
        const want = el.getBoundingClientRect().top - base;
        const block = editor.state.doc.resolve(pos).index(0);
        for (const { sourceId } of citationItems(node.attrs)) {
          const source = byId.get(sourceId);
          if (!source) continue;
          const known = seen.get(sourceId);
          if (!known) {
            const entry = {
              key: `${sourceId}:full`,
              source,
              full: true,
              want,
              uses: 1,
            };
            seen.set(sourceId, { entry, blocks: new Set([block]) });
            list.push(entry);
          } else {
            known.entry.uses += 1;
            if (known.blocks.has(block)) continue;
            known.blocks.add(block);
            list.push({
              key: `${sourceId}:${block}`,
              source,
              full: false,
              want,
              uses: 0,
            });
          }
        }
        return false;
      });
      setEntries(list);
    };
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(collect);
    };
    soon();
    editor.on("update", soon);
    const resize = new ResizeObserver(soon);
    resize.observe(editor.view.dom);
    if (column.current) resize.observe(column.current);
    window.addEventListener("resize", soon);
    // Comment threads move around too; the cards step out of their way.
    const threads = column.current?.querySelector(".lb-tiptap-anchored-threads");
    const moved = new MutationObserver(soon);
    if (threads)
      moved.observe(threads, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["style"],
      });
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", soon);
      resize.disconnect();
      moved.disconnect();
      window.removeEventListener("resize", soon);
    };
  }, [editor, column, byId]);

  // Lay the cards out in reading order: each as close to its citation as it can get without
  // touching the card above it or a comment thread.
  useLayoutEffect(() => {
    const root = column.current;
    if (!root) return;
    const base = root.getBoundingClientRect().top;
    const obstacles = [...root.querySelectorAll<HTMLElement>(".lb-tiptap-anchored-threads-thread")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .map((r) => ({ top: r.top - base - GAP, bottom: r.bottom - base + GAP }))
      .sort((a, b) => a.top - b.top);
    const next: Record<string, number> = {};
    let floor = 0;
    for (const entry of [...entries].sort((a, b) => a.want - b.want)) {
      const height = heights.current.get(entry.key) ?? (entry.full ? GUESS.full : GUESS.mini);
      let top = Math.max(entry.want - 6, floor);
      for (const o of obstacles) if (top < o.bottom && top + height > o.top) top = o.bottom;
      next[entry.key] = Math.round(top);
      floor = top + height + GAP;
    }
    const frame = requestAnimationFrame(() =>
      setTops((prev) => {
        const same = Object.keys(next).length === Object.keys(prev).length && Object.entries(next).every(([k, v]) => prev[k] === v);
        return same ? prev : next;
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [entries, measured, column]);

  const measure = useCallback((key: string, el: HTMLElement | null) => {
    if (!el) return;
    const h = el.offsetHeight;
    if (heights.current.get(key) !== h) {
      heights.current.set(key, h);
      setMeasured((n) => n + 1);
    }
  }, []);

  // A click walks through the places the source is cited, one at a time.
  const nextUse = useRef(new Map<string, number>());
  const visit = (sourceId: string) => {
    const uses = citationElements(editor, sourceId);
    if (uses.length === 0) return;
    const i = (nextUse.current.get(sourceId) ?? 0) % uses.length;
    nextUse.current.set(sourceId, i + 1);
    const el = uses[i];
    el.scrollIntoView({
      block: "center",
      behavior: reduce ? "auto" : "smooth",
    });
    el.classList.remove("is-flash");
    void el.offsetWidth;
    el.classList.add("is-flash");
    setTimeout(() => el.classList.remove("is-flash"), 900);
  };

  return (
    <div aria-label="Sources in the margin" role="group" className="pointer-events-none absolute inset-x-0 top-0">
      <AnimatePresence initial={false}>
        {entries.map((entry) => {
          const top = tops[entry.key];
          if (top === undefined) return null;
          const { source } = entry;
          const lit = highlight?.sourceId === source.id;
          const point = (el: Element) => setHighlight({ sourceId: source.id, from: "margin", anchor: el });
          return (
            <motion.button
              key={entry.key}
              ref={(el) => measure(entry.key, el)}
              type="button"
              data-margin-source={source.id}
              data-margin-kind={entry.full ? "full" : "mini"}
              onPointerEnter={(e) => point(e.currentTarget)}
              onPointerLeave={(e) => clearHighlight(e.currentTarget)}
              onFocus={(e) => point(e.currentTarget)}
              onBlur={(e) => clearHighlight(e.currentTarget)}
              onClick={() => visit(source.id)}
              aria-label={`${source.title}. ${entry.full ? `Cited ${entry.uses} ${entry.uses === 1 ? "time" : "times"}.` : "Cited again here."} Go to ${entry.uses > 1 || !entry.full ? "the next place it is cited" : "the citation"}`}
              initial={{ opacity: 0, x: 12, y: top }}
              animate={{ opacity: 1, x: lit ? -6 : 0, y: top }}
              exit={{ opacity: 0, x: 8, transition: EXIT }}
              transition={reduce ? { duration: 0 } : SPRING.gentle}
              className={`pointer-events-auto absolute top-0 left-0 w-full rounded-xl border text-left text-sheet-ink transition-[border-color,box-shadow,background-color] duration-200 ${
                lit
                  ? "border-iris bg-sheet shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--iris)_55%,transparent)]"
                  : "border-sheet-line bg-sheet/70 hover:border-line-strong"
              } ${entry.full ? "px-3.5 py-3" : "px-3 py-1.5"} ${source.deleted_at ? "opacity-70" : ""}`}
            >
              {entry.full ? (
                <>
                  <span className="flex items-baseline justify-between gap-2 font-mono text-[10px] tracking-[0.12em] text-sheet-muted uppercase">
                    <span className="truncate">
                      {source.deleted_at ? "Deleted from library" : KIND_LABEL[source.kind]}
                      {source.year ? ` · ${source.year}` : ""}
                    </span>
                    <span className="shrink-0">
                      {entry.uses} {entry.uses === 1 ? "use" : "uses"}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block font-serif text-[0.95rem] leading-snug">{source.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-sheet-muted">{shortAuthors(source)}</span>
                  {source.notes && (
                    <span
                      className={`mt-2 border-l-2 border-amber/70 pl-2 font-serif text-[0.82rem] leading-snug text-sheet-muted italic ${lit ? "block" : "line-clamp-1"}`}
                    >
                      {source.notes}
                    </span>
                  )}
                  <span aria-hidden className="mt-2 flex gap-1">
                    {Array.from({ length: Math.min(entry.uses, 8) }, (_, i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-iris/60" />
                    ))}
                  </span>
                </>
              ) : (
                <span className="flex items-baseline gap-2 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-iris/70" aria-hidden />
                  <span className="truncate font-serif text-[0.85rem]">
                    {shortAuthors(source)}
                    {source.year ? `, ${source.year}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-sheet-muted">again</span>
                </span>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
