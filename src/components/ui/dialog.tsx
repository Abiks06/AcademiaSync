"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  onClose: () => void;
  /** Id of the element that names the dialog, or a label when there is no visible heading. */
  labelledBy?: string;
  label?: string;
  /** "center" is a modal card; "sheet" slides in from the right edge. */
  variant?: "center" | "sheet" | "top";
  className?: string;
  children: ReactNode;
};

/**
 * A modal dialog that behaves like one: focus moves in when it opens, Tab stays inside,
 * Escape closes it, and focus goes back to whatever opened it. Render it inside
 * <AnimatePresence> so it animates out as well as in.
 */
export function Dialog({ onClose, labelledBy, label, variant = "center", className = "", children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

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
      ? { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" }, transition: { type: "spring" as const, stiffness: 320, damping: 34 } }
      : variant === "top"
        ? { initial: { opacity: 0, y: -16, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -10, scale: 0.98 }, transition: { type: "spring" as const, stiffness: 380, damping: 30 } }
        : { initial: { opacity: 0, y: 30, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 20, scale: 0.97 }, transition: { type: "spring" as const, stiffness: 340, damping: 30 } };

  const layout =
    variant === "sheet"
      ? "fixed inset-0 z-50 flex justify-end"
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
        onClick={onClose}
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
      </motion.div>
    </div>
  );
}
