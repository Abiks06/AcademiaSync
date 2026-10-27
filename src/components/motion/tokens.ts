/**
 * The app's motion vocabulary. Every animation picks from these, so the whole product
 * moves with one rhythm: quick and crisp inside the app, slower and grander only on the
 * landing page, which people see once.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** Seconds. In-app entrances stay at or under `slow`. */
export const DURATION = { fast: 0.14, base: 0.22, slow: 0.38, hero: 0.6 } as const;

export const SPRING = {
  /** Menus, popovers, chips: arrives fast, settles without wobble. */
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.8 },
  /** Sheets, dialogs, toasts. */
  smooth: { type: "spring", stiffness: 320, damping: 34 },
  /** Layout changes and lists reordering. */
  gentle: { type: "spring", stiffness: 170, damping: 26 },
  /** A small celebratory pop, e.g. a citation landing in the text. */
  pop: { type: "spring", stiffness: 600, damping: 30 },
} as const;

/** Leaving is always quicker than arriving. */
export const EXIT = { duration: DURATION.fast, ease: EASE_IN } as const;
