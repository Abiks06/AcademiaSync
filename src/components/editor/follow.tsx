"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
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
 * typing or pressing Escape yourself stops it, and so does them leaving.
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

  useEffect(() => {
    if (!editor || !following || target === null) return;
    if (target === "gone") {
      follow(null);
      toast({ title: `${lastName.current.split(" ")[0]} left the manuscript`, description: "You've stopped following." });
      return;
    }
    if (!target) return;
    const [block, offset] = target.split(":").map(Number);
    const el = blockElement(editor, block);
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + offset * r.height - readingLine(), behavior: reduce ? "auto" : "smooth" });
  }, [editor, following, target, follow, toast, reduce]);

  useEffect(() => {
    if (!following) return;
    const stop = () => follow(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || !["Shift", "Control", "Alt", "Meta"].includes(e.key)) stop();
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
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

  const seen = new Map<number, number>();
  return (
    <div aria-label="Where collaborators are" className="pointer-events-none absolute inset-y-0 left-0 w-6 sm:w-14">
      <AnimatePresence>
        {people.map((p) => {
          const top = tops[p.id];
          if (top === undefined) return null;
          // Two people in one paragraph sit side by side.
          const slot = seen.get(Math.round(top)) ?? 0;
          seen.set(Math.round(top), slot + 1);
          const followed = following === p.id;
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => follow(followed ? null : p.id)}
              aria-pressed={followed}
              aria-label={followed ? `Stop following ${p.name}` : `${p.name} is here. Follow them`}
              title={followed ? `Following ${p.name}` : `${p.name} is here. Click to follow`}
              initial={{ opacity: 0, scale: 0.4, top: top + 4 }}
              animate={{ opacity: 1, scale: 1, top: top + 4 }}
              exit={{ opacity: 0, scale: 0.4, transition: EXIT }}
              transition={SPRING.gentle}
              className="pointer-events-auto absolute grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-full text-[9px] font-semibold text-bg shadow-md transition-transform hover:scale-110"
              style={{ left: `calc(${slot * 14}px + clamp(1px, 1.2vw, 1.25rem))`, background: p.color, boxShadow: followed ? `0 0 0 2px var(--panel-solid), 0 0 0 4px ${p.color}` : undefined }}
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
      </AnimatePresence>
    </div>
  );
}
