"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, Check, ChevronLeft, Copy, Download, ExternalLink, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { accentColor } from "@/components/app/accent";
import { TimeAgo } from "@/components/app/time-ago";
import { bibliographyOrder, formatReference, searchText, toBibtex } from "@/lib/library/format";
import { KIND_LABEL, type Source } from "@/lib/library/types";
import { deleteSource } from "@/app/(app)/projects/[projectId]/library/actions";
import { SourceDialog } from "./source-dialog";

type Props = {
  project: { id: string; name: string; accent: string };
  initialSources: Source[];
  canEdit: boolean;
  /** Owners and authors can delete anything; others only what they added. */
  canDeleteAll: boolean;
  userId: string;
  createdBy: Record<string, string | null>;
};

export function LibraryView({ project, initialSources, canEdit, canDeleteAll, userId, createdBy }: Props) {
  const [sources, setSources] = useState(initialSources);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ editing?: Source } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const accent = accentColor(project.accent);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return sources.filter((s) => words.every((w) => searchText(s).includes(w))).sort(bibliographyOrder);
  }, [sources, query]);

  const onSaved = (saved: Source) => {
    setSources((list) => (list.some((s) => s.id === saved.id) ? list.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...list]));
    setDialog(null);
  };

  const remove = async (id: string) => {
    setError(null);
    const result = await deleteSource(id);
    if (!result.ok) return setError(result.error);
    setSources((list) => list.filter((s) => s.id !== id));
    setConfirming(null);
  };

  const copy = async (s: Source) => {
    try {
      await navigator.clipboard.writeText(formatReference(s));
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1800);
    } catch {
      setError("Your browser blocked copying. Select the reference text and copy it by hand.");
    }
  };

  const downloadBibtex = () => {
    const blob = new Blob([toBibtex([...sources].sort(bibliographyOrder))], { type: "text/x-bibtex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, "-").toLowerCase() || "library"}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          {project.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <BookMarked className="h-6 w-6 text-iris" />
          <h1 className="font-serif text-4xl font-medium tracking-tight">Library</h1>
          <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[11px] text-iris">{sources.length}</span>
          <div className="ml-auto flex gap-2">
            {sources.length > 0 && (
              <button onClick={downloadBibtex} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm transition-colors hover:border-line-strong">
                <Download className="h-4 w-4" /> BibTeX
              </button>
            )}
            {canEdit && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setDialog({})}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg"
              >
                <Plus className="h-4 w-4" /> Add source
              </motion.button>
            )}
          </div>
        </div>
        <p className="mt-2 max-w-xl text-muted">
          Every paper, book and dataset your team cites, in one place. Cite them from any manuscript in this project.
        </p>
      </motion.div>

      {sources.length > 0 && (
        <div className="relative mt-8">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-faint" />
          <label htmlFor="library-search" className="sr-only">Search the library</label>
          <input
            id="library-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, year or DOI"
            className="h-12 w-full rounded-xl border border-line bg-bg-elev pr-4 pl-11 outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]"
          />
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      <ul className="mt-6 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {shown.map((s, i) => {
            const canDelete = canDeleteAll || (canEdit && createdBy[s.id] === userId);
            return (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className="glass rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-iris-soft px-2 py-0.5 font-mono text-iris">{KIND_LABEL[s.kind]}</span>
                  {s.year && <span className="text-faint">{s.year}</span>}
                  <span className="ml-auto text-faint"><TimeAgo iso={s.created_at} prefix="Added " /></span>
                </div>
                <h2 className="mt-2 font-serif text-xl leading-snug">{s.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {s.authors.map((a) => (a.given ? `${a.given} ${a.family}` : a.family)).join(", ") || "No authors listed"}
                  {s.container && <span className="italic"> · {s.container}</span>}
                </p>
                {s.notes && <p className="mt-2 line-clamp-2 text-sm text-faint">{s.notes}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-1 text-sm">
                  <button onClick={() => void copy(s)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink">
                    {copied === s.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === s.id ? "Copied" : "Copy reference"}
                  </button>
                  {(s.doi || s.url) && (
                    <a
                      href={s.doi ? `https://doi.org/${s.doi}` : s.url!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                  )}
                  {canEdit && (
                    <button onClick={() => setDialog({ editing: s })} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                  {canDelete &&
                    (confirming === s.id ? (
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        <span className="text-muted">Delete? Citations of it will show as missing.</span>
                        <button onClick={() => void remove(s.id)} className="rounded-lg bg-danger px-3 py-1.5 font-semibold text-bg">Delete</button>
                        <button onClick={() => setConfirming(null)} className="rounded-lg px-3 py-1.5 text-muted hover:bg-iris-soft">Keep</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirming(s.id)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    ))}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {sources.length === 0 && (
        <div className="mt-12 rounded-3xl border border-dashed border-line-strong p-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris"><BookMarked className="h-5 w-5" /></span>
          <h2 className="mt-4 font-serif text-2xl">No sources yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            {canEdit ? "Paste a DOI and the title, authors and journal fill themselves in." : "Sources your team adds will appear here."}
          </p>
          {canEdit && (
            <button onClick={() => setDialog({})} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg">
              <Plus className="h-4 w-4" /> Add the first source
            </button>
          )}
        </div>
      )}
      {sources.length > 0 && shown.length === 0 && <p className="mt-8 text-center text-muted">Nothing matches “{query}”.</p>}

      <AnimatePresence>
        {dialog && <SourceDialog projectId={project.id} editing={dialog.editing} onClose={() => setDialog(null)} onSaved={onSaved} />}
      </AnimatePresence>
    </div>
  );
}
