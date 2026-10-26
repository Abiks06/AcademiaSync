import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { isLiveblocksConfigured } from "@/lib/liveblocks/server";
import { canEditRole } from "@/lib/liveblocks/rooms";
import { DocumentWorkspace } from "@/components/editor/document-workspace";

export const metadata: Metadata = { title: "Manuscript" };

export default async function DocumentPage({ params }: PageProps<"/projects/[projectId]/documents/[documentId]">) {
  const { projectId, documentId } = await params;
  const ids = z.string().uuid();
  if (!ids.safeParse(projectId).success || !ids.safeParse(documentId).success) notFound();

  const { supabase, user } = await getUser();
  if (!user) notFound(); // the proxy already redirects signed-out visitors

  const [documentResult, projectResult, membershipResult] = await Promise.all([
    supabase.from("documents").select("id, project_id, title, status").eq("id", documentId).maybeSingle(),
    supabase.from("projects").select("id, name, accent").eq("id", projectId).maybeSingle(),
    supabase.from("project_members").select("role").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
  ]);
  const error = documentResult.error ?? projectResult.error ?? membershipResult.error;
  if (error) throw new Error(`Couldn't load this manuscript: ${error.message}`);

  const document = documentResult.data;
  const project = projectResult.data;
  const membership = membershipResult.data;
  // Row-level security hides anything outside the user's projects, which reads as "not found".
  // A document reached through the wrong project in the URL is also not found.
  if (!document || !project || !membership || document.project_id !== project.id) notFound();

  return (
    <DocumentWorkspace
      document={{ id: document.id, title: document.title, status: document.status }}
      project={project}
      canEdit={canEditRole(membership.role)}
      liveReady={isLiveblocksConfigured()}
    />
  );
}
