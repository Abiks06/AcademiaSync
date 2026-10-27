"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { SPRING } from "@/components/motion/tokens";
import { useModKey } from "@/components/app/command-palette";

type Step = { target?: string; title: string; body: (mod: string) => string };

const STEPS: Step[] = [
  {
    target: '[data-tour="page"]',
    title: "Write together",
    body: () => "Everyone in the project sees changes as they're typed, with each person's cursor in their own colour. Type / at the start of a line for headings, lists and quotes.",
  },
  {
    target: ".manuscript-prose .citation",
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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, steps.length]);

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

  return createPortal(
    <div className="fixed inset-0 z-[55]" aria-live="polite">
      {/* Clicks outside the card do nothing, so a stray click can't skip the tour. */}
      <div className="absolute inset-0" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-2xl"
        initial={false}
        animate={{ ...hole, opacity: 1 }}
        transition={SPRING.gentle}
        style={{ boxShadow: "0 0 0 200vmax rgb(4 6 20 / 0.62), 0 0 0 2px var(--iris), 0 0 40px 4px rgb(139 149 255 / 0.35)" }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
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
        <motion.div key={index} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={SPRING.snappy} className="grid gap-1.5">
          <h2 id="tour-title" className="font-serif text-xl">{step.title}</h2>
          <p className="text-sm leading-relaxed text-muted">{step.body(mod)}</p>
        </motion.div>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <motion.span key={i} animate={{ width: i === index ? 18 : 6, opacity: i === index ? 1 : 0.4 }} transition={SPRING.snappy} className="h-1.5 rounded-full bg-iris" />
            ))}
          </div>
          {index > 0 && (
            <button onClick={() => setIndex(index - 1)} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          <button
            ref={next}
            onClick={() => (index === steps.length - 1 ? finish() : setIndex(index + 1))}
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
