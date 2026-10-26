"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Copy, Download, Quote, X } from "lucide-react";
import { bibliographyOrder, formatReference, toBibtex } from "@/lib/library/format";
import type { Source } from "@/lib/library/types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Ids of the sources the text cites, and how many citations there are in all. */
  citedIds: string[];
  citationCount: number;
  byId: Map<string, Source>;
  documentTitle: string;
};

/** The bibliography for this manuscript: exactly the sources it cites, in order. */
export function ReferencesPanel({ open, onClose, citedIds, citationCount, byId, documentTitle }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sources, missing } = useMemo(() => {
    const found = citedIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
    return { sources: found.sort(bibliographyOrder), missing: citedIds.length - found.length };
  }, [citedIds, byId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(sources.map(formatReference).join("\n\n"));
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it by hand.");
    }
  };

  const downloadBibtex = () => {
    const blob = new Blob([toBibtex(sources)], { type: "text/x-bibtex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentTitle.replace(/[^\w-]+/g, "-").toLowerCase() || "references"}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label="References"
            className="fixed top-0 right-0 z-50 flex h-dvh w-full max-w-lg flex-col border-l border-line bg-bg-elev shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <Quote className="h-4 w-4 text-iris" />
              <h2 className="font-serif text-xl">References</h2>
              <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[11px] text-iris">{sources.length}</span>
              <button aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {missing > 0 && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {missing === 1 ? "One cited source was" : `${missing} cited sources were`} deleted from the library. Those citations are marked in the text.
                </p>
              )}
              {sources.length === 0 ? (
                <p className="text-sm text-muted">
                  Nothing cited yet. Press <kbd className="rounded border border-line px-1.5 font-mono text-xs">Ctrl/⌘ Shift K</kbd> while writing to cite a source from your library.
                </p>
              ) : (
                <>
                  <p className="mb-4 text-xs text-faint">{citationCount} {citationCount === 1 ? "citation" : "citations"} of {sources.length} {sources.length === 1 ? "source" : "sources"}. Updates as you write.</p>
                  <ol className="space-y-4">
                    {sources.map((s, i) => (
                      <motion.li
                        key={s.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-l-2 border-iris/40 pl-4 text-sm leading-relaxed [text-indent:-1.5rem] [padding-left:2.5rem]"
                      >
                        {formatReference(s)}
                      </motion.li>
                    ))}
                  </ol>
                </>
              )}
              {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
            </div>

            {sources.length > 0 && (
              <div className="flex gap-2 border-t border-line p-4">
                <button onClick={() => void copyAll()} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-bg">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy bibliography"}
                </button>
                <button onClick={downloadBibtex} className="flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm hover:border-line-strong">
                  <Download className="h-4 w-4" /> BibTeX
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
