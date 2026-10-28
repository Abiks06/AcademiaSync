import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ProfileEditor } from "@/components/account/profile-editor";
import { getUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-redirect";
import { loadOwnProfile } from "@/lib/profile/load";
import { skipWelcome } from "@/lib/profile/actions";
import { userColor } from "@/lib/liveblocks/rooms";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

/** The first screen after signing up: set the byline co-authors will see. */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <main className="desk grain relative min-h-dvh overflow-hidden px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[44rem] bg-[radial-gradient(ellipse_55%_60%_at_50%_10%,var(--lamp),transparent_72%)]" />
      <div className="relative mx-auto max-w-2xl">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          AcademiaSync
        </div>
        <Suspense fallback={<div className="shimmer mt-24 h-[36rem] rounded-md bg-line/40" aria-busy="true" />}>
          <Welcome searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Welcome({ searchParams }: Pick<PageProps<"/welcome">, "searchParams">) {
  const [{ supabase, user }, params] = await Promise.all([getUser(), searchParams]);
  const next = safeNext(params.next);
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/welcome${next === "/projects" ? "" : `?next=${encodeURIComponent(next)}`}`)}`);
  const profile = await loadOwnProfile(supabase, user);

  return (
    <>
      <header className="mt-14 mb-10 text-center sm:mt-20">
        <p className="rise font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Welcome to AcademiaSync</p>
        <h1 className="rise mt-3 font-serif text-[clamp(2.2rem,5vw,3.4rem)] leading-[1.05] font-medium tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
          First, your title page
        </h1>
        <p className="rise mx-auto mt-4 max-w-md text-muted" style={{ "--i": 2 } as React.CSSProperties}>
          This is how co-authors will meet you: on bylines, beside your edits, at the top of your comments. Only the name is needed.
        </p>
      </header>
      <ProfileEditor
        userId={user.id}
        defaults={profile.defaults}
        email={user.email ?? ""}
        avatarUrl={profile.avatarUrl}
        color={userColor(user.id)}
        mode="welcome"
        next={next}
      />
      <form action={skipWelcome} className="mt-4 pb-16">
        <input type="hidden" name="next" value={next} />
        <button className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Skip for now</button>
      </form>
    </>
  );
}
