import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { ProjectOverview } from "@/components/app/project-overview";
import { isEmailConfigured } from "@/lib/email/resend";

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  // Anything that isn't a UUID can't be a project; Postgres would reject it with an error instead.
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const { supabase, user } = await getUser();

  const [projectResult, documentsResult, membersResult, invitesResult] = await Promise.all([
    supabase.from("projects").select("id, name, field, description, accent").eq("id", projectId).maybeSingle(),
    supabase.from("documents").select("id, title, status, updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }),
    supabase.from("project_members").select("user_id, role, profiles(full_name, avatar_url)").eq("project_id", projectId),
    // Row-level security shows open invites to owners and authors only; everyone else gets none.
    supabase
      .from("project_invites")
      .select("id, email, role, expires_at, token")
      .eq("project_id", projectId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  const error = projectResult.error ?? documentsResult.error ?? membersResult.error ?? invitesResult.error;
  if (error) throw new Error(`Couldn't load this project: ${error.message}`);
  const project = projectResult.data;
  const documents = documentsResult.data;
  const members = membersResult.data;

  // Row-level security returns nothing for projects you aren't in, which reads as "not found".
  if (!project) notFound();

  return (
    <ProjectOverview
      project={project}
      requestId={randomUUID()}
      emailEnabled={isEmailConfigured()}
      documents={documents ?? []}
      invites={invitesResult.data ?? []}
      myRole={members?.find((m) => m.user_id === user?.id)?.role ?? null}
      members={(members ?? []).map((m) => {
        const profile = m.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
        return { id: m.user_id, role: m.role, name: profile?.full_name ?? "Member", avatarUrl: profile?.avatar_url ?? null, isYou: m.user_id === user?.id };
      })}
    />
  );
}
