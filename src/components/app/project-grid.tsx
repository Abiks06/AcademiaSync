"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Loader2, Plus, Users, X } from "lucide-react";
import { createProject, type FormState } from "@/app/(app)/projects/actions";
import { TiltCard } from "@/components/motion/primitives";
import { ACCENTS, accentColor, timeAgo, type Accent } from "./accent";

type ProjectCard = {
  id: string;
  name: string;
  field: string | null;
  description: string | null;
  accent: string;
  updatedAt: string;
  members: number;
  documents: number;
};

export function ProjectGrid({ projects }: { projects: ProjectCard[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-mono text-xs uppercase tracking-[0.16em] text-iris">
            Your research
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 font-serif text-4xl font-medium tracking-tight sm:text-5xl"
          >
            Projects
          </motion.h1>
        </div>
        <motion.button
          onClick={() => setCreating(true)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg"
        >
          <Plus className="h-4 w-4" /> New project
        </motion.button>
      </div>

      {projects.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <motion.ul
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {projects.map((p) => (
            <motion.li
              key={p.id}
              variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
            >
              <Link href={`/projects/${p.id}`} className="block h-full">
                <TiltCard className="glass h-full overflow-hidden rounded-2xl">
                  <div
                    className="h-24 w-full"
                    style={{
                      background: `radial-gradient(120% 140% at 0% 0%, ${accentColor(p.accent)}, transparent 60%), radial-gradient(100% 120% at 100% 100%, var(--iris-soft), transparent 70%)`,
                      opacity: 0.55,
                    }}
                  />
                  <div className="relative p-5">
                    {p.field && <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{p.field}</p>}
                    <h2 className="mt-1 text-lg font-semibold tracking-tight">{p.name}</h2>
                    {p.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{p.description}</p>}
                    <div className="mt-5 flex items-center gap-4 text-xs text-faint">
                      <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{p.documents}</span>
                      <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{p.members}</span>
                      <span className="ml-auto">Updated {timeAgo(p.updatedAt)}</span>
                    </div>
                  </div>
                </TiltCard>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <AnimatePresence>{creating && <CreateProjectDialog onClose={() => setCreating(false)} />}</AnimatePresence>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mt-16 flex flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-20 text-center"
    >
      <div className="relative mb-8 h-24 w-24" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="glass absolute inset-0 rounded-2xl"
            initial={{ rotate: 0, y: 0 }}
            animate={{ rotate: (i - 1) * 12, y: i * -6 }}
            transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 200, damping: 14 }}
          />
        ))}
        <motion.span
          className="absolute inset-0 grid place-items-center text-iris"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          <Plus className="h-8 w-8" />
        </motion.span>
      </div>
      <h2 className="font-serif text-3xl">Start your first project</h2>
      <p className="mt-2 max-w-md text-muted">
        A project holds one piece of research: its manuscripts, sources, files, tasks and the people
        writing it with you.
      </p>
      <button onClick={onCreate} className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition-transform hover:scale-105">
        Create a project
      </button>
    </motion.div>
  );
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(createProject, {});
  const [accent, setAccent] = useState<Accent>("iris");
  // One key per dialog: if the same project is submitted twice, the server returns the first one.
  const [requestId] = useState(newRequestId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-bg-elev shadow-2xl"
      >
        <motion.div
          aria-hidden
          className="absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl"
          animate={{ background: accentColor(accent), opacity: 0.35 }}
        />
        <form action={action} className="relative grid gap-5 p-6">
          <input type="hidden" name="requestId" value={state.requestId ?? requestId} />
          <div className="flex items-start">
            <h2 id="new-project-title" className="font-serif text-2xl">New research project</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Field label="Project name" htmlFor="name">
            <input id="name" name="name" defaultValue={state.values?.name} required autoFocus maxLength={120} placeholder="Coastal microplastics study" className={inputClass} />
          </Field>
          <Field label="Field" htmlFor="field" hint="Optional">
            <input id="field" name="field" defaultValue={state.values?.field} maxLength={80} placeholder="Marine biology" className={inputClass} />
          </Field>
          <Field label="What is it about?" htmlFor="description" hint="Optional">
            <textarea id="description" name="description" defaultValue={state.values?.description} rows={3} maxLength={600} className={`${inputClass} h-auto py-3`} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <div className="flex gap-2">
              {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                <label key={a} className="relative cursor-pointer">
                  <input type="radio" name="accent" value={a} checked={accent === a} onChange={() => setAccent(a)} className="peer sr-only" />
                  <span className="block h-8 w-8 rounded-full ring-offset-2 ring-offset-bg-elev peer-focus-visible:ring-2 peer-focus-visible:ring-iris" style={{ background: ACCENTS[a].color }} />
                  {accent === a && (
                    <motion.span layoutId="accent-ring" className="absolute -inset-1 rounded-full border-2 border-ink" />
                  )}
                  <span className="sr-only">{ACCENTS[a].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
          <CreateButton />
        </form>
      </motion.div>
    </motion.div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]";

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
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

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-ink font-semibold text-bg disabled:opacity-70">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? "Creating" : "Create project"}
    </button>
  );
}

function newRequestId() {
  // randomUUID only exists in secure contexts; without it the server simply skips the duplicate check.
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
}
