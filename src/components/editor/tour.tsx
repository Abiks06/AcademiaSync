"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { EXIT, SPRING } from "@/components/motion/tokens";
import { useModKey } from "@/components/app/command-palette";

type Step = { target?: string; title: string; body: (mod: string) => string };

const STEPS: Step[] = [
  {
    target: '[data-tour="page"]',
    title: "Write together",
    body: () => "Everyone in the project sees changes as they're typed, with each person's cursor in their own colour. Type / at the start of a line for headings, lists and quotes.",
  },
  {
    target: ".manuscript-prose .citation:not(.citation-pending)",
    title: "Every citation knows its paper",
    body: () => "Hover over a citation to see the paper, its abstract and the team's notes on it, with links to the library and the paper itself.",
  },
  {
    target: '[data-tour="cite"]',
    title: "Cite while you write",
    body: (mod) => `Press Cite, type [@, or use ${mod}+Shift+K. Or paste a DOI, arXiv or PubMed link straight into the text and it turns into a citation.`,
  },
  {
    target: '[data-tour="presence"]',
    title: "See who's here",
    body: () => "Collaborators appear here and in the page margin beside the paragraph they're in. Click one to follow them through the manuscript.",
  },
  {
    target: '[data-tour="references"]',
    title: "The reference list builds itself",
    body: () => "Every source you cite is listed in the style you pick, and the list updates as you write. Change the style under the title.",
  },
  {
    target: '[data-tour="history"]',
    title: "Nothing is ever lost",
    body: () => "Versions are saved as you work. Name one before sending it to a supervisor, compare any two, or restore an old one.",
  },
  {
    title: "Jump anywhere",
    body: (mod) => `Press ${mod}+K from any page to open a project, manuscript or source, or to run a command like this tour.`,
  },
];

const PAD = 8;
const DONE_KEY = "academiasync:tour-done";

export function markTourDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Storage blocked; the tour simply may be offered again.
  }
}

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

/**
 * A short guided tour of the editor. A spotlight glides from one part of the page to the
 * next, dimming everything else, with a card explaining each part. Steps whose part isn't
 * on screen (on a phone, say) are skipped.
 */
export function Tour({ onClose }: { onClose: () => void }) {
  const mod = useModKey();
  const reduce = useReducedMotion();
  const [steps] = useState(() => STEPS.filter((s) => !s.target || visible(document.querySelector(s.target))));
  const [index, setIndex] = useState(0);
  // 1 going forward, -1 going back: the step's text slides in from that side.
  const [dir, setDir] = useState(1);
  const go = useCallback(
    (to: number) => {
      const target = Math.max(0, Math.min(to, steps.length - 1));
      if (target === index) return;
      setDir(target > index ? 1 : -1);
      setIndex(target);
    },
    [index, steps.length],
  );
  const [rect, setRect] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];

  const finish = useCallback(() => {
    markTourDone();
    onClose();
  }, [onClose]);

  useLayoutEffect(() => {
    const el = step.target ? document.querySelector(step.target) : null;
    if (!visible(el)) {
      const frame = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(frame);
    }
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: reduce ? "auto" : "smooth" });
    }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [step, reduce]);

  useEffect(() => next.current?.focus({ preventScroll: true }), [index]);
  // Focus goes back where it was (the editor, the palette's caller) when the tour ends.
  useEffect(() => {
    const before = document.activeElement;
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  // ⌘K opens the palette over the tour, so the tour gets out of the way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") finish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [finish]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      finish();
    } else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Tab") {
      // Keep Tab inside the card while the rest of the page is dimmed.
      const focusable = [...(cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // The spotlight: a hole the size of the part being explained. A huge shadow around it dims the rest.
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const hole = rect
    ? {
        left: Math.max(4, rect.left - PAD),
        top: Math.max(4, rect.top - PAD),
        width: Math.min(rect.width + PAD * 2, vw - 8),
        height: Math.min(rect.height + PAD * 2, vh - 8),
      }
    : { left: vw / 2, top: vh / 2, width: 0, height: 0 };

  // The card sits under the spotlight if there's room, otherwise above it, otherwise in the middle.
  const cardW = Math.min(360, vw - 24);
  const cardH = 210;
  const below = hole.top + hole.height + 14;
  const above = hole.top - 14 - cardH;
  const cardTop = !rect ? vh / 2 - cardH / 2 : below + cardH < vh - 12 ? below : above > 12 ? above : Math.max(12, vh - cardH - 24);
  const cardLeft = !rect ? vw / 2 - cardW / 2 : Math.max(12, Math.min(hole.left + hole.width / 2 - cardW / 2, vw - cardW - 12));

  // The dimmed page is cut away around the spotlight with a clip path that glides from one
  // part to the next. Cheaper to draw than a shadow the size of the screen.
  const holeLeft = useSpring(hole.left, SPRING.gentle);
  const holeTop = useSpring(hole.top, SPRING.gentle);
  const holeWidth = useSpring(hole.width, SPRING.gentle);
  const holeHeight = useSpring(hole.height, SPRING.gentle);
  useEffect(() => {
    const pairs = [
      [holeLeft, hole.left],
      [holeTop, hole.top],
      [holeWidth, hole.width],
      [holeHeight, hole.height],
    ] as const;
    for (const [value, to] of pairs) {
      if (reduce) value.jump(to);
      else value.set(to);
    }
  }, [hole.left, hole.top, hole.width, hole.height, reduce, holeLeft, holeTop, holeWidth, holeHeight]);
  const clipPath = useTransform([holeLeft, holeTop, holeWidth, holeHeight], ([l, t, w, h]: number[]) => {
    const r = Math.min(16, w / 2, h / 2);
    const R = l + w;
    const B = t + h;
    const outer = `M0 0H${vw}V${vh}H0Z`;
    const inner = `M${l + r} ${t}H${R - r}A${r} ${r} 0 0 1 ${R} ${t + r}V${B - r}A${r} ${r} 0 0 1 ${R - r} ${B}H${l + r}A${r} ${r} 0 0 1 ${l} ${B - r}V${t + r}A${r} ${r} 0 0 1 ${l + r} ${t}Z`;
    return `path(evenodd, "${outer} ${inner}")`;
  });

  // The card's height glides as steps with more or less to say come and go.
  const text = useRef<HTMLDivElement>(null);
  const [textHeight, setTextHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = text.current;
    if (!el) return;
    const measure = () => setTextHeight(el.offsetHeight);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[55]" aria-live="polite">
      {/* Clicks outside the card do nothing, so a stray click can't skip the tour. */}
      <div className="absolute inset-0" />
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" style={{ clipPath }} />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-2xl"
        style={{
          left: holeLeft,
          top: holeTop,
          width: holeWidth,
          height: holeHeight,
          boxShadow: "0 0 0 2px var(--iris), 0 0 40px 4px color-mix(in oklab, var(--iris) 35%, transparent)",
        }}
      />
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        data-palette-over
        onKeyDown={onKeyDown}
        aria-labelledby="tour-title"
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, left: cardLeft, top: cardTop }}
        transition={SPRING.smooth}
        className="absolute grid gap-3 rounded-2xl border border-line-strong bg-panel-solid p-5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]"
        style={{ width: cardW }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iris">
            {index + 1} of {steps.length}
          </span>
          <button onClick={finish} aria-label="End the tour" className="ml-auto rounded-full p-1 text-faint transition-colors hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <motion.div initial={false} animate={{ height: textHeight ?? "auto" }} transition={SPRING.gentle} className="relative overflow-hidden">
          <div ref={text}>
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div
                key={index}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: d * 12 }),
                  shown: { opacity: 1, x: 0 },
                  leave: (d: number) => ({ opacity: 0, x: d * -12, transition: EXIT }),
                }}
                initial="enter"
                animate="shown"
                exit="leave"
                transition={SPRING.snappy}
                className="grid gap-1.5"
              >
                <h2 id="tour-title" className="font-serif text-xl">{step.title}</h2>
                <p className="text-sm leading-relaxed text-muted">{step.body(mod)}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <motion.span key={i} animate={{ width: i === index ? 18 : 6, opacity: i === index ? 1 : 0.4 }} transition={SPRING.snappy} className="h-1.5 rounded-full bg-iris" />
            ))}
          </div>
          {index > 0 && (
            <button onClick={() => go(index - 1)} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          <button
            ref={next}
            onClick={() => (index === steps.length - 1 ? finish() : go(index + 1))}
            className={`${index > 0 ? "" : "ml-auto"} inline-flex items-center gap-1 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-bg`}
          >
            {index === steps.length - 1 ? "Start writing" : "Next"} {index < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
