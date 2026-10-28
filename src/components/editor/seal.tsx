"use client";

import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT, MOTION } from "@/components/motion/tokens";

/**
 * The ink seal pressed onto the page when a manuscript is marked final. It lands with a
 * little weight the moment it happens, and simply sits there when the page is opened later.
 */
export function Seal({ shown }: { shown: boolean }) {
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, "");
  return (
    // Only a seal that arrives while the page is open is pressed; one already there just is.
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="seal"
          aria-hidden
          className="pointer-events-none absolute top-16 right-4 z-10 h-24 w-24 text-rose mix-blend-multiply sm:top-[5.5rem] sm:right-8 sm:h-28 sm:w-28 dark:mix-blend-screen print:hidden"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.7, rotate: -26 }}
          animate={{ opacity: 0.82, scale: 1, rotate: -12 }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: MOTION.quick } }}
          transition={reduce ? { duration: MOTION.quick } : { duration: MOTION.ceremony * 0.55, ease: [0.5, 0, 0.75, 0] }}
        >
          {/* The ink spreading as the seal meets the paper. */}
          {!reduce && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-current"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0, 0.5, 0], scale: [1, 1, 1.45] }}
              transition={{ duration: MOTION.ceremony, times: [0, 0.55, 1], ease: EASE_OUT }}
            />
          )}
          <svg viewBox="0 0 120 120" className="h-full w-full">
            <defs>
              <filter id={`${id}-ink`}>
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
                <feDisplacementMap in="SourceGraphic" scale="2.4" />
              </filter>
              <path id={`${id}-ring`} d="M 60 60 m -46 0 a 46 46 0 1 1 92 0 a 46 46 0 1 1 -92 0" />
            </defs>
            <g filter={`url(#${id}-ink)`} fill="currentColor" stroke="currentColor">
              <circle cx="60" cy="60" r="57" fill="none" strokeWidth="2.6" />
              <circle cx="60" cy="60" r="38" fill="none" strokeWidth="1.2" />
              <text fontSize="9.5" letterSpacing="2.6" stroke="none" style={{ fontFamily: "var(--font-mono)" }}>
                <textPath href={`#${id}-ring`}>FINAL MANUSCRIPT · ACADEMIASYNC ·</textPath>
              </text>
              <text x="60" y="58" textAnchor="middle" fontStyle="italic" fontSize="21" stroke="none" style={{ fontFamily: "var(--font-serif)" }}>
                Final
              </text>
              <text x="60" y="74" textAnchor="middle" fontSize="10" stroke="none">
                ✦
              </text>
            </g>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
