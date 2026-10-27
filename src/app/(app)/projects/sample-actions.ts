"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/supabase/action-user";
import { seedDocument } from "@/lib/documents/live-document";
import { SAMPLE_DOCUMENT_TITLE, SAMPLE_PROJECT, SAMPLE_SOURCES, sampleManuscript } from "@/lib/sample/sample-project";

export type SampleResult = { ok: true; href: string } | { ok: false; error: string };

/**
 * Creates the sample project for the signed-in person: a project they own, its library of
 * five real papers, and a short manuscript citing them, then opens it with the tour.
 */
export async function createSampleProject(): Promise<SampleResult> {
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const project = await supabase
    .from("projects")
    .insert({ ...SAMPLE_PROJECT, created_by: user.id })
    .select("id")
    .single();
  if (project.error) return { ok: false, error: "Couldn't create the sample project. Try again in a moment." };
  const projectId = project.data.id;

  const keys = Object.keys(SAMPLE_SOURCES) as (keyof typeof SAMPLE_SOURCES)[];
  const sources = await supabase
    .from("sources")
    .insert(keys.map((k) => ({ ...SAMPLE_SOURCES[k], project_id: projectId, created_by: user.id })))
    .select("id, doi");
  const document = await supabase
    .from("documents")
    .insert({ project_id: projectId, title: SAMPLE_DOCUMENT_TITLE, created_by: user.id })
    .select("id")
    .single();
  if (sources.error || document.error) {
    // Half a sample is worse than none.
    await supabase.from("projects").delete().eq("id", projectId);
    return { ok: false, error: "Couldn't fill in the sample project. Try again in a moment." };
  }

  const byDoi = new Map(sources.data.map((s) => [s.doi, s.id]));
  const ids = Object.fromEntries(keys.map((k) => [k, byDoi.get(SAMPLE_SOURCES[k].doi) ?? ""])) as Record<(typeof keys)[number], string>;
  // Without the text the project is still a fine place to start, so this never fails the action.
  await seedDocument(document.data.id, supabase, sampleManuscript(ids), "Sample draft", user.id).catch((error) =>
    console.error("[sample] couldn't write the sample manuscript", error),
  );

  revalidatePath("/projects");
  return { ok: true, href: `/projects/${projectId}/documents/${document.data.id}?tour=1` };
}
