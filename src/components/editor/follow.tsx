"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Eye, X } from "lucide-react";
import { shallow, useOthers, useSelf, useUpdateMyPresence } from "@liveblocks/react/suspense";
import type { Editor } from "@tiptap/react";
import { initials } from "@/components/app/accent";
import { EXIT, SPRING } from "@/components/motion/tokens";
import { useToast } from "@/components/ui/toast";

type FollowCtx = { following: string | null; follow: (userId: string | null) => void };
export const FollowContext = createContext<FollowCtx>({ following: null, follow: () => {} });
export const useFollow = () => useContext(FollowContext);

/** How long someone can drop off (a flaky connection, a reload) before following them stops. */
const GONE_GRACE_MS = 2500;

/** Marks the controls that start and stop following, so pressing one isn't taken as "stop". */
export const FOLLOW_CONTROL = "data-follow-control";

/** How far below the top of the window the sticky editor bar ends; "what's on screen" starts there. */
function readingLine() {
  return window.innerWidth >= 1024 ? 88 : 132;
}

/** The DOM of the manuscript's top-level block number `index`. */
function blockElement(editor: Editor, index: number) {
  const { doc } = editor.state;
  if (index < 0 || index >= doc.childCount) return null;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  const el = editor.view.nodeDOM(pos);
  return el instanceof HTMLElement ? el : null;
}

/** The block at the reading line, and how far through it the line falls (0 to 1). */
function topVisible(editor: Editor) {
  const line = readingLine();
  const { doc } = editor.state;
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const el = editor.view.nodeDOM(pos);
    pos += doc.child(i).nodeSize;
    if (!(el instanceof HTMLElement)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > line) return { block: i, offset: r.height ? Math.min(1, Math.max(0, (line - r.top) / r.height)) : 0 };
  }
  return doc.childCount ? { block: doc.childCount - 1, offset: 1 } : undefined;
}

/**
 * Shares where this person is in the manuscript: the block their cursor is in (for the
 * margin markers) and what they're looking at (for anyone following them). Positions are
 * in blocks, not pixels, so they mean the same on every screen size.
 */
export function usePositionBroadcast(editor: Editor | null) {
  const update = useUpdateMyPresence();
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = "";
    let block: number | undefined;
    const send = () => {
      timer = undefined;
      if (editor.isDestroyed) return;
      // Only a cursor someone has placed counts; an untouched editor's sits at the start.
      if (editor.isFocused) block = editor.state.selection.$head.index(0);
      const view = topVisible(editor);
      const key = `${block}:${view?.block}:${view?.offset.toFixed(2)}`;
      if (key === last) return;
      last = key;
      update({ block, view });
    };
    const schedule = () => {
      timer ??= setTimeout(send, 120);
    };
    send();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    editor.on("selectionUpdate", schedule);
    editor.on("update", schedule);
    editor.on("focus", schedule);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      editor.off("selectionUpdate", schedule);
      editor.off("update", schedule);
      editor.off("focus", schedule);
    };
  }, [editor, update]);
}

type Person = { id: string; name: string; avatar?: string; color: string; block?: number };

/** Everyone else here, one entry per person, with the connection they last typed in. */
function usePeople(): Person[] {
  const selfId = useSelf((me) => me.id);
  return useOthers((others) => {
    const byId = new Map<string, { person: Person; typedAt: number }>();
    for (const o of others) {
      if (!o.id || o.id === selfId) continue;
      const typedAt = o.presence.typingAt ?? 0;
      const known = byId.get(o.id);
      if (known && known.typedAt >= typedAt && known.person.block !== undefined) continue;
      byId.set(o.id, {
        typedAt,
        person: { id: o.id, name: o.info?.name ?? "Collaborator", avatar: o.info?.avatar, color: o.info?.color ?? "var(--iris)", block: o.presence.block ?? known?.person.block },
      });
    }
    return [...byId.values()].map((v) => v.person);
  }, (a, b) => a.length === b.length && a.every((p, i) => shallow(p, b[i])));
}

/**
 * While following someone, this tab scrolls to whatever they're looking at. Scrolling,
 * clicking, typing or pressing Escape yourself stops it, and so does them leaving (after a
 * moment's grace, in case they're only reconnecting).
 */
export function useFollowScroll(editor: Editor | null) {
  const { following, follow } = useFollow();
  const toast = useToast();
  const reduce = useReducedMotion();
  const target = useOthers((others) => {
    if (!following) return null;
    const theirs = others.filter((o) => o.id === following);
    if (theirs.length === 0) return "gone";
    const view = theirs.map((o) => o.presence.view).find(Boolean);
    return view ? `${view.block}:${view.offset}` : "";
  });
  const name = useOthers((others) => others.find((o) => o.id === following)?.info?.name ?? "They");
  const lastName = useRef(name);
  useEffect(() => {
    if (name !== "They") lastName.current = name;
  }, [name]);

  // Where the window should be scrolled to. One animation frame loop eases towards it, so a
  // stream of updates reads as one glide instead of a smooth scroll restarted every 120 ms.
  const goal = useRef<number | null>(null);

  useEffect(() => {
    if (!editor || !following || target === null) return;
    if (target === "gone") {
      const timer = setTimeout(() => {
        follow(null);
        toast({ title: `${lastName.current.split(" ")[0]} left the manuscript`, description: "You've stopped following." });
      }, GONE_GRACE_MS);
      return () => clearTimeout(timer);
    }
    if (!target) return;
    const [block, offset] = target.split(":").map(Number);
    const el = blockElement(editor, block);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const top = Math.max(0, Math.min(max, window.scrollY + r.top + offset * r.height - readingLine()));
    if (reduce) window.scrollTo({ top, behavior: "auto" });
    else goal.current = top;
  }, [editor, following, target, follow, toast, reduce]);

  useEffect(() => {
    if (!following || reduce) return;
    let frame = requestAnimationFrame(function step() {
      const to = goal.current;
      if (to !== null) {
        const gap = to - window.scrollY;
        if (Math.abs(gap) < 1) {
          window.scrollTo(0, to);
          goal.current = null;
        } else window.scrollTo(0, window.scrollY + Math.sign(gap) * Math.max(1, Math.abs(gap) * 0.18));
      }
      frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      goal.current = null;
    };
  }, [following, reduce]);

  useEffect(() => {
    if (!following) return;
    const stop = () => follow(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || !["Shift", "Control", "Alt", "Meta"].includes(e.key)) stop();
    };
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest(`[${FOLLOW_CONTROL}]`))) stop();
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [following, follow]);
}

/** A frame in the followed person's colour around the window, and a pill saying who you're following. */
export function FollowBanner() {
  const { following, follow } = useFollow();
  const person = useOthers((others) => {
    const o = others.find((x) => x.id === following);
    return o ? { name: o.info?.name ?? "Collaborator", color: o.info?.color ?? "var(--iris)" } : null;
  }, shallow);
  return (
    <AnimatePresence>
      {following && person && (
        <>
          <motion.div
            key="frame"
            aria-hidden
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: EXIT }}
            transition={SPRING.smooth}
            className="pointer-events-none fixed inset-0 z-40 rounded-[18px]"
            style={{ boxShadow: `inset 0 0 0 3px ${person.color}, inset 0 0 60px -20px ${person.color}` }}
          />
          <motion.div
            key="pill"
            role="status"
            {...{ [FOLLOW_CONTROL]: "" }}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, transition: EXIT }}
            transition={SPRING.smooth}
            className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-strong bg-panel-solid/95 py-1.5 pr-1.5 pl-3.5 text-sm shadow-2xl backdrop-blur-xl"
          >
            <Eye className="h-4 w-4" style={{ color: person.color }} aria-hidden />
            <span>
              Following <b className="font-semibold">{person.name.split(" ")[0]}</b>
            </span>
            <span className="hidden text-xs text-faint sm:inline">Scroll or press Esc to stop</span>
            <button onClick={() => follow(null)} aria-label="Stop following" className="ml-1 rounded-full p-1.5 text-muted transition-colors hover:bg-iris-soft hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * A small avatar in the page margin beside the paragraph each collaborator is in. It
 * glides as they move; clicking it follows them.
 */
export function MarginPresence({ editor, container }: { editor: Editor | null; container: RefObject<HTMLElement | null> }) {
  const people = usePeople().filter((p) => p.block !== undefined);
  const { following, follow } = useFollow();
  const [tops, setTops] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => t + 1);
    editor.on("update", bump);
    window.addEventListener("resize", bump);
    return () => {
      editor.off("update", bump);
      window.removeEventListener("resize", bump);
    };
  }, [editor]);

  const key = people.map((p) => `${p.id}:${p.block}`).join();
  useLayoutEffect(() => {
    if (!editor || !container.current || editor.isDestroyed) return;
    const base = container.current.getBoundingClientRect().top;
    const next: Record<string, number> = {};
    for (const p of people) {
      const el = blockElement(editor, p.block!);
      if (el) next[p.id] = el.getBoundingClientRect().top - base;
    }
    const frame = requestAnimationFrame(() => setTops(next));
    return () => cancelAnimationFrame(frame);
    // `people` is summed up by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, container, key, tick]);

  const narrow = useNarrow();
  const { shown, extra } = layoutMargin(people, tops, following);
  // Side by side in the wide margin; one above the other in a phone's narrow one.
  const offset = (slot: number) => (narrow ? { x: 0, y: slot * 14 } : { x: slot * 14, y: 0 });
  return (
    <div aria-label="Where collaborators are" className="pointer-events-none absolute inset-y-0 left-0 w-6 sm:w-14">
      <AnimatePresence>
        {shown.map(({ person: p, top, slot }) => {
          const followed = following === p.id;
          const at = offset(slot);
          return (
            <motion.button
              key={p.id}
              type="button"
              {...{ [FOLLOW_CONTROL]: "" }}
              onClick={() => follow(followed ? null : p.id)}
              aria-pressed={followed}
              aria-label={followed ? `Stop following ${p.name}` : `${p.name} is here. Follow them`}
              title={followed ? `Following ${p.name}` : `${p.name} is here. Click to follow`}
              initial={{ opacity: 0, scale: 0.4, x: at.x, y: top + 4 + at.y }}
              animate={{ opacity: 1, scale: 1, x: at.x, y: top + 4 + at.y }}
              exit={{ opacity: 0, scale: 0.4, transition: EXIT }}
              transition={SPRING.gentle}
              className="pointer-events-auto absolute top-0 left-[clamp(1px,1.2vw,1.25rem)] grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-full text-[9px] font-semibold text-bg shadow-md transition-[box-shadow] hover:brightness-110"
              style={{ background: p.color, boxShadow: followed ? `0 0 0 2px var(--panel-solid), 0 0 0 4px ${p.color}` : undefined }}
            >
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                initials(p.name)
              )}
            </motion.button>
          );
        })}
        {extra.map(({ top, names }) => {
          const at = offset(MAX_PER_BLOCK);
          return (
            <motion.span
              key={`more-${top}`}
              role="img"
              aria-label={`Also here: ${names.join(", ")}`}
              title={`Also here: ${names.join(", ")}`}
              initial={{ opacity: 0, scale: 0.4, x: at.x, y: top + 4 + at.y }}
              animate={{ opacity: 1, scale: 1, x: at.x, y: top + 4 + at.y }}
              exit={{ opacity: 0, scale: 0.4, transition: EXIT }}
              transition={SPRING.gentle}
              className="pointer-events-auto absolute top-0 left-[clamp(1px,1.2vw,1.25rem)] grid h-[22px] min-w-[22px] place-items-center rounded-full border border-line-strong bg-panel-solid px-1 text-[9px] font-semibold text-muted shadow-md"
            >
              +{names.length}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** At most this many avatars beside one paragraph; the rest fold into a "+N". */
const MAX_PER_BLOCK = 2;

/** Who goes where in the margin: each person's slot beside their paragraph, and the overflow. */
function layoutMargin(people: Person[], tops: Record<string, number>, following: string | null) {
  const byTop = new Map<number, Person[]>();
  for (const p of people) {
    const top = tops[p.id];
    if (top === undefined) continue;
    const key = Math.round(top);
    byTop.set(key, [...(byTop.get(key) ?? []), p]);
  }
  const shown: { person: Person; top: number; slot: number }[] = [];
  const extra: { top: number; names: string[] }[] = [];
  for (const [top, all] of byTop) {
    // When some fold away, the one being followed always stays visible.
    const here = [...all].sort((a, b) => Number(b.id === following) - Number(a.id === following));
    const fits = here.length > MAX_PER_BLOCK ? MAX_PER_BLOCK - 1 : MAX_PER_BLOCK;
    here.slice(0, fits).forEach((person, slot) => shown.push({ person, top, slot }));
    if (here.length > fits) extra.push({ top, names: here.slice(fits).map((p) => p.name) });
  }
  return { shown, extra };
}

const narrowQuery = "(max-width: 639px)";
function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
/** Whether the page is phone-width, where the margin is too narrow for avatars side by side. */
function useNarrow() {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);
}
