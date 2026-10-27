"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING } from "@/components/motion/tokens";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  onClose: () => void;
  /** Id of the element that names the dialog, or a label when there is no visible heading. */
  labelledBy?: string;
  label?: string;
  /** "center" is a modal card; "sheet" slides in from the right edge, "drawer" from the left. */
  variant?: "center" | "sheet" | "drawer" | "top";
  className?: string;
  /**
   * True while the dialog holds unsaved input. Escape and clicking outside then ask before
   * throwing it away, instead of closing at once.
   */
  dirty?: boolean;
  children: ReactNode;
};

let openDialogs = 0;

/** Stops the page behind from scrolling (iOS included) while any dialog is open. */
function lockScroll() {
  if (openDialogs++ === 0) {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  }
  return () => {
    if (--openDialogs === 0) {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
  };
}

/**
 * A modal dialog that behaves like one: focus moves in when it opens, Tab stays inside,
 * Escape closes it, and focus goes back to whatever opened it. Render it inside
 * <AnimatePresence> so it animates out as well as in.
 */
export function Dialog({ onClose, labelledBy, label, variant = "center", className = "", dirty = false, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const dismiss = () => (dirty ? setAsking(true) : onClose());
  const close = useRef(dismiss);
  useEffect(() => {
    close.current = dirty ? () => setAsking((a) => !a) : onClose;
  }, [onClose, dirty]);

  useEffect(lockScroll, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = panel.current;
    if (root && !root.contains(document.activeElement)) {
      const first = root.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Give focus back, unless the person has already moved it somewhere sensible.
      if (opener?.isConnected && (document.activeElement === document.body || root?.contains(document.activeElement))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  const motionProps =
    variant === "sheet"
      ? { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" }, transition: SPRING.smooth }
      : variant === "drawer"
        ? { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" }, transition: SPRING.smooth }
      : variant === "top"
        ? { initial: { opacity: 0, y: -16, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -10, scale: 0.98 }, transition: SPRING.snappy }
        : { initial: { opacity: 0, y: 24, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 16, scale: 0.97 }, transition: SPRING.smooth };

  const layout =
    variant === "sheet"
      ? "fixed inset-0 z-50 flex justify-end"
      : variant === "drawer"
        ? "fixed inset-0 z-50 flex justify-start"
      : variant === "top"
        ? "fixed inset-0 z-50 grid place-items-start justify-items-center overflow-y-auto p-4 pt-[12vh]"
        : "fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4";

  return (
    <div className={layout}>
      <motion.div
        aria-hidden
        className="fixed inset-0 bg-black/45 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={dismiss}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        {...motionProps}
        className={`relative outline-none ${className}`}
      >
        {children}
        <AnimatePresence>
          {asking && (
            <motion.div
              role="alertdialog"
              aria-label="Discard changes?"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={SPRING.snappy}
              className="absolute inset-x-4 bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-panel-solid p-3 shadow-2xl"
            >
              <p className="text-sm">Discard what you&apos;ve entered?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-autofocus
                  autoFocus
                  onClick={() => setAsking(false)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-line-strong"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-bg"
                >
                  Discard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
