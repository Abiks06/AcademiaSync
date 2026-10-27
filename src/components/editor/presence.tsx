"use client";

import { AnimatePresence, motion } from "motion/react";
import { useOthers, useSelf } from "@liveblocks/react/suspense";
import { initials } from "@/components/app/accent";
import { SPRING } from "@/components/motion/tokens";
import { FOLLOW_CONTROL, useFollow } from "./follow";

const SHOWN = 5;

/**
 * Who else is in this manuscript right now. Two tabs of one person count once, and your own
 * other tabs not at all. Clicking someone follows them through the manuscript.
 */
export function PresenceStack({ compact = false }: { compact?: boolean }) {
  const others = useOthers();
  const { following, follow } = useFollow();
  const selfId = useSelf((me) => me.id);
  const seen = new Map<string, { id: string; name: string; avatar?: string; color: string; typingAt: number }>();
  for (const o of others) {
    if (!o.id || o.id === selfId) continue;
    const typingAt = o.presence.typingAt ?? 0;
    const known = seen.get(o.id);
    if (known) known.typingAt = Math.max(known.typingAt, typingAt);
    else seen.set(o.id, { id: o.id, name: o.info?.name ?? "Collaborator", avatar: o.info?.avatar, color: o.info?.color ?? "var(--iris)", typingAt });
  }
  const people = [...seen.values()];
  const summary =
    people.length === 0 ? "Only you" : people.length === 1 ? `${people[0].name.split(" ")[0]} is here` : `${people.length} others here`;

  return (
    <div className="flex items-center" role="group" aria-label={people.length ? `Here now: ${people.map((p) => p.name).join(", ")}` : "Only you are here"}>
      <div className="flex -space-x-2">
        <AnimatePresence initial={false}>
          {people.slice(0, SHOWN).map((p) => (
            <motion.button
              key={p.id}
              type="button"
              {...{ [FOLLOW_CONTROL]: "" }}
              layout
              initial={{ opacity: 0, scale: 0.4, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.4, y: 8 }}
              whileHover={{ y: -2 }}
              transition={SPRING.pop}
              onClick={(e) => follow(following === p.id ? null : p.id, e.currentTarget)}
              aria-pressed={following === p.id}
              aria-label={following === p.id ? `Stop following ${p.name}` : `Follow ${p.name}`}
              title={following === p.id ? `Following ${p.name}. Click to stop` : `${p.name}. Click to follow`}
              className="relative grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-bg ring-2 ring-bg"
              style={{ background: p.color, zIndex: following === p.id ? 1 : undefined }}
            >
              {/* A ring in their colour draws around whoever you're following. */}
              {following === p.id && (
                <motion.span
                  layoutId="follow-ring"
                  aria-hidden
                  className="pointer-events-none absolute -inset-[5px] rounded-full"
                  style={{ boxShadow: `0 0 0 2px ${p.color}` }}
                  transition={SPRING.snappy}
                />
              )}
              {/* A ring ripples out each time this person types. */}
              {p.typingAt > 0 && (
                <motion.span
                  key={p.typingAt}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{ boxShadow: `0 0 0 2px ${p.color}` }}
                  initial={{ opacity: 0.9, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.6 }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              )}
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full">
                {p.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  initials(p.name)
                )}
              </span>
            </motion.button>
          ))}
          {people.length > SHOWN && (
            <motion.span
              key="more"
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="relative grid h-8 w-8 place-items-center rounded-full bg-bg-elev text-[11px] font-semibold text-muted ring-2 ring-bg"
            >
              +{people.length - SHOWN}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {!compact && (
        <motion.span layout className="ml-3 hidden text-sm text-muted lg:inline">
          {summary}
        </motion.span>
      )}
    </div>
  );
}
