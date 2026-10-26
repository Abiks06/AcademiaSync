"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { History, Loader2, RotateCcw, Save, X } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { TimeAgo } from "@/components/app/time-ago";
import {
  getVersionContent,
  listVersions,
  saveVersion,
  type VersionRow,
} from "@/app/(app)/projects/[projectId]/documents/[documentId]/actions";

type Props = {
  open: boolean;
  onClose: () => void;
  documentId: string;
  editor: Editor | null;
  canEdit: boolean;
};

/** Snapshots of the manuscript: name one now, or restore an earlier one into the live document. */
export function VersionsPanel({ open, onClose, documentId, editor, canEdit }: Props) {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  // Bumping this reloads the list after a save or restore.
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listVersions(documentId).then((result) => {
      if (cancelled) return;
      if (result.error) setMessage({ kind: "error", text: result.error });
      setVersions(result.versions);
    });
    return () => {
      cancelled = true;
    };
  }, [open, documentId, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const snapshot = async (name: string, auto = false) => {
    if (!editor) return { ok: false as const, error: "The editor isn't ready yet." };
    return saveVersion({ documentId, label: name, content: editor.getJSON(), plainText: editor.getText(), auto });
  };

  const onSave = async () => {
    setBusy("save");
    setMessage(null);
    const result = await snapshot(label || "Saved version");
    setBusy(null);
    if (!result.ok) return setMessage({ kind: "error", text: result.error });
    setLabel("");
    setMessage({ kind: "ok", text: "Version saved." });
    refresh();
  };

  const onRestore = async (version: VersionRow) => {
    if (!editor) return;
    setBusy(version.id);
    setMessage(null);
    const loaded = await getVersionContent(version.id);
    if (loaded.error || !loaded.content) {
      setBusy(null);
      return setMessage({ kind: "error", text: loaded.error ?? "That version is empty." });
    }
    // Keep what's there now, so a restore can always be undone.
    const backup = await snapshot("Before restoring an earlier version");
    if (!backup.ok) {
      setBusy(null);
      return setMessage({ kind: "error", text: `Restore cancelled, couldn't back up the current text: ${backup.error}` });
    }
    editor.commands.setContent(loaded.content as Parameters<typeof editor.commands.setContent>[0]);
    setBusy(null);
    setConfirming(null);
    setMessage({ kind: "ok", text: "Restored. Everyone in the document sees the change." });
    refresh();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Version history"
            className="fixed top-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col border-l border-line bg-bg-elev shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <History className="h-4 w-4 text-iris" />
              <h2 className="font-serif text-xl">Version history</h2>
              <button aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
                <X className="h-4 w-4" />
              </button>
            </div>

            {canEdit && (
              <div className="border-b border-line p-5">
                <label htmlFor="version-label" className="text-sm font-medium">Save a named version</label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="version-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void onSave()}
                    maxLength={120}
                    placeholder="e.g. Sent to advisor"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-iris"
                  />
                  <button
                    onClick={() => void onSave()}
                    disabled={busy !== null || !editor}
                    className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-60"
                  >
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                </div>
                <p className="mt-2 text-xs text-faint">Snapshots are also taken automatically while you write.</p>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <AnimatePresence>
                {message && (
                  <motion.p
                    role={message.kind === "error" ? "alert" : "status"}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`mb-3 text-sm ${message.kind === "error" ? "text-danger" : "text-success"}`}
                  >
                    {message.text}
                  </motion.p>
                )}
              </AnimatePresence>

              {versions === null ? (
                <div className="space-y-3" aria-busy="true">
                  {[0, 1, 2].map((i) => <div key={i} className="shimmer h-20 rounded-xl bg-line/50" />)}
                </div>
              ) : versions.length === 0 ? (
                <p className="text-sm text-muted">No versions yet. Save one above, or keep writing and one appears on its own.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-line pl-5">
                  {versions.map((v, i) => (
                    <motion.li
                      key={v.id}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i, 8) * 0.04 }}
                      className="relative rounded-xl border border-line bg-bg/60 p-3.5"
                    >
                      <span className="absolute top-5 -left-[26px] h-2.5 w-2.5 rounded-full border-2 border-iris bg-bg-elev" />
                      <p className="text-sm font-medium">{v.label ?? "Autosave"}</p>
                      <p className="text-xs text-faint">
                        {v.author} · <TimeAgo iso={v.created_at} />
                      </p>
                      {v.preview && <p className="mt-2 line-clamp-2 text-xs text-muted">{v.preview}</p>}
                      {canEdit && (
                        <div className="mt-3">
                          {confirming === v.id ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-muted">Replace the current text for everyone?</span>
                              <button
                                onClick={() => void onRestore(v)}
                                disabled={busy !== null}
                                className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-bg disabled:opacity-60"
                              >
                                {busy === v.id ? "Restoring…" : "Restore"}
                              </button>
                              <button onClick={() => setConfirming(null)} className="rounded-lg px-3 py-1.5 text-muted hover:bg-iris-soft">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirming(v.id)}
                              className="inline-flex items-center gap-1.5 text-xs text-iris underline-offset-4 hover:underline"
                            >
                              <RotateCcw className="h-3 w-3" /> Restore this version
                            </button>
                          )}
                        </div>
                      )}
                    </motion.li>
                  ))}
                </ol>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
