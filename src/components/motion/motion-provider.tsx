"use client";

import { MotionConfig } from "motion/react";

/** Respects the user's reduced-motion setting across every animation in the app. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 260, damping: 30 }}>
      {children}
    </MotionConfig>
  );
}
