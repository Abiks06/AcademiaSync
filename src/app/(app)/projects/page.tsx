import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { ProjectGrid } from "@/components/app/project-grid";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { supabase } = await getUser();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, field, description, accent, updated_at, project_members(count), documents(count)")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Couldn't load your projects: ${error.message}`);

  return (
    <ProjectGrid
      projects={(projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        field: p.field,
        description: p.description,
        accent: p.accent,
        updatedAt: p.updated_at,
        members: (p.project_members as unknown as { count: number }[])[0]?.count ?? 1,
        documents: (p.documents as unknown as { count: number }[])[0]?.count ?? 0,
      }))}
    />
  );
}
