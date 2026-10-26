import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ProjectOverview } from "@/components/app/project-overview";

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const { supabase, user } = await getUser();

  const [{ data: project }, { data: documents }, { data: members }] = await Promise.all([
    supabase.from("projects").select("id, name, field, description, accent").eq("id", projectId).maybeSingle(),
    supabase.from("documents").select("id, title, status, updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }),
    supabase.from("project_members").select("user_id, role, profiles(full_name, avatar_url)").eq("project_id", projectId),
  ]);

  // Row-level security returns nothing for projects you aren't in, which reads as "not found".
  if (!project) notFound();

  return (
    <ProjectOverview
      project={project}
      documents={documents ?? []}
      members={(members ?? []).map((m) => {
        const profile = m.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
        return { id: m.user_id, role: m.role, name: profile?.full_name ?? "Member", avatarUrl: profile?.avatar_url ?? null, isYou: m.user_id === user?.id };
      })}
    />
  );
}
