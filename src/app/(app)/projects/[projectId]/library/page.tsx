import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { canEditRole } from "@/lib/liveblocks/rooms";
import { LibraryView } from "@/components/library/library-view";
import type { Source } from "@/lib/library/types";
import { sanitizeAuthors } from "@/lib/library/authors";
import { loadUsage } from "@/lib/library/usage";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({ params, searchParams }: PageProps<"/projects/[projectId]/library">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const focus = typeof query.source === "string" && z.string().uuid().safeParse(query.source).success ? query.source : undefined;
  if (!z.string().uuid().safeParse(projectId).success) notFound();

  const { supabase, user } = await getUser();
  if (!user) notFound(); // the proxy already redirects signed-out visitors

  const [projectResult, membershipResult, sourcesResult, usage] = await Promise.all([
    supabase.from("projects").select("id, name, accent").eq("id", projectId).maybeSingle(),
    supabase.from("project_members").select("role").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("sources")
      .select("id, project_id, kind, title, authors, year, container, volume, issue, pages, publisher, doi, url, abstract, notes, created_by, created_at, updated_at, deleted_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    // The library still opens if this fails; it just can't group by use.
    loadUsage(supabase, projectId).catch(() => null),
  ]);
  const error = projectResult.error ?? membershipResult.error ?? sourcesResult.error;
  if (error) throw new Error(`Couldn't load the library: ${error.message}`);

  const project = projectResult.data;
  const membership = membershipResult.data;
  // Row-level security hides other people's projects, which reads as "not found".
  if (!project || !membership) notFound();

  const rows = sourcesResult.data ?? [];
  const createdBy = Object.fromEntries(rows.map((r) => [r.id, r.created_by]));
  const sources: Source[] = rows.map((r) => ({
    id: r.id, project_id: r.project_id, kind: r.kind, title: r.title, authors: sanitizeAuthors(r.authors), year: r.year,
    container: r.container, volume: r.volume, issue: r.issue, pages: r.pages, publisher: r.publisher,
    doi: r.doi, url: r.url, abstract: r.abstract, notes: r.notes, created_at: r.created_at,
    updated_at: r.updated_at, deleted_at: r.deleted_at,
  }));

  return (
    <LibraryView
      project={project}
      initialSources={sources}
      canEdit={canEditRole(membership.role)}
      canDeleteAll={membership.role === "owner" || membership.role === "author"}
      userId={user.id}
      createdBy={createdBy}
      focusId={focus}
      initialUsage={usage}
    />
  );
}
