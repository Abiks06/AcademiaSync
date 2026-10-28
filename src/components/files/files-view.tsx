"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Download, FileImage, FileSpreadsheet, FileText, FileType2, FolderOpen, Link2, Loader2, Presentation, Trash2, Upload } from "lucide-react";
import { accentColor } from "@/components/app/accent";
import { TimeAgo } from "@/components/app/time-ago";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { useProjectTableSync } from "@/lib/library/use-library-sync";
import { ACCEPT, FILE_LIMITS, FILES_BUCKET, KIND_NAME, contentTypeFor, fileKind, formatBytes, storagePath, type FileKind, type ProjectFile } from "@/lib/files/files";
import type { Author } from "@/lib/library/types";
import { attachFile, deleteFile, fileLink, listFiles, recordUpload } from "@/app/(app)/projects/[projectId]/files/actions";

type SourceOption = { id: string; title: string; authors: Author[]; year: number | null };

type Props = {
  project: { id: string; name: string; accent: string };
  initialFiles: ProjectFile[];
  sources: SourceOption[];
  /** Display names by user id ("you" for the viewer). */
  names: Record<string, string>;
  userId: string;
  canEdit: boolean;
  /** Owners and authors can delete any file; others only what they uploaded. */
  canDeleteAll: boolean;
};

export const KIND_ICON: Record<FileKind, typeof FileText> = {
  pdf: FileType2,
  word: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: FileImage,
  text: FileText,
};

const sourceLabel = (s: SourceOption) => {
  const first = s.authors[0]?.family;
  const who = first ? `${first}${s.authors.length > 1 ? " et al." : ""}` : "";
  return [who && `${who} (${s.year ?? "n.d."})`, s.title.length > 70 ? `${s.title.slice(0, 67)}…` : s.title].filter(Boolean).join(" · ");
};

/** The project's shared shelf: upload, open, attach to a library source, download, delete. */
export function FilesView({ project, initialFiles, sources, names, userId, canEdit, canDeleteAll }: Props) {
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState<{ id: string; name: string }[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const accent = accentColor(project.accent);
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const refresh = useCallback(async () => {
    try {
      const result = await listFiles(project.id);
      if (result.ok) setFiles(result.files);
    } catch {
      // Offline for a moment; the next change or focus tries again.
    }
  }, [project.id]);
  useProjectTableSync("project_files", project.id, refresh);

  const used = files.reduce((sum, f) => sum + f.size_bytes, 0);

  const upload = async (picked: File[]) => {
    if (!canEdit || picked.length === 0) return;
    setError(null);
    const supabase = createClient();
    let room = FILE_LIMITS.projectBytes - used;
    for (const file of picked) {
      const type = contentTypeFor(file.name);
      if (!type) {
        setError(`“${file.name}” isn't a type the shelf takes. Use PDF, Word, Excel, PowerPoint, text, CSV, Markdown or an image.`);
        continue;
      }
      if (file.size > FILE_LIMITS.maxBytes) {
        setError(`“${file.name}” is ${formatBytes(file.size)}. Files can be up to ${formatBytes(FILE_LIMITS.maxBytes)}.`);
        continue;
      }
      if (file.size > room) {
        setError(`There isn't room for “${file.name}”: this project has ${formatBytes(Math.max(room, 0))} left of ${formatBytes(FILE_LIMITS.projectBytes)}.`);
        continue;
      }
      room -= file.size;
      const id = crypto.randomUUID();
      setUploading((list) => [...list, { id, name: file.name }]);
      try {
        // Straight to Storage with this person's session; the bucket's policies check they may.
        const { error: storageError } = await supabase.storage
          .from(FILES_BUCKET)
          .upload(storagePath(project.id, id, file.name), file, { contentType: type, upsert: false });
        if (storageError) {
          setError(`Couldn't upload “${file.name}”. Check your connection and try again.`);
          continue;
        }
        const result = await recordUpload({ projectId: project.id, fileId: id, name: file.name });
        if (!result.ok) {
          setError(result.error);
          continue;
        }
        setFiles((list) => [result.file, ...list.filter((f) => f.id !== result.file.id)]);
        toast({ tone: "success", title: `Added “${file.name}”` });
      } catch {
        setError("Couldn't reach AcademiaSync. Check your connection and try again.");
      } finally {
        setUploading((list) => list.filter((u) => u.id !== id));
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload([...e.dataTransfer.files]);
  };

  const download = async (file: ProjectFile) => {
    const result = await fileLink(file.id, true).catch(() => null);
    if (!result?.ok) return setError(result?.error ?? "Couldn't reach AcademiaSync. Check your connection and try again.");
    window.location.assign(result.url);
  };

  const attach = async (file: ProjectFile, sourceId: string | null) => {
    setBusy(file.id);
    setError(null);
    try {
      const result = await attachFile(file.id, sourceId);
      if (!result.ok) return setError(result.error);
      setFiles((list) => list.map((f) => (f.id === file.id ? result.file : f)));
      toast({ tone: "success", title: sourceId ? "Attached to the source" : "Detached from the source" });
    } catch {
      setError("Couldn't reach AcademiaSync. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (file: ProjectFile) => {
    setBusy(file.id);
    setError(null);
    try {
      const result = await deleteFile(file.id);
      if (!result.ok) return setError(result.error);
      setFiles((list) => list.filter((f) => f.id !== file.id));
      setConfirming(null);
      toast({ title: `Deleted “${file.name}”` });
    } catch {
      setError("Couldn't reach AcademiaSync. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="mx-auto max-w-4xl"
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={canEdit ? onDrop : undefined}
    >
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          {project.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <FolderOpen className="h-6 w-6 text-iris" />
          <h1 className="font-serif text-4xl font-medium tracking-tight">Files</h1>
          <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[11px] text-iris">{files.length}</span>
          {canEdit && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => input.current?.click()}
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg"
            >
              <Upload className="h-4 w-4" aria-hidden /> Upload
            </motion.button>
          )}
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            aria-label="Choose files to upload"
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-2 max-w-xl text-muted">
          Papers, drafts, data and reviewer letters, shared with everyone in the project. Open PDFs and Word files right here, and attach a paper to its source so citations can open it.
        </p>
        <div className="mt-4 max-w-xs">
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-label="Space used" aria-valuemin={0} aria-valuemax={FILE_LIMITS.projectBytes} aria-valuenow={used}>
            <motion.div className="h-full rounded-full bg-iris" initial={false} animate={{ width: `${Math.min(100, (used / FILE_LIMITS.projectBytes) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-faint">{formatBytes(used)} of {formatBytes(FILE_LIMITS.projectBytes)} used</p>
        </div>
      </motion.div>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none mt-6 grid h-32 place-items-center rounded-2xl border-2 border-dashed border-iris bg-iris-soft text-iris"
          >
            Drop to add to the project
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="mt-6 flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {uploading.map((u) => (
            <motion.li key={u.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass flex items-center gap-4 rounded-xl px-4 py-3.5">
              <Loader2 className="h-4 w-4 animate-spin text-iris" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="text-xs text-faint">Uploading…</span>
            </motion.li>
          ))}
          {files.map((f, i) => {
            const kind = fileKind(f.mime_type);
            const Icon = KIND_ICON[kind];
            const canDelete = canDeleteAll || (canEdit && f.uploaded_by === userId);
            const attached = f.source_id ? sourceById.get(f.source_id) : undefined;
            return (
              <motion.li
                key={f.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: Math.min(i, 10) * 0.03 }}
                className="glass group rounded-xl transition-colors hover:border-line-strong"
              >
                <div className="flex items-center gap-4 px-4 pt-3.5 pb-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-iris-soft text-iris transition-transform group-hover:scale-110">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${project.id}/files/${f.id}`} className="block truncate font-medium outline-none hover:text-iris focus-visible:underline">
                      {f.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-faint">
                      {KIND_NAME[kind]} · {formatBytes(f.size_bytes)} · <TimeAgo iso={f.created_at} prefix={`Added by ${names[f.uploaded_by ?? ""] ?? "a former member"} `} />
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 px-3 pb-2.5 text-sm">
                  {canEdit ? (
                    <label className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-muted">
                      <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">Attached source</span>
                      <select
                        value={f.source_id ?? ""}
                        disabled={busy === f.id}
                        onChange={(e) => void attach(f, e.target.value || null)}
                        className="max-w-64 truncate rounded-md bg-transparent py-0.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-iris"
                      >
                        <option value="">Not attached to a source</option>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>{sourceLabel(s)}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    attached && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-muted">
                        <Link2 className="h-3.5 w-3.5" aria-hidden /> {sourceLabel(attached)}
                      </span>
                    )
                  )}
                  <button onClick={() => void download(f)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink">
                    <Download className="h-3.5 w-3.5" aria-hidden /> Download
                  </button>
                  {canDelete &&
                    (confirming === f.id ? (
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        <span className="text-muted">Delete for everyone? This can&apos;t be undone.</span>
                        <button onClick={() => void remove(f)} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 font-semibold text-bg disabled:opacity-60">
                          {busy === f.id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />} Delete
                        </button>
                        <button onClick={() => setConfirming(null)} className="rounded-lg px-3 py-1.5 text-muted hover:bg-iris-soft">Keep</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirming(f.id)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                      </button>
                    ))}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {files.length === 0 && uploading.length === 0 && (
        <div className="mt-12 rounded-3xl border border-dashed border-line-strong p-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris"><FolderOpen className="h-5 w-5" /></span>
          <h2 className="mt-4 font-serif text-2xl">No files yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            {canEdit ? "Drop papers, drafts or data here, or choose them from your computer. Up to 50 MB each." : "Files your team adds will appear here."}
          </p>
          {canEdit && (
            <button onClick={() => input.current?.click()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg">
              <Upload className="h-4 w-4" aria-hidden /> Upload the first file
            </button>
          )}
        </div>
      )}
    </div>
  );
}
