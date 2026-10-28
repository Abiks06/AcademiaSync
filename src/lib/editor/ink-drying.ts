import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "y-prosemirror";

/**
 * Ink drying: text a co-author has just typed shows in their colour for a moment, then
 * settles into ink. It is only a decoration in this tab; nothing is written to the document.
 */

/** How long new words stay wet. Matches the `ink-dry` animation in globals.css. */
export const DRY_MS = 3200;
/** A bigger arrival (a restored version, a long paste, catching up after being offline) comes in dry. */
const MAX_WET = 1200;

/** Holds the colour of whoever made the latest remote change; the editor reads it through `color`. */
export class RemoteAuthor {
  private current: string | null = null;
  set(color: string | null) {
    this.current = color;
  }
  color = () => this.current;
}

export type Wet = { from: number; to: number; color: string; at: number };

export const inkDryingKey = new PluginKey<Wet[]>("inkDrying");

export type InkDryingOptions = {
  /** The colour of whoever made the latest change from elsewhere, or null if it isn't known. */
  remoteColor: () => string | null;
  /** Changes before this time (ms since epoch) are the document loading, not someone typing. */
  quietUntil: () => number;
};

type Change = { start: number; endA: number; endB: number };

/**
 * What a remote change did. The sync layer swaps in the whole document for every remote
 * change, so its own step map says "everything changed"; comparing the two documents finds
 * the part that really did.
 */
export function remoteChange(tr: Transaction): Change | null {
  const a = tr.before.content;
  const b = tr.doc.content;
  const start = a.findDiffStart(b);
  if (start === null) return null;
  const end = a.findDiffEnd(b);
  if (!end) return null;
  let { a: endA, b: endB } = end;
  // Repeated characters make the two ends overlap; push them apart, as ProseMirror itself does.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  return { start, endA, endB };
}

export function mapAcross(pos: number, change: Change, assoc: 1 | -1) {
  if (pos <= change.start) return pos;
  if (pos >= change.endA) return pos + change.endB - change.endA;
  return assoc < 0 ? change.start : change.endB;
}

export function wetRanges(state: EditorState): Wet[] {
  return inkDryingKey.getState(state) ?? [];
}

// Decorations are rebuilt from the ranges whenever the editor asks, so each word's animation
// delay is current and a redrawn word carries on drying instead of starting again.
const built = new WeakMap<EditorState, DecorationSet>();

export const InkDrying = Extension.create<InkDryingOptions>({
  name: "inkDrying",

  addOptions() {
    return { remoteColor: () => null, quietUntil: () => 0 };
  },

  addProseMirrorPlugins() {
    return [inkDryingPlugin(this.options)];
  },
});

export function inkDryingPlugin({ remoteColor, quietUntil }: InkDryingOptions) {
  return new Plugin<Wet[]>({
    key: inkDryingKey,
    state: {
      init: () => [],
      apply(tr, wet) {
        const now = Date.now();
        let next = wet.filter((w) => now - w.at < DRY_MS);
        if (!tr.docChanged) return next.length === wet.length ? wet : next;

        const sync = tr.getMeta(ySyncPluginKey) as { isUndoRedoOperation?: boolean } | undefined;
        const change = sync ? remoteChange(tr) : null;
        next = next
          .map((w) =>
            change
              ? { ...w, from: mapAcross(w.from, change, 1), to: mapAcross(w.to, change, -1) }
              : { ...w, from: tr.mapping.map(w.from, 1), to: tr.mapping.map(w.to, -1) },
          )
          .filter((w) => w.to > w.from);

        // Only someone else's typing gets wet: not this tab's own edits, nor its undo.
        if (!change || sync?.isUndoRedoOperation || now < quietUntil()) return next;
        const inserted = change.endB - change.start;
        if (inserted <= 0 || inserted > MAX_WET) return next;
        const color = remoteColor();
        if (!color) return next;
        return [...next, { from: change.start, to: change.endB, color, at: now }];
      },
    },
    props: {
      decorations(state) {
        const wet = inkDryingKey.getState(state);
        if (!wet?.length) return DecorationSet.empty;
        const cached = built.get(state);
        if (cached) return cached;
        const now = Date.now();
        const set = DecorationSet.create(
          state.doc,
          wet.map((w) =>
            Decoration.inline(w.from, w.to, {
              class: "ink-wet",
              style: `--wet: ${w.color}; animation-delay: -${Math.min(DRY_MS, now - w.at)}ms`,
            }),
          ),
        );
        built.set(state, set);
        return set;
      },
    },
    view() {
      // Clears dry ranges once they have finished, so their spans go back to plain text.
      let timer: ReturnType<typeof setTimeout> | undefined;
      return {
        update(view) {
          const wet = inkDryingKey.getState(view.state);
          if (!wet?.length || timer) return;
          const due = Math.max(50, Math.min(...wet.map((w) => w.at + DRY_MS)) - Date.now() + 30);
          const prune = () => {
            timer = undefined;
            if (view.isDestroyed) return;
            // Never interrupt someone mid-way through composing a character (an IME, dead keys).
            if (view.composing) timer = setTimeout(prune, 400);
            else view.dispatch(view.state.tr.setMeta("addToHistory", false));
          };
          timer = setTimeout(prune, due);
        },
        destroy() {
          clearTimeout(timer);
        },
      };
    },
  });
}
