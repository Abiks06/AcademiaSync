"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, LogOut, Mail, UserMinus, Users, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import type { ProjectRole } from "@/lib/supabase/types";
import { changeRole, inviteMember, removeMember, revokeInvite } from "@/app/(app)/projects/[projectId]/members/actions";
import { Avatar } from "./app-shell";

export type Member = { id: string; role: ProjectRole; name: string; avatarUrl: string | null; isYou: boolean };
export type PendingInvite = { id: string; email: string; role: ProjectRole; expires_at: string; token: string };

type Props = {
  projectId: string;
  members: Member[];
  /** Open invites; only owners and authors can see them. */
  invites: PendingInvite[];
  myRole: ProjectRole | null;
  onClose: () => void;
};

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  author: "Author",
  contributor: "Contributor",
  commenter: "Commenter",
  reviewer: "Reviewer",
};
const ROLE_HINT: Record<string, string> = {
  owner: "Everything, including roles and deleting the project",
  author: "Writes, invites people and manages the library",
  contributor: "Writes and cites",
  commenter: "Reads and comments",
};
const INVITABLE = ["author", "contributor", "commenter"] as const;
const NETWORK_ERROR = "Couldn't reach AcademiaSync. Check your connection and try again.";

/** Who is in the project, who is invited, and (for owners) who can do what. */
export function MembersPanel({ projectId, members, invites, myRole, onClose }: Props) {
  const router = useRouter();
  const canInvite = myRole === "owner" || myRole === "author";
  const isOwner = myRole === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITABLE)[number]>("contributor");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; link?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<{ ok: boolean; error?: string }>, done?: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) return setMessage({ kind: "error", text: result.error ?? "That didn't work." });
      if (done) setMessage({ kind: "ok", text: done });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: NETWORK_ERROR });
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("invite");
    setMessage(null);
    try {
      const result = await inviteMember({ projectId, email, role });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      setEmail("");
      setMessage(
        result.emailed
          ? { kind: "ok", text: `Invite sent to ${email.trim().toLowerCase()}.`, link: result.link }
          : { kind: "ok", text: `${result.emailError ?? "Email isn't set up yet."} Send this link yourself; it works for 14 days, for that address only.`, link: result.link },
      );
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: NETWORK_ERROR });
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setMessage({ kind: "error", text: "Your browser blocked copying. Select the link and copy it by hand." });
    }
  };

  const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

  return (
    <Dialog onClose={onClose} label="Members" variant="sheet" className="flex h-dvh w-full max-w-md flex-col border-l border-line bg-bg-elev shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <Users className="h-4 w-4 text-iris" aria-hidden />
        <h2 className="font-serif text-xl">Members</h2>
        <button aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
          <X className="h-4 w-4" />
        </button>
      </div>

      {canInvite && (
        <form onSubmit={invite} className="grid gap-2 border-b border-line p-5">
          <label htmlFor="invite-email" className="text-sm font-medium">Invite someone</label>
          <div className="flex gap-2">
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
              data-autofocus
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-iris"
            />
            <label htmlFor="invite-role" className="sr-only">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof INVITABLE)[number])}
              className="h-10 rounded-xl border border-line bg-bg px-2 text-sm outline-none focus:border-iris"
            >
              {INVITABLE.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-faint">{ROLE_HINT[role]}.</p>
          <button
            disabled={busy !== null || !email.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-bg disabled:opacity-60"
          >
            {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />} Send invite
          </button>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {message && (
          <div role={message.kind === "error" ? "alert" : "status"} className={`mb-4 text-sm ${message.kind === "error" ? "text-danger" : "text-success"}`}>
            <p>{message.text}</p>
            {message.link && (
              <button onClick={() => void copy(message.link!)} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left font-mono text-xs text-muted hover:border-line-strong">
                <span className="min-w-0 flex-1 truncate">{message.link}</span>
                {copied === message.link ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        )}

        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg/60 px-3 py-2.5">
              <Avatar name={m.name} url={m.avatarUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.name}
                  {m.isYou && <span className="text-faint"> (you)</span>}
                </span>
                {isOwner && !m.isYou ? (
                  <>
                    <label htmlFor={`role-${m.id}`} className="sr-only">Role for {m.name}</label>
                    <select
                      id={`role-${m.id}`}
                      value={m.role}
                      disabled={busy !== null}
                      onChange={(e) => void run(`role-${m.id}`, () => changeRole({ projectId, userId: m.id, role: e.target.value }), `${m.name} is now ${ROLE_LABEL[e.target.value as ProjectRole].toLowerCase()}.`)}
                      className="mt-0.5 rounded-md border border-line bg-bg px-1.5 py-0.5 text-xs text-muted outline-none focus:border-iris"
                    >
                      {(["owner", ...INVITABLE] as ProjectRole[]).concat(m.role === "reviewer" ? ["reviewer"] : []).map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="block text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                )}
              </span>
              {m.isYou ? (
                <button
                  onClick={() => void run("leave", async () => {
                    const result = await removeMember({ projectId, userId: m.id });
                    if (result.ok) router.push("/projects");
                    return result;
                  })}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <LogOut className="h-3.5 w-3.5" /> Leave
                </button>
              ) : (
                isOwner && (
                  <button
                    onClick={() => void run(`remove-${m.id}`, () => removeMember({ projectId, userId: m.id }), `${m.name} was removed. Their open editors were closed.`)}
                    disabled={busy !== null}
                    aria-label={`Remove ${m.name}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    {busy === `remove-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>

        {invites.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-xs font-medium uppercase tracking-wider text-faint">Invited</h3>
            <ul className="space-y-2">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{i.email}</span>
                    <span className="block text-xs text-faint">
                      {ROLE_LABEL[i.role]} · link works until {new Date(i.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <button onClick={() => void copy(inviteUrl(i.token))} aria-label={`Copy invite link for ${i.email}`} className="rounded-lg p-1.5 text-muted hover:bg-iris-soft">
                    {copied === inviteUrl(i.token) ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => void run(`revoke-${i.id}`, () => revokeInvite({ projectId, inviteId: i.id }), `The invite to ${i.email} no longer works.`)}
                    disabled={busy !== null}
                    aria-label={`Revoke invite for ${i.email}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
