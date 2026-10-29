import { useSyncExternalStore } from "react";

/**
 * The source someone is pointing at in the editor, by hovering a citation in the text or a
 * card in the margin. Citations, margin cards, the spine and the threads between them all
 * light up from this one value, so they always agree.
 */
export type Highlight = {
  sourceId: string;
  /** Where the pointer is: a citation in the text, or a card in the margin. */
  from: "text" | "margin";
  /** The element being pointed at. */
  anchor: Element;
} | null;

let current: Highlight = null;
const listeners = new Set<() => void>();

export function setHighlight(next: Highlight) {
  if (next?.sourceId === current?.sourceId && next?.anchor === current?.anchor) return;
  current = next;
  for (const listener of listeners) listener();
}

/** Clears the highlight, but only if it is still the one this element set. */
export function clearHighlight(anchor: Element) {
  if (current?.anchor === anchor) setHighlight(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHighlight(): Highlight {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
