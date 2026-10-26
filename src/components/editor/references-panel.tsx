"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, Copy, Download, Quote, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { bibliographyOrder, formatReference, toBibtex } from "@/lib/library/format";
import { isNumericStyle, STYLE_LABEL } from "@/lib/library/styles";
import type { Source } from "@/lib/library/types";
import { downloadText, fileSlug } from "@/lib/download";
import { useSources } from "./sources-context";

type Props = {
  onClose: () => void;
  /** Ids of the sources the text cites, in order of first appearance, and how many citations there are. */
  citedIds: string[];
  citationCount: number;
  documentTitle: string;
};

/** The bibliography for this manuscript: exactly the sources it cites. */
export function ReferencesPanel({ onClose, citedIds, citationCount, documentTitle }: Props) {
  const { byId, cite } = useSources();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numeric = isNumericStyle(cite.style);

  const { sources, missing, deleted } = useMemo(() => {
    const found = citedIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
    // Numeric styles list sources in the order they're first cited; the others alphabetically.
    const ordered = numeric ? found : [...found].sort(bibliographyOrder);
    return { sources: ordered, missing: citedIds.length - found.length, deleted: found.filter((s) => s.deleted_at).length };
  }, [citedIds, byId, numeric]);

  const entry = (s: Source) => (numeric ? `[${cite.numbers.get(s.id) ?? "?"}] ${formatReference(s)}` : formatReference(s));

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(sources.map(entry).join("\n\n"));
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it by hand.");
    }
  };

  return (
    <Dialog onClose={onClose} label="References" variant="sheet" className="flex h-dvh w-full max-w-lg flex-col border-l border-line bg-bg-elev shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Quote className="h-4 w-4 text-iris" aria-hidden />
        <h2 className="font-serif text-xl">References</h2>
        <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[11px] text-iris">{sources.length}</span>
        <span className="text-xs text-faint">{STYLE_LABEL[cite.style]}</span>
        <button aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {(missing > 0 || deleted > 0) && (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {deleted > 0 && `${deleted === 1 ? "One cited source was" : `${deleted} cited sources were`} deleted from the library; restore ${deleted === 1 ? "it" : "them"} there or remove the citation. `}
              {missing > 0 && `${missing === 1 ? "One cited source isn't" : `${missing} cited sources aren't`} in this project's library, perhaps pasted from another project. `}
              They are marked with ⚠ in the text.
            </span>
          </p>
        )}
        {sources.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing cited yet. Type <kbd className="rounded border border-line px-1.5 font-mono text-xs">[@</kbd> or press{" "}
            <kbd className="rounded border border-line px-1.5 font-mono text-xs">Ctrl/⌘ Shift K</kbd> while writing to cite a source from your library.
          </p>
        ) : (
          <>
            <p className="mb-4 text-xs text-faint">
              {citationCount} {citationCount === 1 ? "citation" : "citations"} of {sources.length} {sources.length === 1 ? "source" : "sources"}. Updates as you write.
            </p>
            <ol className="space-y-4">
              {sources.map((s, i) => (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.03 }}
                  className={`border-l-2 pl-4 text-sm leading-relaxed [text-indent:-1.5rem] [padding-left:2.5rem] ${s.deleted_at ? "border-amber/60 text-muted" : "border-iris/40"}`}
                >
                  {entry(s)}
                  {s.deleted_at && <span className="ml-1 text-amber"> (deleted from the library)</span>}
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
          <button
            onClick={() => downloadText(`${fileSlug(documentTitle, "references")}.bib`, toBibtex(sources), "text/x-bibtex")}
            className="flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm hover:border-line-strong"
          >
            <Download className="h-4 w-4" /> BibTeX
          </button>
        </div>
      )}
    </Dialog>
  );
}
