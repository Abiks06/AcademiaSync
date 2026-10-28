"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT, EXIT, MOTION } from "@/components/motion/tokens";
import { play } from "@/lib/sound";
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

function savedLabel(at: number | null, now: number) {
  if (at === null) return COPY.saved.label;
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "Saved just now";
  if (s < 60) return `Saved ${Math.floor(s / 5) * 5}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `Saved ${m} min ago` : "All changes saved";
}

/** The indicator itself: a turning arc while saving, which closes into a tick once saved. */
function Mark({ state, color }: { state: State; color: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative grid h-3.5 w-3.5 place-items-center" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        {state === "saving" && (
          <motion.svg
            key="arc"
            viewBox="0 0 14 14"
            className="absolute h-3.5 w-3.5"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, rotate: reduce ? 0 : 360 }}
            exit={{ opacity: 0, scale: 0.6, transition: EXIT }}
            transition={{ rotate: { duration: 0.9, ease: "linear", repeat: Infinity }, default: { duration: MOTION.quick } }}
          >
            <circle cx="7" cy="7" r="5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="20 32" />
          </motion.svg>
        )}
        {state === "saved" && (
          <motion.svg key="tick" viewBox="0 0 14 14" className="absolute h-3.5 w-3.5" exit={{ opacity: 0, transition: EXIT }}>
            <motion.path
              d="M3.2 7.4 L5.9 10 L10.8 4.4"
              fill="none"
              stroke={color}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : MOTION.draw, ease: EASE_OUT }}
            />
          </motion.svg>
        )}
        {state === "offline" && (
          <motion.span
            key="dot"
            className="absolute h-2 w-2 rounded-full"
            style={{ background: color }}
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
            exit={{ opacity: 0, transition: EXIT }}
            transition={reduce ? undefined : { duration: 1.6, repeat: Infinity }}
          />
        )}
      </AnimatePresence>
    </span>
  );
}

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

  // When the last save landed, so the label can say how long ago.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const previous = useRef(state);
  const lastTap = useRef(0);
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (state !== "saved" || was === "saved") return;
    const frame = requestAnimationFrame(() => {
      const t = Date.now();
      setSavedAt(t);
      setNow(t);
      // A paper tap, if sounds are on; never more than one every few seconds of typing.
      if (t - lastTap.current > 8000) {
        lastTap.current = t;
        play("tap");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);
  useEffect(() => {
    if (savedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [savedAt]);

  // Closing the tab with unsynced edits is the one way to lose work, so warn.
  useEffect(() => {
    if (state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const { color } = COPY[state];
  const label = state === "saved" ? savedLabel(savedAt, now) : COPY[state].label;
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3 py-1.5 text-xs text-muted" title={label}>
      <span role="status" className="sr-only">{announce}</span>
      <Mark state={state} color={color} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={`tabular-nums ${compact ? "sr-only sm:not-sr-only" : "hidden sm:inline"}`}
        >
          {compact && state === "saved" ? "Saved" : label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
