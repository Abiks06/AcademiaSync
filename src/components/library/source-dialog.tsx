"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { authorsToText, parseAuthors } from "@/lib/library/authors";
import { KIND_LABEL, SOURCE_KINDS, type Source, type SourceFields, type SourceKind } from "@/lib/library/types";
import { lookupSource, saveSource, updateSource } from "@/app/(app)/projects/[projectId]/library/actions";

const inputClass =
  "h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]";

type FormValues = {
  kind: SourceKind;
  title: string;
  authors: string;
  year: string;
  container: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  doi: string;
  url: string;
  abstract: string;
  notes: string;
};

const EMPTY: FormValues = {
  kind: "article", title: "", authors: "", year: "", container: "", volume: "", issue: "",
  pages: "", publisher: "", doi: "", url: "", abstract: "", notes: "",
};

function toForm(s: SourceFields): FormValues {
  return {
    kind: s.kind, title: s.title, authors: authorsToText(s.authors), year: s.year ? String(s.year) : "",
    container: s.container ?? "", volume: s.volume ?? "", issue: s.issue ?? "", pages: s.pages ?? "",
    publisher: s.publisher ?? "", doi: s.doi ?? "", url: s.url ?? "", abstract: s.abstract ?? "", notes: s.notes ?? "",
  };
}

type Props = {
  projectId: string;
  /** Present when editing; absent when adding. */
  editing?: Source;
  /** The DOI lookup and the fields a pick prefilled, when the picker opens this dialog. */
  initialDoi?: string;
  onClose: () => void;
  onSaved: (source: Source) => void;
};

export function SourceDialog({ projectId, editing, initialDoi, onClose, onSaved }: Props) {
  const [values, setValues] = useState<FormValues>(editing ? toForm(editing) : { ...EMPTY, doi: initialDoi ?? "" });
  const [lookupDoi, setLookupDoi] = useState(initialDoi ?? "");
  const [lookupState, setLookupState] = useState<"idle" | "busy">("idle");
  const [filled, setFilled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One key per opened dialog, so a double click or a retry can't create the source twice.
  const [requestId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const fetchDetails = async () => {
    if (!lookupDoi.trim()) return setMessage("Paste a DOI first.");
    setLookupState("busy");
    setMessage(null);
    const result = await lookupSource(lookupDoi);
    setLookupState("idle");
    if (!result.ok) return setMessage(result.error);
    setValues(toForm(result.source));
    setFilled(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const fields = {
      kind: values.kind,
      title: values.title,
      authors: parseAuthors(values.authors),
      year: values.year.trim() ? Number(values.year) : null,
      container: values.container, volume: values.volume, issue: values.issue, pages: values.pages,
      publisher: values.publisher, doi: values.doi, url: values.url, abstract: values.abstract, notes: values.notes,
    };
    if (fields.year !== null && !Number.isInteger(fields.year)) {
      setSaving(false);
      return setMessage("Enter the year as a four-digit number, like 2024.");
    }
    const result = editing
      ? await updateSource({ sourceId: editing.id, fields })
      : await saveSource({ projectId, requestId, fields });
    setSaving(false);
    if (!result.ok) return setMessage(result.error);
    onSaved(result.source);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-dialog-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        className="relative my-8 w-full max-w-2xl rounded-2xl border border-line bg-bg-elev shadow-2xl"
      >
        <form onSubmit={submit} className="grid gap-5 p-6">
          <div className="flex items-start">
            <h2 id="source-dialog-title" className="font-serif text-2xl">{editing ? "Edit source" : "Add a source"}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!editing && (
            <div className="rounded-xl border border-iris/30 bg-iris-soft p-4">
              <label htmlFor="lookup-doi" className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-iris" /> Have a DOI? Paste it and we fill in the rest
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="lookup-doi"
                  value={lookupDoi}
                  onChange={(e) => setLookupDoi(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void fetchDetails();
                    }
                  }}
                  placeholder="10.1021/es2031505 or https://doi.org/…"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void fetchDetails()}
                  disabled={lookupState === "busy"}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-60"
                >
                  {lookupState === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Fetch
                </button>
              </div>
              {filled && <p role="status" className="mt-2 text-xs text-success">Filled in from Crossref. Check it over, then save.</p>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
            <Labelled label="Title" htmlFor="src-title">
              <input id="src-title" value={values.title} onChange={(e) => set("title", e.target.value)} required maxLength={500} className={inputClass} />
            </Labelled>
            <Labelled label="Type" htmlFor="src-kind">
              <select id="src-kind" value={values.kind} onChange={(e) => set("kind", e.target.value as SourceKind)} className={inputClass}>
                {SOURCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </Labelled>
          </div>

          <Labelled label="Authors" htmlFor="src-authors" hint="One per line: Family, Given">
            <textarea
              id="src-authors" value={values.authors} onChange={(e) => set("authors", e.target.value)}
              rows={3} placeholder={"Lusher, Amy\nHollman, Peter"} className={`${inputClass} h-auto py-2.5`}
            />
          </Labelled>

          <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
            <Labelled label="Year" htmlFor="src-year">
              <input id="src-year" value={values.year} onChange={(e) => set("year", e.target.value)} inputMode="numeric" maxLength={4} placeholder="2017" className={inputClass} />
            </Labelled>
            <Labelled label={values.kind === "article" || values.kind === "conference" ? "Journal or proceedings" : "Container (book or site)"} htmlFor="src-container">
              <input id="src-container" value={values.container} onChange={(e) => set("container", e.target.value)} maxLength={300} className={inputClass} />
            </Labelled>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Labelled label="Volume" htmlFor="src-volume">
              <input id="src-volume" value={values.volume} onChange={(e) => set("volume", e.target.value)} maxLength={40} className={inputClass} />
            </Labelled>
            <Labelled label="Issue" htmlFor="src-issue">
              <input id="src-issue" value={values.issue} onChange={(e) => set("issue", e.target.value)} maxLength={40} className={inputClass} />
            </Labelled>
            <Labelled label="Pages" htmlFor="src-pages">
              <input id="src-pages" value={values.pages} onChange={(e) => set("pages", e.target.value)} maxLength={40} placeholder="245-307" className={inputClass} />
            </Labelled>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label="Publisher" htmlFor="src-publisher">
              <input id="src-publisher" value={values.publisher} onChange={(e) => set("publisher", e.target.value)} maxLength={300} className={inputClass} />
            </Labelled>
            <Labelled label="DOI" htmlFor="src-doi">
              <input id="src-doi" value={values.doi} onChange={(e) => set("doi", e.target.value)} maxLength={200} placeholder="10.1000/xyz123" className={inputClass} />
            </Labelled>
          </div>

          <Labelled label="Link" htmlFor="src-url" hint="Used when there is no DOI">
            <input id="src-url" value={values.url} onChange={(e) => set("url", e.target.value)} maxLength={2000} placeholder="https://" className={inputClass} />
          </Labelled>

          <Labelled label="Notes" htmlFor="src-notes" hint="Only your team sees these">
            <textarea id="src-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={5000} className={`${inputClass} h-auto py-2.5`} />
          </Labelled>

          {message && <p role="alert" className="text-sm text-danger">{message}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm text-muted hover:bg-iris-soft">Cancel</button>
            <button disabled={saving} className="flex h-10 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-bg disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add to library"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Labelled({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="flex text-sm font-medium">
        {label}
        {hint && <span className="ml-auto text-xs font-normal text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
