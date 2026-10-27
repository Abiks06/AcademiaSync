"use server";

import { actionUser } from "@/lib/supabase/action-user";
import { sanitizeAuthors } from "@/lib/library/authors";

export type PaletteIndex = {
  projects: { id: string; name: string; accent: string; field: string | null }[];
  documents: { id: string; title: string; projectId: string; updatedAt: string }[];
  sources: { id: string; title: string; projectId: string; byline: string }[];
};

export type PaletteIndexResult = { ok: true; index: PaletteIndex } | { ok: false; error: string };

/**
 * Everything the ⌘K palette can jump to: the person's projects, manuscripts and sources.
 * Row-level security limits it to projects they belong to.
 */
export async function paletteIndex(): Promise<PaletteIndexResult> {
  const auth = await actionUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const [projects, documents, sources] = await Promise.all([
    supabase.from("projects").select("id, name, accent, field").order("updated_at", { ascending: false }).limit(200),
    supabase.from("documents").select("id, title, project_id, updated_at").order("updated_at", { ascending: false }).limit(400),
    supabase
      .from("sources")
      .select("id, title, authors, year, project_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(600),
  ]);
  const error = projects.error ?? documents.error ?? sources.error;
  if (error) return { ok: false, error: "Couldn't load your projects for search. Try again." };

  return {
    ok: true,
    index: {
      projects: projects.data ?? [],
      documents: (documents.data ?? []).map((d) => ({ id: d.id, title: d.title, projectId: d.project_id, updatedAt: d.updated_at })),
      sources: (sources.data ?? []).map((s) => {
        const authors = sanitizeAuthors(s.authors);
        const lead = authors[0]?.family ?? "";
        const names = authors.length > 2 ? `${lead} et al.` : authors.map((a) => a.family).join(" & ");
        return { id: s.id, title: s.title, projectId: s.project_id, byline: [names, s.year].filter(Boolean).join(", ") };
      }),
    },
  };
}
