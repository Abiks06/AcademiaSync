"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BookMarked, Check, Plus, Search, X } from "lucide-react";
import { authorNames, citeContext, formatCitation } from "@/lib/library/styles";
import { searchText } from "@/lib/library/format";
import type { CitationItem, CitationMode } from "@/lib/library/citations";
import type { Source } from "@/lib/library/types";
import { Dialog } from "@/components/ui/dialog";
import { useSources } from "./sources-context";

type Props = {
  /** Sources that can be cited (not deleted). */
  sources: Source[];
  /** When editing an existing citation, what it cites now. */
  initial?: { items: CitationItem[]; mode: CitationMode };
  onInsert: (items: CitationItem[], mode: CitationMode) => void;
  onAddNew: () => void;
  onClose: () => void;
};

/**
 * Search the library and cite one or more sources at the cursor. Enter cites the highlighted
 * source together with any already picked; Shift+Enter or a click adds it to the citation
 * without inserting yet, so "(Smith, 2010; Jones, 2012, p. 4)" takes a few keystrokes.
 */
export function CitationPicker({ sources, initial, onInsert, onAddNew, onClose }: Props) {
  const { byId, cite } = useSources();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<CitationItem[]>(initial?.items ?? []);
  const [mode, setMode] = useState<CitationMode>(initial?.mode ?? "parenthetical");
  const listRef = useRef<HTMLUListElement>(null);
  const ids = useId();

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return sources.filter((s) => words.every((w) => searchText(s).includes(w))).slice(0, 50);
  }, [sources, query]);

  const move = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (i: number) => `${ids}-opt-${i}`;

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${move}"]`)?.scrollIntoView({ block: "nearest" });
  }, [move]);

  const isPicked = (id: string) => picked.some((p) => p.sourceId === id);
  const toggle = (s: Source) =>
    setPicked((list) => (list.some((p) => p.sourceId === s.id) ? list.filter((p) => p.sourceId !== s.id) : [...list, { sourceId: s.id }]));
  const setItem = (id: string, patch: Partial<CitationItem>) =>
    setPicked((list) => list.map((p) => (p.sourceId === id ? { ...p, ...patch } : p)));

  const insert = (extra?: Source) => {
    const items = extra && !isPicked(extra.id) ? [...picked, { sourceId: extra.id }] : picked;
    if (items.length > 0) onInsert(items, mode);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(move + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(move - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = results[move];
      if (e.shiftKey && s) toggle(s);
      else insert(s);
    }
  };

  // Preview with the citation's own sources numbered as they would be if cited now.
  const preview = useMemo(() => {
    if (picked.length === 0) return null;
    const known = new Set(cite.numbers.keys());
    const ids = [...cite.numbers.keys(), ...picked.map((p) => p.sourceId).filter((id) => !known.has(id))];
    return formatCitation(picked, mode, citeContext(cite.style, ids, (id) => byId.get(id)));
  }, [picked, mode, cite, byId]);

  return (
    <Dialog onClose={onClose} label={initial ? "Edit citation" : "Cite a source"} variant="top" className="w-full max-w-xl">
      <div className="overflow-hidden rounded-2xl border border-line bg-bg-elev shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-faint" aria-hidden />
          <input
            data-autofocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={`${ids}-results`}
            aria-activedescendant={results.length > 0 ? optionId(move) : undefined}
            aria-autocomplete="list"
            aria-label="Search your library"
            placeholder="Search by author, title or year"
            className="h-14 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint">esc</kbd>
        </div>

        {picked.length > 0 && (
          <div className="border-b border-line bg-iris-soft/40 px-4 py-3">
            <ul className="flex flex-col gap-2" aria-label="Sources in this citation">
              {picked.map((p) => {
                const s = byId.get(p.sourceId);
                return (
                  <li key={p.sourceId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{s ? `${authorNames(s, "apa")}, ${s.year ?? "n.d."}` : "Unknown source"}</span>
                    <label className="sr-only" htmlFor={`${ids}-loc-${p.sourceId}`}>Page or locator for {s?.title ?? "this source"}</label>
                    <input
                      id={`${ids}-loc-${p.sourceId}`}
                      value={p.locator ?? ""}
                      onChange={(e) => setItem(p.sourceId, { locator: e.target.value.slice(0, 40) || undefined })}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), insert())}
                      placeholder="page, e.g. 45"
                      className="h-8 w-28 rounded-lg border border-line bg-bg px-2 text-xs outline-none focus:border-iris"
                    />
                    <button
                      type="button"
                      onClick={() => setPicked((list) => list.filter((x) => x.sourceId !== p.sourceId))}
                      aria-label={`Remove ${s?.title ?? "source"} from this citation`}
                      className="rounded-md p-1 text-muted hover:bg-iris-soft hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <ul id={`${ids}-results`} ref={listRef} role="listbox" aria-label="Library" aria-multiselectable="true" className="max-h-[40vh] overflow-y-auto p-2">
          {results.map((s, i) => (
            <li
              key={s.id}
              id={optionId(i)}
              role="option"
              aria-selected={isPicked(s.id)}
              data-index={i}
              onMouseMove={() => setActive(i)}
              onClick={() => toggle(s)}
              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${i === move ? "bg-iris-soft" : ""}`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${isPicked(s.id) ? "border-iris bg-iris text-bg" : "border-line-strong"}`}
              >
                {isPicked(s.id) && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="block truncate text-xs text-muted">
                  <span className="font-mono text-iris">{authorNames(s, "apa")}, {s.year ?? "n.d."}</span>
                  {s.container && <span className="italic"> · {s.container}</span>}
                </span>
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted">
              <BookMarked className="h-5 w-5 text-faint" aria-hidden />
              {sources.length === 0 ? "Your library is empty." : `Nothing matches “${query}”.`}
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <fieldset className="flex rounded-full border border-line p-0.5 text-xs">
            <legend className="sr-only">Citation form</legend>
            {(["parenthetical", "narrative"] as const).map((m) => (
              <label key={m} className={`cursor-pointer rounded-full px-2.5 py-1 ${mode === m ? "bg-ink text-bg" : "text-muted"}`}>
                <input type="radio" name={`${ids}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                {m === "parenthetical" ? "(Author, Year)" : "Author (Year)"}
              </label>
            ))}
          </fieldset>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-iris" aria-live="polite">{preview}</span>
          <button
            type="button"
            onClick={() => insert(picked.length ? undefined : results[move])}
            disabled={picked.length === 0 && !results[move]}
            className="h-9 rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {initial ? "Update citation" : "Cite"}
          </button>
        </div>

        <button
          type="button"
          onClick={onAddNew}
          className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm text-iris transition-colors hover:bg-iris-soft"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a new source (paste a DOI, arXiv or PubMed id to fill it in)
        </button>
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
          Enter cites · Shift+Enter or click adds another source · type “[@” in the text to open this
        </p>
      </div>
    </Dialog>
  );
}
