"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const ORBIT = [
  { label: "[12] Lusher 2017", color: "var(--iris)", r: 210, start: 0 },
  { label: "Figure 3 · FTIR", color: "var(--teal)", r: 210, start: 120 },
  { label: "dataset.csv", color: "var(--amber)", r: 210, start: 240 },
  { label: "Mira is editing 2.2", color: "var(--teal)", r: 130, start: 60 },
  { label: "Review round 2", color: "var(--rose)", r: 130, start: 240 },
];

const QUOTES = [
  { text: "Three time zones, one manuscript, and nobody ever asks which file is the latest.", who: "How live co-writing works here" },
  { text: "Every comment points at the exact sentence it is about, even after the paragraph moves.", who: "How review works here" },
  { text: "Paste a DOI, keep writing. The bibliography takes care of itself.", who: "How citations work here" },
];

/** Decorative panel: the project's pieces orbiting the manuscript at its centre. */
export function OrbitPanel() {
  const reduce = useReducedMotion();
  const [q, setQ] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setQ((n) => (n + 1) % QUOTES.length), 5200);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <aside className="grain relative hidden overflow-hidden border-l border-line bg-bg-elev lg:flex lg:flex-col">
      <div className="hairline-grid pointer-events-none absolute inset-0" aria-hidden />
      <motion.div
        aria-hidden
        className="absolute top-1/3 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-iris/20 blur-[110px]"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity }}
      />

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative h-[480px] w-[480px]" aria-hidden>
          {[210, 130].map((r) => (
            <div
              key={r}
              className="absolute top-1/2 left-1/2 rounded-full border border-dashed border-line-strong"
              style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r }}
            />
          ))}

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="glass absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4"
          >
            <p className="font-serif text-sm font-semibold">Manuscript</p>
            {[100, 86, 92, 60].map((w, i) => (
              <motion.div
                key={i}
                className="mt-2 h-1.5 rounded-full bg-line-strong"
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ delay: 0.5 + i * 0.15, duration: 0.8 }}
              />
            ))}
          </motion.div>

          {ORBIT.map((o, i) => (
            <motion.div
              key={o.label}
              className="absolute top-1/2 left-1/2 h-0 w-0"
              initial={{ rotate: o.start }}
              animate={reduce ? undefined : { rotate: o.start + (o.r > 150 ? 360 : -360) }}
              transition={{ duration: o.r > 150 ? 60 : 44, repeat: Infinity, ease: "linear" }}
            >
              <motion.div
                style={{ x: o.r }}
                initial={{ rotate: -o.start, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { rotate: -o.start - (o.r > 150 ? 360 : -360), opacity: 1 }}
                transition={{
                  rotate: { duration: o.r > 150 ? 60 : 44, repeat: Infinity, ease: "linear" },
                  opacity: { delay: 0.6 + i * 0.15 },
                }}
                className="absolute"
              >
                <span
                  className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap"
                  style={{ transform: "translate(-50%, -50%)" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
                  {o.label}
                </span>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="relative px-12 pb-14">
        <AnimatePresence mode="wait">
          <motion.figure
            key={q}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
            transition={{ duration: 0.6 }}
            className="max-w-lg"
          >
            <blockquote className="font-serif text-2xl leading-snug">“{QUOTES[q].text}”</blockquote>
            <figcaption className="mt-3 text-sm text-muted">{QUOTES[q].who}</figcaption>
          </motion.figure>
        </AnimatePresence>
      </div>
    </aside>
  );
}
