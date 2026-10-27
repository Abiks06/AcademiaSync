"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStatus, useSyncStatus } from "@liveblocks/react/suspense";

type State = "saved" | "saving" | "offline";

/** "Saved" only when the server has every change; says so plainly when it doesn't. */
export function useSaveState(): State {
  const connection = useStatus();
  const sync = useSyncStatus({ smooth: true });
  if (connection === "reconnecting" || connection === "disconnected") return "offline";
  return sync === "synchronizing" ? "saving" : "saved";
}

const COPY: Record<State, { label: string; color: string }> = {
  saved: { label: "All changes saved", color: "var(--success)" },
  saving: { label: "Saving…", color: "var(--amber)" },
  offline: { label: "Offline. Edits sync when you reconnect", color: "var(--danger)" },
};

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const state = useSaveState();
  // Screen readers hear about going offline and coming back, not every keystroke's save.
  const [announce, setAnnounce] = useState("");
  const [last, setLast] = useState(state);
  if (state !== last) {
    setLast(state);
    if (state === "offline") setAnnounce(COPY.offline.label);
    else if (last === "offline") setAnnounce("Back online. Your changes are syncing.");
  }

  // Closing the tab with unsynced edits is the one way to lose work, so warn.
  useEffect(() => {
    if (state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const { label, color } = COPY[state];
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3 py-1.5 text-xs text-muted" title={label}>
      <span role="status" className="sr-only">{announce}</span>
      <span className="relative grid h-2 w-2 place-items-center">
        <motion.span
          className="absolute h-2 w-2 rounded-full"
          style={{ background: color }}
          animate={state === "saved" ? { opacity: 1, scale: 1 } : { opacity: [1, 0.35, 1], scale: [1, 1.5, 1] }}
          transition={state === "saved" ? { duration: 0.3 } : { duration: 1.2, repeat: Infinity }}
        />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={compact ? "sr-only sm:not-sr-only" : "hidden sm:inline"}
        >
          {compact && state === "saved" ? "Saved" : label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
