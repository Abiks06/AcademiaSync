import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { relativePositionToAbsolutePosition, ySyncPluginKey } from "y-prosemirror";
import type * as Y from "yjs";
import { pastedIdentifier } from "@/lib/library/paste-identifier";
import type { Identifier } from "@/lib/library/lookup";
import { anchorBefore } from "./paste-anchor";

type Pending = { id: string; text: string };
/** `pos` follows this tab's own edits; `rel` is anchored in the shared document, so it survives co-authors' edits too. */
type Item = Pending & { pos: number; rel: Y.RelativePosition | null };
type Meta = { add: Item } | { remove: string };

type SyncState = { type: Y.XmlFragment; doc: Y.Doc; binding: { mapping: Map<unknown, unknown> } } | undefined;

export const smartPasteKey = new PluginKey<Item[]>("smartPaste");

export type SmartPasteOptions = {
  /** Whether pasting may turn into a citation right now (the person can cite, no old tab is open). */
  enabled: () => boolean;
  /** Called with a placeholder; look the paper up, then call `finishSmartPaste` with its id. */
  onIdentifier: (ident: Identifier, pending: Pending) => void;
};

function placeholder(text: string) {
  const el = document.createElement("span");
  el.className = "citation citation-pending";
  // The editor announces progress in its own status line, so screen readers skip this.
  el.setAttribute("aria-hidden", "true");
  el.textContent = text.length > 28 ? `${text.slice(0, 26)}…` : text;
  return el;
}

function sync(state: EditorState) {
  return ySyncPluginKey.getState(state) as SyncState;
}

function where(state: EditorState, item: Item) {
  const y = sync(state);
  let pos = item.pos;
  if (item.rel && y?.binding) {
    // A co-author's change replaces the whole editor document, which a plain mapped
    // position doesn't survive. The Yjs position does.
    const resolved = relativePositionToAbsolutePosition(y.doc, y.type, item.rel, y.binding.mapping as never);
    if (resolved !== null) pos = resolved;
  }
  return Math.max(0, Math.min(pos, state.doc.content.size));
}

/**
 * Pasting a DOI, arXiv or PubMed link turns it into a citation. While the paper is looked
 * up, a shimmering placeholder sits where it was pasted. The placeholder is only a
 * decoration in this tab, never part of the shared text, and it moves with edits (yours
 * and co-authors') so the citation lands in the right place.
 */
export const SmartPaste = Extension.create<SmartPasteOptions>({
  name: "smartPaste",

  addOptions() {
    return { enabled: () => false, onIdentifier: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<Item[]>({
        key: smartPasteKey,
        state: {
          init: () => [],
          apply(tr, items) {
            const meta = tr.getMeta(smartPasteKey) as Meta | undefined;
            let next = tr.docChanged ? items.map((i) => ({ ...i, pos: tr.mapping.map(i.pos, -1) })) : items;
            if (meta && "add" in meta) next = [...next, meta.add];
            if (meta && "remove" in meta) next = next.filter((i) => i.id !== meta.remove);
            return next;
          },
        },
        props: {
          decorations(state) {
            const items = smartPasteKey.getState(state) ?? [];
            if (items.length === 0) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              items.map((item) => Decoration.widget(where(state, item), () => placeholder(item.text), { key: item.id, side: -1 })),
            );
          },
          handlePaste(view, event) {
            if (!options.enabled()) return false;
            const text = event.clipboardData?.getData("text/plain") ?? "";
            const ident = pastedIdentifier(text);
            if (!ident) return false;
            const { $from } = view.state.selection;
            // Code stays code.
            if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return false;

            const pending = { id: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: text.trim() };
            if (!view.state.selection.empty) view.dispatch(view.state.tr.deleteSelection());
            const pos = view.state.selection.from;
            const y = sync(view.state);
            let rel: Y.RelativePosition | null = null;
            try {
              rel = y?.binding ? anchorBefore(pos, y.type, y.doc, y.binding.mapping) : null;
            } catch {
              // Falls back to following this tab's edits only.
            }
            view.dispatch(view.state.tr.setMeta(smartPasteKey, { add: { ...pending, pos, rel } } satisfies Meta));
            options.onIdentifier(ident, pending);
            return true;
          },
        },
      }),
    ];
  },
});

type Handler = SmartPasteOptions["onIdentifier"];

/** How the editor's React code and the paste plugin, which lives outside React, talk. */
export class PasteBridge {
  private allowed = false;
  private handler: Handler = () => {};
  setEnabled(enabled: boolean) {
    this.allowed = enabled;
  }
  setHandler(handler: Handler) {
    this.handler = handler;
  }
  enabled = () => this.allowed;
  handle: Handler = (ident, pending) => this.handler(ident, pending);
}

/** Where a pending paste's placeholder is now, or null once it has been finished. */
export function pendingPosition(state: EditorState, id: string) {
  const item = smartPasteKey.getState(state)?.find((i) => i.id === id);
  return item ? where(state, item) : null;
}

/** Removes a pending paste's placeholder. */
export function finishSmartPaste(view: EditorView, id: string) {
  if (view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(smartPasteKey, { remove: id } satisfies Meta));
}
