"use client";

import { useId, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatReference } from "@/lib/library/format";
import type { Source } from "@/lib/library/types";
import { useRequestKey } from "@/lib/use-request-key";
import { importSources, previewImport, type ImportPreview } from "@/app/(app)/projects/[projectId]/library/actions";

type Props = {
  projectId: string;
  onClose: () => void;
  onImported: (added: Source[]) => void;
};

const NETWORK_ERROR = "Couldn't reach AcademiaSync. Check your connection and try again.";
const MAX_BYTES = 900_000;

/**
 * Import a BibTeX or RIS file exported from Zotero, Mendeley, EndNote or Google Scholar.
 * The file is read and shown first; references already in the library are left unticked.
 */
export function ImportDialog({ projectId, onClose, onImported }: Props) {
  const ids = useId();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ items: ImportPreview[]; skipped: number } | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestKey] = useRequestKey();

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setMessage("That file is too large. Export under 900 KB at a time, or split it.");
    setMessage(null);
    setFileName(file.name);
    setText(await file.text());
  };

  const read = async () => {
    if (!text.trim()) return setMessage("Choose a .bib or .ris file, or paste its contents.");
    setBusy(true);
    setMessage(null);
    try {
      const result = await previewImport(projectId, text);
      if (!result.ok) return setMessage(result.error);
      setPreview({ items: result.items, skipped: result.skipped });
      setChosen(new Set(result.items.flatMap((item, i) => (item.duplicate ? [] : [i]))));
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!preview || chosen.size === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const sources = preview.items.filter((_, i) => chosen.has(i)).map((item) => item.source);
      const result = await importSources({ projectId, requestId: requestKey, sources });
      if (!result.ok) return setMessage(result.error);
      onImported(result.added);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setChosen((set) => {
      const next = new Set(set);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const duplicates = preview?.items.filter((item) => item.duplicate).length ?? 0;

  return (
    <Dialog onClose={onClose} labelledBy={`${ids}-title`} className="my-8 w-full max-w-2xl">
      <div className="grid gap-5 rounded-2xl border border-line bg-bg-elev p-6 shadow-2xl">
        <div className="flex items-start">
          <div>
            <h2 id={`${ids}-title`} className="font-serif text-2xl">Import references</h2>
            <p className="mt-1 text-sm text-muted">A BibTeX (.bib) or RIS (.ris) file from Zotero, Mendeley, EndNote or Google Scholar.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!preview ? (
          <>
            <label
              htmlFor={`${ids}-file`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void readFile(e.dataTransfer.files[0]);
              }}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-8 text-center text-sm text-muted transition-colors hover:border-iris hover:bg-iris-soft/40"
            >
              <FileUp className="h-6 w-6 text-iris" aria-hidden />
              {fileName ? <span className="font-medium text-ink">{fileName}</span> : <span>Drop a file here, or choose one</span>}
              <input id={`${ids}-file`} type="file" accept=".bib,.bibtex,.ris,.txt" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
            </label>
            <div className="grid gap-1.5">
              <label htmlFor={`${ids}-paste`} className="text-xs font-medium text-muted">Or paste it</label>
              <textarea
                id={`${ids}-paste`}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFileName(null);
                }}
                rows={5}
                spellCheck={false}
                placeholder="@article{lusher2017, …"
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-iris"
              />
            </div>
          </>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted" role="status">
              Found {preview.items.length} reference{preview.items.length === 1 ? "" : "s"}.
              {duplicates > 0 && ` ${duplicates} already in the library ${duplicates === 1 ? "is" : "are"} left unticked.`}
              {preview.skipped > 0 && ` ${preview.skipped} without a title ${preview.skipped === 1 ? "was" : "were"} skipped.`}
            </p>
            <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {preview.items.map((item, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm hover:bg-iris-soft/40">
                    <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} className="mt-1 accent-[var(--iris)]" />
                    <span className="min-w-0">
                      <span className="block">{formatReference(item.source)}</span>
                      {item.duplicate && <span className="mt-1 inline-block rounded-full bg-iris-soft px-2 py-0.5 text-[11px] text-iris">Already in the library</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {message && <p role="alert" className="text-sm text-danger">{message}</p>}

        <div className="flex justify-end gap-2">
          {preview && (
            <button type="button" onClick={() => setPreview(null)} disabled={busy} className="h-10 rounded-xl px-4 text-sm text-muted hover:bg-iris-soft">
              Back
            </button>
          )}
          <button
            type="button"
            onClick={preview ? save : read}
            disabled={busy || (preview ? chosen.size === 0 : !text.trim())}
            className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {preview ? `Import ${chosen.size} reference${chosen.size === 1 ? "" : "s"}` : "Read file"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
