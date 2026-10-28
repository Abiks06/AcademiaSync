"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Editor } from "@tiptap/react";
import { useHighlight } from "@/lib/editor/highlight";

type Thread = {
  key: string;
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * Fine lines from a citation to its card in the margin. Pointing at a citation draws its
 * thread; pointing at a card draws one to every place that source is cited. Each line
 * leaves from the page's right edge, level with the citation, so it never crosses the text.
 */
export function ProvenanceThreads({
  editor,
  root,
  sheet,
}: {
  editor: Editor;
  root: RefObject<HTMLElement | null>;
  sheet: RefObject<HTMLElement | null>;
}) {
  const highlight = useHighlight();
  const reduce = useReducedMotion();
  const [threads, setThreads] = useState<Thread[]>([]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setThreads(trace()));
    return () => cancelAnimationFrame(frame);

    function trace(): Thread[] {
      const box = root.current;
      const page = sheet.current;
      if (!highlight || !box || !page || editor.isDestroyed) return [];
      const card = box.querySelector<HTMLElement>(`[data-margin-source="${highlight.sourceId}"][data-margin-kind="full"]`);
      // No margin on this screen (or the source has no card): the text glows on its own.
      if (!card || card.offsetParent === null) return [];
      const b = box.getBoundingClientRect();
      const edge = page.getBoundingClientRect().right - b.left - 18;
      const c = card.getBoundingClientRect();
      const x2 = c.left - b.left - 10;
      const y2 = c.top - b.top + 20;
      const from =
        highlight.from === "text"
          ? [highlight.anchor]
          : [...editor.view.dom.querySelectorAll<HTMLElement>("[data-source-ids]")].filter((el) =>
              (el.dataset.sourceIds ?? "").split(" ").includes(highlight.sourceId),
            );
      // Only uses on or near the screen; a thread to somewhere far off is noise.
      const near = window.innerHeight * 1.2;
      return from.flatMap((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -near / 2 || r.top > near) return [];
        const x1 = edge;
        const y1 = r.top + r.height / 2 - b.top;
        const mid = x1 + (x2 - x1) * 0.55;
        return [
          {
            key: `${highlight.sourceId}:${i}`,
            d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
            x1,
            y1,
            x2,
            y2,
          },
        ];
      });
    }
  }, [highlight, editor, root, sheet]);

  if (threads.length === 0) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible text-iris">
      {threads.map((t, i) => (
        <g key={t.key}>
          <motion.path
            d={t.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 0.9 }}
            transition={{
              duration: reduce ? 0 : 0.36,
              delay: reduce ? 0 : i * 0.04,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
          <circle cx={t.x1} cy={t.y1} r={2.5} fill="currentColor" />
          <motion.circle
            cx={t.x2}
            cy={t.y2}
            r={2.5}
            fill="currentColor"
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.28 }}
          />
        </g>
      ))}
    </svg>
  );
}
