"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Code2, Heading1, Heading2, Heading3, List, ListOrdered, Minus, Pilcrow, Quote, TextQuote } from "lucide-react";
import type { SlashCommand, SlashState } from "@/lib/editor/slash-commands";
import { EXIT, SPRING } from "@/components/motion/tokens";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  text: Pilcrow,
  bullets: List,
  numbers: ListOrdered,
  quote: TextQuote,
  code: Code2,
  divider: Minus,
  cite: Quote,
};

/**
 * The "/" menu, drawn at the caret. Keys arrive from the editor (focus stays in the text),
 * through `bindKeys`, so typing keeps filtering while arrows move the highlight.
 */
export function SlashMenu({ state, bindKeys }: { state: SlashState; bindKeys: (handler: (e: KeyboardEvent) => boolean) => void }) {
  const [active, setActive] = useState(0);
  const items = useMemo(() => state?.items ?? [], [state]);
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setActive(0);
  }

  useEffect(() => {
    bindKeys((e) => {
      if (!state || items.length === 0) return false;
      if (e.key === "ArrowDown") return setActive((a) => (a + 1) % items.length), true;
      if (e.key === "ArrowUp") return setActive((a) => (a - 1 + items.length) % items.length), true;
      if (e.key === "Enter" || e.key === "Tab") {
        state.select(items[Math.min(active, items.length - 1)]);
        return true;
      }
      return false;
    });
  }, [bindKeys, state, items, active]);

  const rect = state?.rect;
  const below = rect ? window.innerHeight - rect.bottom > 320 : true;
  const top = rect ? (below ? rect.bottom + 8 : rect.top - 8) : 0;
  const left = rect ? Math.min(rect.left, window.innerWidth - 296) : 0;

  return (
    <AnimatePresence>
      {state && rect && (
        <motion.div
          key="slash"
          role="listbox"
          aria-label="Insert a block"
          initial={{ opacity: 0, scale: 0.96, y: below ? -4 : 4 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: SPRING.snappy }}
          exit={{ opacity: 0, scale: 0.98, transition: EXIT }}
          style={{
            position: "fixed",
            top,
            left: Math.max(8, left),
            transform: below ? undefined : "translateY(-100%)",
            transformOrigin: below ? "top left" : "bottom left",
          }}
          className="z-50 w-72 overflow-hidden rounded-2xl border border-line-strong bg-panel-solid p-1.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)]"
        >
          {items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-faint">No matching block</p>
          ) : (
            <>
              <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.16em] text-faint uppercase">Insert</p>
              <ul className="max-h-72 overflow-y-auto">
                {items.map((item: SlashCommand, i) => {
                  const Icon = ICONS[item.id] ?? Pilcrow;
                  const on = i === active;
                  return (
                    <li
                      key={item.id}
                      role="option"
                      aria-selected={on}
                      onPointerEnter={() => setActive(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        state.select(item);
                      }}
                      className="relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
                    >
                      {on && <motion.span layoutId="slash-active" className="absolute inset-0 rounded-xl bg-iris-soft" transition={SPRING.snappy} />}
                      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-bg-elev text-iris">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="relative min-w-0">
                        <span className="block text-sm text-ink">{item.title}</span>
                        <span className="block truncate text-xs text-faint">{item.hint}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
