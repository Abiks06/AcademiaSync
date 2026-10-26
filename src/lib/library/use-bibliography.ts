"use client";

import { useEffect, useState } from "react";
import { bibliography } from "@/app/(app)/projects/[projectId]/library/actions";
import type { BibliographyEntry } from "./bibliography";
import type { CitationStyle } from "./styles";

export type BibliographyState = { entries: BibliographyEntry[]; loading: boolean; error: string | null };

/**
 * The manuscript's reference list in its style, formatted on the server and refreshed a
 * moment after the citations, the style or a cited source change. `version` changes when
 * any cited source is edited.
 */
export function useBibliography(projectId: string, citedIds: string[], style: CitationStyle, version: string): BibliographyState {
  const key = `${style}|${version}|${citedIds.join(",")}`;
  const [result, setResult] = useState<{ key: string; entries: BibliographyEntry[]; error: string | null }>({ key: "", entries: [], error: null });

  useEffect(() => {
    const ids = key.split("|")[2];
    if (!ids) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const response = await bibliography({ projectId, sourceIds: ids.split(","), style });
        if (!live) return;
        setResult((prev) => (response.ok ? { key, entries: response.entries, error: null } : { ...prev, key, error: response.error }));
      } catch {
        if (live) setResult((prev) => ({ ...prev, key, error: "Couldn't reach AcademiaSync to format the references." }));
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [projectId, key, style]);

  // Keep showing the last list while a new one is on its way, so it doesn't flicker.
  if (citedIds.length === 0) return { entries: [], loading: false, error: null };
  return { entries: result.entries, loading: result.key !== key, error: result.error };
}
