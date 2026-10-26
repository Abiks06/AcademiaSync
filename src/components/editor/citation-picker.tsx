"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { BookMarked, Plus, Search } from "lucide-react";
import { inTextLabel, searchText } from "@/lib/library/format";
import type { Source } from "@/lib/library/types";

type Props = {
  sources: Source[];
  onPick: (source: Source) => void;
  onAddNew: () => void;
  onClose: () => void;
};

/** Search the library and insert a citation at the cursor. Arrow keys move, Enter picks. */
export function CitationPicker({ sources, onPick, onAddNew, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return sources.filter((s) => words.every((w) => searchText(s).includes(w))).slice(0, 50);
  }, [sources, query]);

  const move = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${move}"]`)?.scrollIntoView({ block: "nearest" });
  }, [move]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(move + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(move - 1, 0));
    } else if (e.key === "Enter" && results[move]) {
      e.preventDefault();
      onPick(results[move]);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Cite a source"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-bg-elev shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="citation-results"
            aria-label="Search your library"
            placeholder="Cite a source: search by author, title or year"
            className="h-14 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint">esc</kbd>
        </div>

        <ul id="citation-results" ref={listRef} role="listbox" className="max-h-[46vh] overflow-y-auto p-2">
          {results.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === move}
              data-index={i}
              onMouseMove={() => setActive(i)}
              onClick={() => onPick(s)}
              className={`cursor-pointer rounded-xl px-3 py-2.5 ${i === move ? "bg-iris-soft" : ""}`}
            >
              <p className="truncate text-sm font-medium">{s.title}</p>
              <p className="truncate text-xs text-muted">
                <span className="font-mono text-iris">{inTextLabel(s)}</span>
                {s.container && <span className="italic"> · {s.container}</span>}
              </p>
            </li>
          ))}
          {results.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted">
              <BookMarked className="h-5 w-5 text-faint" />
              {sources.length === 0 ? "Your library is empty." : `Nothing matches “${query}”.`}
            </li>
          )}
        </ul>

        <button
          onClick={onAddNew}
          className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm text-iris transition-colors hover:bg-iris-soft"
        >
          <Plus className="h-4 w-4" /> Add a new source (paste a DOI to fill it in)
        </button>
      </motion.div>
    </motion.div>
  );
}
