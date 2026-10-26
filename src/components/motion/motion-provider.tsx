"use client";

import { MotionConfig } from "motion/react";

/**
 * Respects the user's reduced-motion setting across every animation in the app. The default
 * is a tween because a spring can't animate keyframe lists; springs are set where they're used.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "tween", duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </MotionConfig>
  );
}
