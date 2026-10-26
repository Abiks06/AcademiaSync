"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Loader2, Plus } from "lucide-react";
import { createDocument, type FormState } from "@/app/(app)/projects/actions";
import type { DocumentStatus, ProjectRole } from "@/lib/supabase/types";
import { Avatar } from "./app-shell";
import { accentColor, timeAgo } from "./accent";

type Props = {
  project: { id: string; name: string; field: string | null; description: string | null; accent: string };
  documents: { id: string; title: string; status: DocumentStatus; updated_at: string }[];
  members: { id: string; role: ProjectRole; name: string; avatarUrl: string | null; isYou: boolean }[];
};

const STATUS: Record<DocumentStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-iris-soft text-iris" },
  in_review: { label: "In review", className: "bg-amber/15 text-amber" },
  final: { label: "Final", className: "bg-success/15 text-success" },
};

export function ProjectOverview({ project, documents, members }: Props) {
  const accent = accentColor(project.accent);

  return (
    <div className="mx-auto max-w-5xl">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="grain relative overflow-hidden rounded-3xl border border-line bg-bg-elev p-8"
      >
        <motion.div
          aria-hidden
          className="absolute -top-32 -left-20 h-72 w-72 rounded-full blur-3xl"
          style={{ background: accent }}
          animate={{ opacity: [0.25, 0.4, 0.25], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <div className="relative">
          {project.field && <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{project.field}</p>}
          <h1 className="mt-1 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{project.name}</h1>
          {project.description && <p className="mt-3 max-w-2xl text-muted">{project.description}</p>}
          <div className="mt-6 flex items-center">
            <div className="flex -space-x-2">
              {members.slice(0, 6).map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 400, damping: 18 }}
                  className="rounded-full ring-2 ring-bg-elev"
                  title={`${m.name}${m.isYou ? " (you)" : ""} · ${m.role}`}
                >
                  <Avatar name={m.name} url={m.avatarUrl} size={30} />
                </motion.div>
              ))}
            </div>
            <span className="ml-3 text-sm text-muted">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
      </motion.header>

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Manuscripts</h2>
          <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[11px] text-iris">{documents.length}</span>
        </div>

        <NewDocumentForm projectId={project.id} />

        <motion.ul layout className="mt-4 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {documents.map((d, i) => (
              <motion.li
                key={d.id}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: i * 0.03 }}
                className="glass group flex items-center gap-4 rounded-xl px-4 py-3.5 transition-colors hover:border-line-strong"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-iris-soft text-iris transition-transform group-hover:scale-110">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="text-xs text-faint">Updated {timeAgo(d.updated_at)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[d.status].className}`}>
                  {STATUS[d.status].label}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        {documents.length === 0 && (
          <p className="mt-6 text-sm text-muted">No manuscripts yet. Name your first one above to start writing.</p>
        )}
      </section>
    </div>
  );
}

function NewDocumentForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<FormState, FormData>(createDocument, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor="doc-title" className="sr-only">New manuscript title</label>
      <input
        id="doc-title"
        name="title"
        required
        maxLength={200}
        placeholder="Name a new manuscript, e.g. Results draft"
        className="h-11 flex-1 rounded-xl border border-line bg-bg-elev px-4 outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]"
      />
      <AddButton />
      {state.error && <p role="alert" className="text-sm text-danger sm:basis-full">{state.error}</p>}
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={pending}
      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-bg disabled:opacity-70"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Add manuscript
    </motion.button>
  );
}
