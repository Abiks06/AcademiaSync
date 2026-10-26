"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Calls `onChange` when anyone adds, edits or deletes a source in this project, and when the
 * tab comes back into view (in case a change arrived while the connection was asleep).
 * Row-level security decides which changes this browser hears about.
 */
export function useLibrarySync(projectId: string, onChange: () => void) {
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
      .channel(`sources:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sources", filter: `project_id=eq.${projectId}` }, refresh)
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [projectId]);
}
