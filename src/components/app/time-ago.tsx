"use client";

import { useSyncExternalStore } from "react";
import { timeAgo } from "./accent";

// One shared clock that ticks every minute while anything is listening.
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  if (!now) now = Date.now();
  return now;
}

/**
 * "Updated 3 minutes ago", computed only in the browser. Reading the clock while the
 * server renders breaks prerendering and would mismatch on hydration anyway.
 */
export function TimeAgo({ iso, prefix }: { iso: string; prefix?: string }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return (
    <time dateTime={iso} className="transition-opacity duration-300" style={{ opacity: current ? 1 : 0 }}>
      {prefix}
      {current ? timeAgo(iso, current) : "recently"}
    </time>
  );
}
