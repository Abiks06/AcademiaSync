"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, KeyRound, Loader2, LogOut, Mail, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { TimeAgo } from "@/components/app/time-ago";
import { SPRING } from "@/components/motion/tokens";
import { deleteAccount, deletionPreview, signOutEverywhere, type DeletionPreview } from "@/lib/profile/actions";

const METHOD_LABEL: Record<string, string> = { email: "Email link or code", google: "Google", azure: "Microsoft" };

/** How this person signs in, signing out everywhere, and leaving for good. */
export function AccountSection({ email, methods, lastSignIn }: { email: string; methods: string[]; lastSignIn: string | null }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <section aria-labelledby="account-heading" className="grid gap-6">
      <h2 id="account-heading" className="font-serif text-2xl">
        Signing in
      </h2>
      <div className="divide-y divide-line rounded-2xl border border-line bg-bg-elev/60">
        <Row icon={<Mail className="h-4 w-4" />} title="Email address" detail={email} />
        <Row
          icon={<KeyRound className="h-4 w-4" />}
          title="Ways to sign in"
          detail={methods.map((m) => METHOD_LABEL[m] ?? m).join(" · ")}
          note="There's no password to leak: each sign-in uses a one-time link or code."
        />
        <Row
          icon={<LogOut className="h-4 w-4" />}
          title="Sign out everywhere"
          detail={lastSignIn ? <TimeAgo iso={lastSignIn} prefix="Last signed in " /> : "Signed in on this device"}
          note="Ends every session on every device, this one included. Use it after signing in on a shared computer."
          action={
            <form action={signOutEverywhere}>
              <PendingButton className="border border-line hover:border-line-strong">Sign out everywhere</PendingButton>
            </form>
          }
        />
      </div>

      <h2 className="mt-6 font-serif text-2xl">Leaving</h2>
      <div className="rounded-2xl border border-danger/25 bg-danger/[0.04] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-medium">Delete your account</p>
            <p className="mt-1 text-sm text-muted">
              Your profile and the projects only you are in are deleted for good. In shared projects your writing stays, without your name on it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-danger/40 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete account
          </button>
        </div>
      </div>

      <AnimatePresence>{deleting && <DeleteDialog email={email} onClose={() => setDeleting(false)} />}</AnimatePresence>
    </section>
  );
}

function Row({ icon, title, detail, note, action }: { icon: React.ReactNode; title: string; detail: React.ReactNode; note?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-iris-soft text-iris" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-sm text-muted">{detail}</p>
        {note && <p className="mt-1 text-xs text-faint">{note}</p>}
      </div>
      {action}
    </div>
  );
}

function PendingButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <button onClick={() => setClicked(true)} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors ${className}`}>
      {clicked && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const OUTCOME = {
  deleted: { label: "Deleted with your account", tone: "text-danger" },
  blocks: { label: "Make someone else an owner first", tone: "text-amber" },
  leaves: { label: "You leave; it carries on", tone: "text-muted" },
} as const;

function DeleteDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [projects, setProjects] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    deletionPreview().then(
      (r) => live && (r.ok ? setProjects(r.projects) : setError(r.error)),
      () => live && setError("Check your connection and try again."),
    );
    return () => {
      live = false;
    };
  }, []);
  const blocked = projects?.some((p) => p.outcome === "blocks") ?? false;
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <Dialog onClose={onClose} labelledBy="delete-title" dirty={typed.length > 0} className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel-solid p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger/10 text-danger" aria-hidden>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h2 id="delete-title" className="font-serif text-2xl">
          Delete your account?
        </h2>
      </div>
      <p className="mt-3 text-sm text-muted">This can&apos;t be undone. Here is what happens to each of your projects:</p>

      <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-line">
        {!projects && !error && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your projects
          </p>
        )}
        {projects?.length === 0 && <p className="p-4 text-sm text-muted">You&apos;re not in any projects.</p>}
        <ul className="divide-y divide-line">
          {projects?.map((p, i) => (
            <motion.li
              key={p.project_id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING.gentle, delay: i * 0.04 }}
            >
              <span className="truncate">{p.project_name}</span>
              <span className={`shrink-0 text-xs ${OUTCOME[p.outcome].tone}`}>{OUTCOME[p.outcome].label}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      {blocked ? (
        <p className="mt-4 text-sm text-amber">You&apos;re the only owner of a shared project. Open its Members panel and make a co-author an owner, then come back.</p>
      ) : (
        <label className="mt-5 block text-sm">
          Type <span className="font-medium text-ink">{email}</span> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 h-11 w-full rounded-xl border border-line bg-bg-elev px-3 outline-none focus:border-danger focus:shadow-[0_0_0_4px_rgb(255_123_123/0.15)]"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:text-ink">
          Keep my account
        </button>
        <button
          type="button"
          disabled={!matches || blocked || pending || !projects}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await deleteAccount(typed).catch(() => ({ ok: false as const, error: "Check your connection and try again." }));
              if (result && !result.ok) setError(result.error);
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Delete for good
        </button>
      </div>
    </Dialog>
  );
}
