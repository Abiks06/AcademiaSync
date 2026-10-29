"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Text written in wet ink: each new letter lands in the accent colour and dries to the
 * page's ink, the way a collaborator's new words do in the editor. Letters already there
 * stay dry, so only what changed draws the eye.
 */
export function InkText({ text, placeholder, className = "" }: { text: string; placeholder?: string; className?: string }) {
  const reduce = useReducedMotion();
  if (!text) return <span className={`text-sheet-muted/70 ${className}`}>{placeholder}</span>;
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          // Keyed by position and letter: retyping a letter wets it again.
          key={`${i}-${ch}`}
          aria-hidden
          initial={{ color: "var(--iris)", opacity: 0.4, y: 2 }}
          animate={{ color: "var(--sheet-ink)", opacity: 1, y: 0 }}
          transition={{ color: { duration: 1.6, ease: "easeOut" }, opacity: { duration: 0.18 }, y: { duration: 0.18 } }}
          className="inline-block whitespace-pre"
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}
