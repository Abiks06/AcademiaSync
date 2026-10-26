import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

const ROLE_LABEL: Record<string, string> = {
  author: "an author",
  contributor: "a contributor",
  commenter: "a commenter",
  reviewer: "a reviewer",
};

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2 font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          AcademiaSync
        </Link>
        <Suspense fallback={<div className="shimmer h-64 rounded-3xl bg-line/60" aria-busy="true" />}>
          <Invite params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Invite({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: rows }, { data: auth }] = await Promise.all([
    supabase.rpc("invite_preview", { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const invite = rows?.[0];

  if (!invite || invite.state !== "open") {
    const title = !invite ? "This invite link doesn't work" : invite.state === "used" ? "This invite was already used" : "This invite has expired";
    return (
      <Card>
        <h1 className="font-serif text-3xl">{title}</h1>
        <p className="mt-3 text-muted">Ask whoever invited you to send a new link from the project&apos;s Members panel.</p>
        <Link href="/projects" className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">Go to your projects</Link>
      </Card>
    );
  }

  const next = `/invite/${token}`;
  return (
    <Card>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">You&apos;re invited</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight">{invite.project_name}</h1>
      <p className="mt-3 text-muted">
        {invite.inviter_name} invited you to join as {ROLE_LABEL[invite.role] ?? invite.role}. The invite was sent to{" "}
        <span className="font-medium text-ink">{invite.email_hint}</span>.
      </p>
      {auth.user ? (
        <AcceptInviteForm token={token} email={auth.user.email ?? ""} />
      ) : (
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-ink text-sm font-semibold text-bg"
        >
          Sign in with that address to join
        </Link>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="glass rounded-3xl p-8 text-center">{children}</div>;
}
