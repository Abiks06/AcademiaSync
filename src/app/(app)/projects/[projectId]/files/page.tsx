import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { canEditRole } from "@/lib/liveblocks/rooms";
import { sanitizeAuthors } from "@/lib/library/authors";
import { FILE_COLUMNS, type ProjectFile } from "@/lib/files/files";
import { FilesView } from "@/components/files/files-view";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage({ params }: PageProps<"/projects/[projectId]/files">) {
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();

  const { supabase, user } = await getUser();
  if (!user) notFound(); // the proxy already redirects signed-out visitors

  const [projectResult, membersResult, filesResult, sourcesResult] = await Promise.all([
    supabase.from("projects").select("id, name, accent").eq("id", projectId).maybeSingle(),
    supabase.from("project_members").select("user_id, role, profiles(full_name)").eq("project_id", projectId),
    supabase.from("project_files").select(FILE_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("sources").select("id, title, authors, year").eq("project_id", projectId).is("deleted_at", null).order("title"),
  ]);
  const error = projectResult.error ?? membersResult.error ?? filesResult.error ?? sourcesResult.error;
  if (error) throw new Error(`Couldn't load the files: ${error.message}`);

  const project = projectResult.data;
  const me = membersResult.data?.find((m) => m.user_id === user.id);
  // Row-level security hides other people's projects, which reads as "not found".
  if (!project || !me) notFound();

  const names = Object.fromEntries(
    (membersResult.data ?? []).map((m) => [m.user_id, m.user_id === user.id ? "you" : ((m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "A member")]),
  );

  return (
    <FilesView
      project={project}
      initialFiles={(filesResult.data ?? []) as ProjectFile[]}
      sources={(sourcesResult.data ?? []).map((s) => ({ ...s, authors: sanitizeAuthors(s.authors) }))}
      names={names}
      userId={user.id}
      canEdit={canEditRole(me.role)}
      canDeleteAll={me.role === "owner" || me.role === "author"}
    />
  );
}
