"use client";

import { useActionState, useState, ViewTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, FileText, FolderOpen, Loader2, MoreHorizontal, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { createDocument, type FormState } from "@/app/(app)/projects/actions";
import { deleteDocument, deleteProject } from "@/app/(app)/projects/[projectId]/manage-actions";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { DocumentStatus, ProjectRole } from "@/lib/supabase/types";
import { Avatar } from "./app-shell";
import { accentColor } from "./accent";
import { ProjectCover } from "./project-cover";
import { TimeAgo } from "./time-ago";
import { MembersPanel, type Member, type PendingInvite } from "./members-panel";
import { ConfirmDeleteDialog, ProjectDetailsDialog } from "./project-manage";

type Props = {
  project: { id: string; name: string; field: string | null; description: string | null; accent: string };
  documents: { id: string; title: string; status: DocumentStatus; updated_at: string }[];
  members: Member[];
  invites: PendingInvite[];
  myRole: ProjectRole | null;
  /** Idempotency key for the first "add manuscript" submit. */
  requestId: string;
  /** Whether invites go out by email, or as a link to send yourself. */
  emailEnabled: boolean;
};

const STATUS: Record<DocumentStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-iris-soft text-iris" },
  in_review: { label: "In review", className: "bg-amber/15 text-amber" },
  final: { label: "Final", className: "bg-success/15 text-success" },
};

export function ProjectOverview({ project, documents, members, invites, myRole, requestId, emailEnabled }: Props) {
  const accent = accentColor(project.accent);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<{ id: string; title: string } | null>(null);
  const router = useRouter();
  const toast = useToast();
  const canManage = myRole === "owner" || myRole === "author";
  const projectActions: MenuItem[] = [
    ...(canManage ? [{ label: "Edit details", hint: "Name, field, description and colour", icon: <Pencil className="h-4 w-4" />, onSelect: () => setEditing(true) }] : []),
    ...(myRole === "owner" ? [{ label: "Delete project", hint: "Removes every manuscript and source", icon: <Trash2 className="h-4 w-4" />, onSelect: () => setDeletingProject(true) }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <ViewTransition name={`project-${project.id}`} share="morph" default="none">
      <header className="grain relative overflow-hidden rounded-3xl border border-line bg-bg-elev p-8">
        {/* The cover from the projects shelf, carried into the header. */}
        <ProjectCover
          seed={`${project.id}:${project.name}`}
          accent={accent}
          manuscripts={documents.length}
          className="absolute inset-0 [mask-image:linear-gradient(100deg,transparent_15%,black_70%)]"
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
            <button
              onClick={() => setMembersOpen(true)}
              className="ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-muted transition-colors hover:bg-iris-soft hover:text-ink"
            >
              {members.length} {members.length === 1 ? "member" : "members"}
              {(myRole === "owner" || myRole === "author") && <UserPlus className="h-3.5 w-3.5 text-iris" aria-label="Invite" />}
            </button>
            <Link
              href={`/projects/${project.id}/library`}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong"
            >
              <BookMarked className="h-4 w-4 text-iris" /> Library
            </Link>
            <Link
              href={`/projects/${project.id}/files`}
              className="ml-2 inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong"
            >
              <FolderOpen className="h-4 w-4 text-iris" /> Files
            </Link>
            {projectActions.length > 0 && (
              <Menu label="Project actions" trigger={<MoreHorizontal className="h-4 w-4" />} items={projectActions} className="ml-2" />
            )}
          </div>
        </div>
      </header>
      </ViewTransition>

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Manuscripts</h2>
          <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[11px] text-iris">{documents.length}</span>
        </div>

        <NewDocumentForm key={project.id} projectId={project.id} requestId={requestId} />

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
                className="glass group flex items-center rounded-xl transition-colors hover:border-line-strong"
              >
                <Link
                  href={`/projects/${project.id}/documents/${d.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-iris"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-iris-soft text-iris transition-transform group-hover:scale-110">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="text-xs text-faint"><TimeAgo iso={d.updated_at} prefix="Updated " /></p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[d.status].className}`}>
                    {STATUS[d.status].label}
                  </span>
                </Link>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setDeletingDoc({ id: d.id, title: d.title })}
                    aria-label={`Delete ${d.title}`}
                    title="Delete manuscript"
                    className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint transition-[color,background-color,opacity] hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        {documents.length === 0 && (
          <p className="mt-6 text-sm text-muted">No manuscripts yet. Name your first one above to start writing.</p>
        )}
      </section>
      <AnimatePresence>
        {membersOpen && (
          <MembersPanel projectId={project.id} members={members} invites={invites} myRole={myRole} emailEnabled={emailEnabled} onClose={() => setMembersOpen(false)} />
        )}
        {editing && (
          <ProjectDetailsDialog
            project={project}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              toast({ tone: "success", title: "Project details saved" });
              router.refresh();
            }}
          />
        )}
        {deletingProject && (
          <ConfirmDeleteDialog
            title="Delete this project?"
            body={<>Every manuscript, version, source and invite in <strong className="text-ink">{project.name}</strong> is deleted for all {members.length} {members.length === 1 ? "member" : "members"}. This can&apos;t be undone.</>}
            confirmLabel="Delete project"
            typeToConfirm={project.name}
            onClose={() => setDeletingProject(false)}
            onConfirm={async () => {
              const result = await deleteProject({ projectId: project.id });
              if (result.ok) {
                toast({ tone: "success", title: `Deleted ${project.name}` });
                router.push("/projects");
              }
              return result;
            }}
          />
        )}
        {deletingDoc && (
          <ConfirmDeleteDialog
            title="Delete this manuscript?"
            body={<><strong className="text-ink">{deletingDoc.title}</strong> and its version history are deleted for everyone in the project. This can&apos;t be undone.</>}
            confirmLabel="Delete manuscript"
            onClose={() => setDeletingDoc(null)}
            onConfirm={async () => {
              const result = await deleteDocument({ projectId: project.id, documentId: deletingDoc.id });
              if (result.ok) {
                setDeletingDoc(null);
                toast({ tone: "success", title: `Deleted ${deletingDoc.title}` });
                router.refresh();
              }
              return result;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NewDocumentForm({ projectId, requestId }: { projectId: string; requestId: string }) {
  // React clears the form after each submit; on failure the action echoes the
  // typed title back so it stays in the field.
  const [state, action] = useActionState<FormState, FormData>(createDocument, { requestId });

  return (
    <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="requestId" value={state.requestId ?? requestId} />
      <label htmlFor="new-doc-title" className="sr-only">New manuscript title</label>
      <input
        id="new-doc-title"
        name="title"
        defaultValue={state.values?.title}
        required
        maxLength={200}
        placeholder="Name a new manuscript, e.g. Results draft"
        className="h-11 w-full rounded-xl border border-line bg-bg-elev px-4 sm:w-auto sm:flex-1 outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]"
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
