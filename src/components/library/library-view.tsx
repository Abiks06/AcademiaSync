"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, Check, ChevronLeft, Copy, Download, ExternalLink, FileType2, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { accentColor } from "@/components/app/accent";
import { TimeAgo } from "@/components/app/time-ago";
import { bibliographyOrder, formatReference, searchText, toBibtex } from "@/lib/library/format";
import { KIND_LABEL, type Source } from "@/lib/library/types";
import { libraryUsage, listSources, setSourceDeleted, sourceUsage } from "@/app/(app)/projects/[projectId]/library/actions";
import { useLibrarySync } from "@/lib/library/use-library-sync";
import { useRequestKey } from "@/lib/use-request-key";
import { downloadText, fileSlug } from "@/lib/download";
import { useToast } from "@/components/ui/toast";
import { EXIT, SPRING } from "@/components/motion/tokens";
import type { LibraryUsage } from "@/lib/library/usage";
import { SourceDialog } from "./source-dialog";
import { ImportDialog } from "./import-dialog";

type Props = {
  project: { id: string; name: string; accent: string };
  initialSources: Source[];
  canEdit: boolean;
  /** Owners and authors can delete anything; others only what they added. */
  canDeleteAll: boolean;
  userId: string;
  createdBy: Record<string, string | null>;
  /** A source to scroll to and highlight, e.g. from a citation's card or the ⌘K palette. */
  focusId?: string;
  /** How often each source is cited; null if that couldn't be worked out. */
  initialUsage: LibraryUsage | null;
  /** The project file attached to each source that has one, by source id. */
  attachedFiles?: Record<string, string>;
};

export function LibraryView({ project, initialSources, canEdit, canDeleteAll, userId, createdBy: initialCreatedBy, focusId, initialUsage, attachedFiles = {} }: Props) {
  const [focused, setFocused] = useState(focusId ?? null);
  useEffect(() => {
    if (!focusId) return;
    const frame = requestAnimationFrame(() => setFocused(focusId));
    const el = document.getElementById(`source-${focusId}`);
    el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const timer = setTimeout(() => setFocused(null), 2600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [focusId]);
  const [all, setAll] = useState(initialSources);
  const [uses, setUses] = useState(initialUsage);
  // The entry opened out to show its abstract, notes and details.
  const [open, setOpen] = useState<string | null>(focusId ?? null);
  const [createdBy, setCreatedBy] = useState(initialCreatedBy);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ editing?: Source } | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Where the source being deleted is cited, so nobody deletes a source 40 citations rely on by accident.
  const [usage, setUsage] = useState<{ id: string; text: string } | null>(null);
  const confirmDelete = async (id: string) => {
    setConfirming(id);
    setUsage(null);
    try {
      const result = await sourceUsage(id);
      if (!result.ok) return;
      const text =
        result.citations === 0
          ? result.complete
            ? "Not cited in any manuscript."
            : "No citations found yet. Manuscripts nobody has opened recently aren't counted."
          : `Cited ${result.citations} ${result.citations === 1 ? "time" : "times"} in ${result.documents} ${result.documents === 1 ? "manuscript" : "manuscripts"}; those citations will show a warning.`;
      setUsage({ id, text });
    } catch {
      // The confirmation still works without the count.
    }
  };
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [requestKey, renewRequestKey] = useRequestKey();
  const accent = accentColor(project.accent);

  const sources = useMemo(() => all.filter((s) => !s.deleted_at), [all]);

  // Keep up with co-authors' changes as they happen.
  const refresh = useCallback(async () => {
    try {
      const [result, used] = await Promise.all([listSources(project.id), libraryUsage(project.id)]);
      if (result.ok) setAll(result.sources);
      if (used.ok) setUses({ counts: used.counts, complete: used.complete });
    } catch {
      // Offline for a moment; the next change or focus tries again.
    }
  }, [project.id]);
  useLibrarySync(project.id, refresh);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return sources.filter((s) => words.every((w) => searchText(s).includes(w))).sort(bibliographyOrder);
  }, [sources, query]);

  const onSaved = (saved: Source) => {
    setAll((list) => (list.some((s) => s.id === saved.id) ? list.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...list]));
    setCreatedBy((map) => (saved.id in map ? map : { ...map, [saved.id]: userId }));
    if (!dialog?.editing) renewRequestKey();
    setDialog(null);
  };

  const setDeleted = async (source: Source, deleted: boolean) => {
    if (busy) return;
    setBusy(source.id);
    setError(null);
    try {
      const result = await setSourceDeleted(source.id, deleted);
      if (!result.ok) return setError(result.error);
      setAll((list) => list.map((s) => (s.id === source.id ? { ...s, deleted_at: result.deletedAt } : s)));
      setConfirming(null);
      if (deleted) {
        toast({
          title: `Deleted “${source.title.length > 60 ? `${source.title.slice(0, 57)}…` : source.title}”`,
          description: "Citations of it now show a warning.",
          action: { label: "Undo", onClick: () => void setDeleted(source, false) },
        });
      } else {
        toast({ tone: "success", title: "Source restored" });
      }
    } catch {
      setError("Couldn't reach AcademiaSync. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (s: Source) => {
    try {
      await navigator.clipboard.writeText(formatReference(s));
      setCopied(s.id);
      toast({ tone: "success", title: "Reference copied" });
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1800);
    } catch {
      setError("Your browser blocked copying. Select the reference text and copy it by hand.");
    }
  };

  const downloadBibtex = () =>
    downloadText(`${fileSlug(project.name, "library")}.bib`, toBibtex([...sources].sort(bibliographyOrder)), "text/x-bibtex");

  // Sources grouped by whether anything cites them yet, like papers on a desk: the ones in use
  // to hand, the rest in a pile waiting.
  const groups = useMemo(() => {
    if (!uses) return [{ key: "all", label: null, list: shown }];
    const cited = shown.filter((s) => (uses.counts[s.id] ?? 0) > 0);
    const waiting = shown.filter((s) => !((uses.counts[s.id] ?? 0) > 0));
    return [
      { key: "cited", label: "Cited in your manuscripts", list: cited },
      { key: "waiting", label: uses.complete ? "Not cited yet" : "No citations found yet", list: waiting },
    ].filter((g) => g.list.length > 0);
  }, [shown, uses]);

  const entry = (s: Source) => {
    const canDelete = canDeleteAll || (canEdit && createdBy[s.id] === userId);
    const count = uses?.counts[s.id] ?? 0;
    const isOpen = open === s.id;
    const action = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink";
    return (
      <>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setOpen(isOpen ? null : s.id)}
            aria-expanded={isOpen}
            aria-controls={`source-detail-${s.id}`}
            className="flex min-w-0 flex-1 items-baseline gap-4 rounded-xl px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-iris"
          >
            <span className="w-11 shrink-0 font-serif text-sm text-faint tabular-nums [font-variant-numeric:oldstyle-nums]">{s.year ?? "n.d."}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.92rem] tracking-[0.05em] text-muted [font-variant-caps:all-small-caps]">{bylineOf(s)}</span>
              <span className={`mt-0.5 block font-serif text-[1.08rem] leading-snug ${isOpen ? "" : "line-clamp-2"}`}>{s.title}</span>
              {placeOf(s) && <span className="mt-0.5 block truncate text-sm text-faint italic">{placeOf(s)}</span>}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 pt-3 pr-3">
            {/* Actions wait until you reach for the entry, so the desk stays calm. */}
            <span className={`hidden items-center transition-opacity duration-150 sm:flex [@media(hover:none)]:opacity-100 ${isOpen || confirming === s.id ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"}`}>
              <IconButton label={copied === s.id ? "Copied" : "Copy reference"} onClick={() => void copy(s)}>
                {copied === s.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </IconButton>
              {(s.doi || s.url) && (
                <a
                  href={s.doi ? `https://doi.org/${s.doi}` : s.url!}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Open the source"
                  title="Open the source"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-iris-soft hover:text-ink"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {attachedFiles[s.id] && (
                <Link
                  href={`/projects/${project.id}/files/${attachedFiles[s.id]}`}
                  aria-label="Open attached file"
                  title="Open attached file"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-iris-soft hover:text-ink"
                >
                  <FileType2 className="h-3.5 w-3.5" />
                </Link>
              )}
              {canEdit && (
                <IconButton label="Edit" onClick={() => setDialog({ editing: s })}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
              )}
              {canDelete && (
                <IconButton label="Delete" danger onClick={() => void confirmDelete(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </span>
            {count > 0 && (
              <span className="ml-1 flex items-center gap-1 pl-1 font-mono text-[10px] text-faint" title={`Cited ${count} ${count === 1 ? "time" : "times"}`}>
                <span aria-hidden className="flex gap-0.5">
                  {Array.from({ length: Math.min(count, 5) }, (_, k) => (
                    <span key={k} className="h-1.5 w-1.5 rounded-full bg-iris/60" />
                  ))}
                </span>
                <span className="sr-only sm:not-sr-only">×{count}</span>
              </span>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {confirming === s.id && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: EXIT }}
              transition={SPRING.glide}
              className="overflow-hidden"
            >
              <p className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs sm:pl-[4.75rem]">
                <span className="text-muted">
                  Delete? {usage?.id === s.id ? usage.text : "Citations of it will show a warning."} You can undo this.
                </span>
                <button
                  onClick={() => void setDeleted(s, true)}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 font-semibold text-bg disabled:opacity-60"
                >
                  {busy === s.id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />} Delete
                </button>
                <button onClick={() => setConfirming(null)} className="rounded-lg px-3 py-1.5 text-muted hover:bg-iris-soft">
                  Keep
                </button>
              </p>
            </motion.div>
          )}
          {isOpen && (
            <motion.div
              key="detail"
              id={`source-detail-${s.id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: EXIT }}
              transition={SPRING.glide}
              className="overflow-hidden"
            >
              <div className="grid gap-3 px-4 pb-4 text-sm sm:pl-[4.75rem]">
                <p className="text-muted">{s.authors.map((a) => (a.given ? `${a.given} ${a.family}` : a.family)).join(", ") || "No authors listed"}</p>
                {s.abstract && <p className="line-clamp-6 font-serif leading-relaxed text-ink/85">{s.abstract}</p>}
                {s.notes && <p className="border-l-2 border-amber/70 pl-3 font-serif text-muted italic">{s.notes}</p>}
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
                  <span className="rounded bg-iris-soft px-2 py-0.5 font-mono text-iris">{KIND_LABEL[s.kind]}</span>
                  {s.doi && <span className="font-mono">doi:{s.doi}</span>}
                  <span>{count > 0 ? `Cited ${count} ${count === 1 ? "time" : "times"}` : "Not cited yet"}</span>
                  <TimeAgo iso={s.created_at} prefix="Added " />
                </p>
                <div className="-ml-2.5 flex flex-wrap gap-1">
                  <button onClick={() => void copy(s)} className={action}>
                    {copied === s.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === s.id ? "Copied" : "Copy reference"}
                  </button>
                  {attachedFiles[s.id] && (
                    <Link href={`/projects/${project.id}/files/${attachedFiles[s.id]}`} className={`${action} sm:hidden`}>
                      <FileType2 className="h-3.5 w-3.5" /> Open attached file
                    </Link>
                  )}
                  {canEdit && (
                    <button onClick={() => setDialog({ editing: s })} className={action}>
                      <Pencil className="h-3.5 w-3.5" /> Edit details
                    </button>
                  )}
                  {/* On a phone the row has no room for icons, so everything lives here. */}
                  {(s.doi || s.url) && (
                    <a href={s.doi ? `https://doi.org/${s.doi}` : s.url!} target="_blank" rel="noreferrer noopener" className={`${action} sm:hidden`}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                  )}
                  {canDelete && (
                    <button onClick={() => void confirmDelete(s.id)} className={`${action} hover:!bg-danger/10 hover:!text-danger sm:hidden`}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
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
              <button
                onClick={() => setImporting(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm transition-colors hover:border-line-strong"
              >
                <Upload className="h-4 w-4" aria-hidden /> Import
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
      <div className="mt-8 flex flex-col gap-10">
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={group.label ? `library-${group.key}` : undefined}>
            {group.label && (
              <h2 id={`library-${group.key}`} className="running-head mb-3 flex items-baseline gap-3 border-b border-line pb-2 !text-[0.8rem] !text-faint">
                {group.label}
                <span className="font-mono text-[10px] tracking-normal">{group.list.length}</span>
              </h2>
            )}
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {group.list.map((s, i) => (
                  <motion.li
                    key={s.id}
                    id={`source-${s.id}`}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: EXIT }}
                    transition={{ ...SPRING.glide, delay: Math.min(i, 10) * 0.02 }}
                    className={`group scroll-mt-24 rounded-xl border transition-[background-color,border-color,box-shadow] duration-500 ${
                      focused === s.id
                        ? "border-iris shadow-[0_0_0_1px_var(--iris),0_0_40px_-6px_var(--iris)]"
                        : open === s.id
                          ? "border-line bg-bg-elev"
                          : "border-transparent hover:bg-bg-elev/60"
                    }`}
                  >
                    {entry(s)}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>

      {sources.length === 0 && (
        <div className="mt-12 rounded-3xl border border-dashed border-line-strong p-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris"><BookMarked className="h-5 w-5" /></span>
          <h2 className="mt-4 font-serif text-2xl">No sources yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            {canEdit
              ? "Paste a DOI, arXiv or PubMed id and the details fill themselves in, or import a BibTeX or RIS file from Zotero, Mendeley or EndNote."
              : "Sources your team adds will appear here."}
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
        {dialog && (
          <SourceDialog
            key={dialog.editing?.id ?? "new"}
            projectId={project.id}
            editing={dialog.editing}
            requestId={requestKey}
            onClose={() => setDialog(null)}
            onSaved={onSaved}
          />
        )}
        {importing && (
          <ImportDialog
            projectId={project.id}
            onClose={() => setImporting(false)}
            onImported={(added) => {
              setAll((list) => [...added, ...list]);
              setCreatedBy((map) => ({ ...map, ...Object.fromEntries(added.map((a) => [a.id, userId])) }));
              setImporting(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors ${danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-iris-soft hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/** "Thompson, Olsen & Mitchell" or "Eriksen et al.", set in small capitals. */
function bylineOf(s: Source) {
  const names = s.authors.map((a) => a.family || a.given).filter(Boolean);
  if (names.length === 0) return s.publisher ?? "Anonymous";
  if (names.length <= 3) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
  return `${names[0]} et al.`;
}

/** "Science 347(6223), 768–771", with a true en dash in page ranges. */
function placeOf(s: Source) {
  const issue = [s.volume, s.issue ? `(${s.issue})` : ""].join("");
  const pages = s.pages?.replace(/\s*-+\s*/g, "–");
  const where = [s.container ?? s.publisher, issue].filter(Boolean).join(" ");
  return [where, pages].filter(Boolean).join(", ");
}
