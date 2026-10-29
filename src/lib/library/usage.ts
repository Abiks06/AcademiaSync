import type { getUser } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof getUser>>["supabase"];

export type LibraryUsage = {
  /** How many times each source is cited across the project's manuscripts. */
  counts: Record<string, number>;
  /** False while some manuscript nobody has opened lately hasn't been counted yet. */
  complete: boolean;
};

/** Where the project's sources are cited, from the citation index the editor keeps. */
export async function loadUsage(supabase: Client, projectId: string): Promise<LibraryUsage> {
  const { data: documents, error } = await supabase.from("documents").select("id").eq("project_id", projectId);
  if (error) throw error;
  const ids = documents.map((d) => d.id);
  const [citations, complete] = await Promise.all([
    ids.length ? supabase.from("document_citations").select("source_id, citations").in("document_id", ids) : Promise.resolve({ data: [], error: null }),
    supabase.rpc("citation_index_complete", { p_project: projectId }),
  ]);
  if (citations.error) throw citations.error;
  const counts: Record<string, number> = {};
  for (const row of citations.data ?? []) counts[row.source_id] = (counts[row.source_id] ?? 0) + row.citations;
  return { counts, complete: complete.data === true };
}
