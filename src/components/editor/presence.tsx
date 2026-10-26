"use client";

import { AnimatePresence, motion } from "motion/react";
import { useOthers } from "@liveblocks/react/suspense";
import { initials } from "@/components/app/accent";

/** Who else is in this manuscript right now. Two tabs of one person count once. */
export function PresenceStack() {
  const others = useOthers();
  const seen = new Set<string>();
  const people = others.flatMap((o) => {
    if (!o.id || seen.has(o.id)) return [];
    seen.add(o.id);
    return [{ id: o.id, name: o.info?.name ?? "Collaborator", avatar: o.info?.avatar, color: o.info?.color ?? "var(--iris)" }];
  });

  return (
    <div className="flex items-center" aria-live="polite">
      <div className="flex -space-x-2">
        <AnimatePresence initial={false}>
          {people.slice(0, 5).map((p) => (
            <motion.span
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.4, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.4, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              title={p.name}
              className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full text-[11px] font-semibold text-bg ring-2 ring-bg"
              style={{ background: p.color }}
            >
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                initials(p.name)
              )}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <motion.span layout className="ml-3 hidden text-sm text-muted sm:inline">
        {people.length === 0
          ? "Only you"
          : people.length === 1
            ? `${people[0].name.split(" ")[0]} is here`
            : `${people.length} others here`}
      </motion.span>
    </div>
  );
}
