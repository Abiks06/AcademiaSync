"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Calls `onChange` when anyone adds, edits or deletes a source in this project, and when the
 * tab comes back after a while or the network returns (a change may have been missed).
 * Row-level security decides which changes this browser hears about.
 */
export function useLibrarySync(projectId: string, onChange: () => void) {
  useProjectTableSync("sources", projectId, onChange);
}

/** The same for any project table that is in the realtime publication, e.g. project_files. */
export function useProjectTableSync(table: "sources" | "project_files", projectId: string, onChange: () => void) {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several changes in a burst (an import, say) become one refresh.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 300);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`${table}:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `project_id=eq.${projectId}` }, refresh)
      .subscribe();

    // Coming back after a while catches up on anything missed; a quick glance away doesn't.
    let hiddenSince = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince = Date.now();
        return;
      }
      if (hiddenSince && Date.now() - hiddenSince > 60_000) refresh();
      hiddenSince = 0;
    };
    document.addEventListener("visibilitychange", onVisible);
    // Realtime can drop while a laptop sleeps; reconnecting the network also catches up.
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [table, projectId]);
}
