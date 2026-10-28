/**
 * The app's motion vocabulary. Every animation picks from these, so the whole product
 * moves with one rhythm.
 *
 * The rule that keeps it premium rather than noisy is frequency: the more often something
 * happens, the less it moves. Keyboard actions and the command palette, used hundreds of
 * times a day, don't animate at all. Hovers and presses are quick. Panels and cards glide on
 * springs, which keep their velocity when interrupted. Only rare, earned moments (marking a
 * manuscript final, the first citation) get a ceremony.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** Seconds, from most to least frequent. */
export const MOTION = {
  /** Command palette, slash menu, keyboard actions. */
  instant: 0,
  /** Hover, focus, press (scale 0.97). */
  quick: 0.14,
  /** Threads, underlines, progress: things that draw themselves. */
  draw: 0.35,
  /** Page entrances, the theme lamp, morphs between pages. */
  scene: 0.56,
  /** The seal, the first citation. Rare by design. */
  ceremony: 0.8,
} as const;

/** Seconds. In-app entrances stay at or under `slow`. */
export const DURATION = { fast: MOTION.quick, base: 0.22, slow: 0.38, hero: 0.6 } as const;

export const SPRING = {
  /** Menus, popovers, chips: arrives fast, settles without wobble. */
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.8 },
  /** Margin cards, panels and layout changes. */
  glide: { type: "spring", stiffness: 380, damping: 34 },
  /** Sheets, dialogs, toasts. */
  smooth: { type: "spring", stiffness: 320, damping: 34 },
  /** Lists reordering, things that should feel unhurried. */
  gentle: { type: "spring", stiffness: 170, damping: 26 },
  /** A small celebratory pop, e.g. a citation landing in the text. */
  pop: { type: "spring", stiffness: 600, damping: 30 },
} as const;

/** Leaving is always quicker than arriving. */
export const EXIT = { duration: DURATION.fast, ease: EASE_IN } as const;
