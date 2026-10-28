"use client";

import { useId } from "react";

/**
 * A wax seal with the AcademiaSync brackets pressed into it. The edge is irregular, as
 * real wax is, and the ink filter roughens it just enough to stop it looking like a sticker.
 */
export function WaxSeal({ className = "", tone = "iris" }: { className?: string; tone?: "iris" | "teal" }) {
  const id = useId().replace(/:/g, "");
  const [light, dark] = tone === "teal" ? ["#6fe6d4", "#0b7a6b"] : ["#a3abff", "#3a44d1"];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-wax`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={dark} />
          <stop offset="1" stopColor={dark} stopOpacity="0.92" />
        </radialGradient>
        <filter id={`${id}-rough`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
      </defs>
      <g filter={`url(#${id}-rough)`}>
        {/* The wax pooled past the stamp. */}
        <path
          fill={`url(#${id}-wax)`}
          d="M50 3c7 0 10 4 16 5s11 0 15 5 2 10 5 15 8 8 8 15-5 9-5 15 3 11-1 16-10 3-15 7-6 10-13 11-11-3-17-3-11 5-17 2-5-9-10-13-12-5-13-11 3-11 2-17-6-10-3-16 9-6 12-11 2-11 7-14 11 1 16-2 6-5 12-5Z"
        />
        <circle cx="50" cy="50" r="31" fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="27" fill="rgb(0 0 0 / 0.12)" />
        <path d="M44 37h-7v26h7" fill="none" stroke="rgb(255 255 255 / 0.82)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M56 37h7v26h-7" fill="none" stroke="rgb(255 255 255 / 0.82)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="50" cy="50" r="3.6" fill="rgb(255 255 255 / 0.82)" />
      </g>
      {/* A highlight where the lamp catches the wax. */}
      <ellipse cx="36" cy="27" rx="12" ry="5" fill="rgb(255 255 255 / 0.22)" transform="rotate(-28 36 27)" />
    </svg>
  );
}
