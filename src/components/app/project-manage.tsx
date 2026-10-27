"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Loader2, Trash2, X } from "lucide-react";
import { SPRING } from "@/components/motion/tokens";
import { Dialog } from "@/components/ui/dialog";
import { updateProjectDetails, type ManageResult } from "@/app/(app)/projects/[projectId]/manage-actions";
import { ACCENTS, accentColor, type Accent } from "./accent";

const NETWORK_ERROR = "Couldn't reach AcademiaSync. Check your connection and try again.";
const inputClass =
  "h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]";

type Details = { id: string; name: string; field: string | null; description: string | null; accent: string };

/** Rename a project and change its field, description and colour. */
export function ProjectDetailsDialog({ project, onClose, onSaved }: { project: Details; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({
    name: project.name,
    field: project.field ?? "",
    description: project.description ?? "",
    accent: (project.accent in ACCENTS ? project.accent : "iris") as Accent,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setDirty(true);
    setValues((v) => ({ ...v, [key]: value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await updateProjectDetails({ projectId: project.id, ...values });
      if (!result.ok) return setError(result.error);
      onSaved();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} labelledBy="project-details-title" dirty={dirty && !saving} className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-bg-elev shadow-2xl">
      <motion.div aria-hidden className="absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl" animate={{ background: accentColor(values.accent), opacity: 0.35 }} />
      <form onSubmit={save} className="relative grid gap-5 p-6">
        <div className="flex items-start">
          <h2 id="project-details-title" className="font-serif text-2xl">Project details</h2>
          <button type="button" aria-label="Close" onClick={onClose} disabled={saving} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Project name
          <input value={values.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} data-autofocus className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Field <span className="font-normal text-faint">· optional</span></span>
          <input value={values.field} onChange={(e) => set("field", e.target.value)} maxLength={80} placeholder="Marine biology" className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          <span>What is it about? <span className="font-normal text-faint">· optional</span></span>
          <textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={600} className={`${inputClass} h-auto py-3`} />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Colour</legend>
          <div className="flex gap-2">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => (
              <label key={a} className="relative cursor-pointer rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iris has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg-elev">
                <input type="radio" name="details-accent" value={a} checked={values.accent === a} onChange={() => set("accent", a)} className="peer sr-only" />
                <span className="block h-8 w-8 rounded-full" style={{ background: ACCENTS[a].color }} />
                {values.accent === a && <motion.span layoutId="details-accent-ring" transition={SPRING.snappy} className="absolute -inset-1 rounded-full border-2 border-ink" />}
                <span className="sr-only">{ACCENTS[a].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm text-muted hover:bg-iris-soft">Cancel</button>
          <button disabled={saving || !values.name.trim()} className="flex h-10 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-bg disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save changes
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Confirms a deletion that can't be undone. With `typeToConfirm`, the button only
 * works once that exact text is typed, for deletions that take a lot with them.
 */
export function ConfirmDeleteDialog({ title, body, confirmLabel, typeToConfirm, onConfirm, onClose }: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  typeToConfirm?: string;
  onConfirm: () => Promise<ManageResult>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (!result.ok) setError(result.error);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onClose={busy ? () => {} : onClose} labelledBy="confirm-delete-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-bg-elev shadow-2xl">
      <form onSubmit={run} className="grid gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
            <Trash2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-delete-title" className="font-serif text-2xl">{title}</h2>
            <div className="mt-1 text-sm text-muted">{body}</div>
          </div>
        </div>
        {typeToConfirm && (
          <label className="grid gap-1.5 text-sm">
            <span>Type <strong className="font-semibold text-ink">{typeToConfirm}</strong> to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} data-autofocus autoComplete="off" className={inputClass} />
          </label>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} data-autofocus={typeToConfirm ? undefined : true} className="h-10 rounded-xl px-4 text-sm text-muted hover:bg-iris-soft">Cancel</button>
          <button disabled={!ready || busy} className="flex h-10 items-center gap-2 rounded-xl bg-danger px-5 text-sm font-semibold text-bg disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
