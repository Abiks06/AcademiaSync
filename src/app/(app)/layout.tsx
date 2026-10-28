import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/app/app-shell";
import { ShellSkeleton } from "@/components/app/skeletons";
import { avatarSrc } from "@/lib/profile/avatar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/sign-in");

  const [profileResult, projectsResult] = await Promise.all([
    // "*" so the shell still loads while a new profile column is being added.
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("projects").select("id, name, accent").order("updated_at", { ascending: false }).limit(12),
  ]);
  const error = profileResult.error ?? projectsResult.error;
  if (error) throw new Error(`Couldn't load your workspace: ${error.message}`);
  const profile = profileResult.data;
  const projects = projectsResult.data;

  return (
    <AppShell
      user={{ email: user.email ?? "", name: profile?.full_name ?? user.email ?? "You", avatarUrl: avatarSrc(profile) }}
      projects={projects ?? []}
    >
      {children}
    </AppShell>
  );
}
