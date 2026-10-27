"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { EXIT, SPRING } from "@/components/motion/tokens";

export type MenuItem = {
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** May return a promise; the item shows a spinner and the menu stays open until it settles. */
  onSelect: () => void | Promise<unknown>;
};

/**
 * A button that opens a list of actions. Arrow keys move, Enter picks, Escape or a click
 * outside closes, and focus returns to the button.
 */
export function Menu({ label, trigger, items, align = "right", className = "" }: {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const focusItem = (index: number) => {
    const all = root.current?.querySelectorAll<HTMLElement>("[role=menuitem]");
    if (!all?.length) return;
    all[(index + all.length) % all.length].focus();
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const pick = async (index: number) => {
    const result = items[index].onSelect();
    if (result instanceof Promise) {
      setBusy(index);
      try {
        await result;
      } finally {
        setBusy(null);
      }
    }
    close();
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(e.key === "ArrowDown" ? 0 : -1));
          }
        }}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong aria-expanded:border-line-strong"
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING.snappy }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: EXIT }}
            onAnimationComplete={() => {
              if (!root.current?.contains(document.activeElement) || document.activeElement === button.current) focusItem(0);
            }}
            onKeyDown={(e) => {
              const all = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
              const at = all.indexOf(document.activeElement as HTMLElement);
              const moves: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: -1 };
              if (e.key in moves) {
                e.preventDefault();
                focusItem(moves[e.key]);
              }
              if (e.key === "Escape" || e.key === "Tab") {
                if (e.key === "Escape") e.preventDefault();
                close();
              }
            }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            className={`absolute z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line-strong bg-panel-solid p-1.5 text-sm shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)] ${align === "right" ? "right-0" : "left-0"}`}
          >
            {items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={busy !== null}
                onClick={() => void pick(i)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors hover:bg-iris-soft focus-visible:bg-iris-soft disabled:opacity-60"
              >
                <span className="mt-0.5 text-iris">{busy === i ? <Loader2 className="h-4 w-4 animate-spin" /> : item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-ink">{item.label}</span>
                  {item.hint && <span className="block text-xs text-faint">{item.hint}</span>}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
