"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Check, MessageSquareText, Sparkles } from "lucide-react";

const SENTENCE_A =
  "Particle counts at urban sites were consistently higher than at rural sites";
const SENTENCE_B = "Polymer identity was confirmed with FTIR on a 20% subsample.";

type Phase = "typingA" | "cite" | "typingB" | "flag" | "resolve" | "hold";

const PEOPLE = [
  { initials: "AO", name: "Ayomide", color: "var(--iris)" },
  { initials: "MK", name: "Mira", color: "var(--teal)" },
  { initials: "DM", name: "Dr. Mensah", color: "var(--rose)" },
];

/**
 * The hero's centrepiece: a scripted, looping preview of two people writing
 * the same manuscript while sources and review flags appear around them.
 */
export function LiveManuscript() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduce ? "hold" : "typingA");
  const [a, setA] = useState(reduce ? SENTENCE_A.length : 0);
  const [b, setB] = useState(reduce ? SENTENCE_B.length : 0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const next = (p: Phase, ms: number) => {
      t = setTimeout(() => setPhase(p), ms);
    };
    switch (phase) {
      case "typingA":
        if (a < SENTENCE_A.length) t = setTimeout(() => setA((n) => n + 1), 38 + Math.random() * 40);
        else next("cite", 500);
        break;
      case "cite":
        next("typingB", 900);
        break;
      case "typingB":
        if (b < SENTENCE_B.length) t = setTimeout(() => setB((n) => n + 1), 45 + Math.random() * 45);
        else next("flag", 600);
        break;
      case "flag":
        next("resolve", 2200);
        break;
      case "resolve":
        next("hold", 2600);
        break;
      case "hold":
        t = setTimeout(() => {
          setA(0);
          setB(0);
          setCycle((c) => c + 1);
          setPhase("typingA");
        }, 2400);
        break;
    }
    return () => clearTimeout(t);
  }, [phase, a, b, reduce]);

  const citedA = phase !== "typingA";
  const flagged = phase === "flag";
  const resolved = phase === "resolve" || phase === "hold";
  const typingA = phase === "typingA";
  const typingB = phase === "typingB";

  return (
    <div className="glass relative overflow-hidden rounded-2xl shadow-[0_40px_120px_-30px_rgb(10_14_40/0.8)]">
      {/* Window bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-xs sm:px-5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </div>
        <span className="text-muted">
          Coastal Microplastics / <span className="text-ink">Manuscript · draft 3</span>
        </span>
        <span className="rounded-full bg-amber/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber">
          Review round 2
        </span>
        <div className="ml-auto flex items-center gap-3">
          <SyncPill key={cycle} />
          <div className="flex -space-x-2">
            {PEOPLE.map((p, i) => (
              <motion.span
                key={p.initials}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.15, type: "spring", stiffness: 400, damping: 20 }}
                className="grid h-7 w-7 place-items-center rounded-full border-2 border-bg-elev text-[10px] font-semibold text-bg"
                style={{ background: p.color }}
                title={p.name}
              >
                {p.initials}
              </motion.span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-[168px_minmax(0,1fr)_240px]">
        {/* Outline with presence */}
        <nav aria-hidden className="hidden flex-col gap-2 border-r border-line p-4 text-[13px] md:flex">
          {[
            ["Abstract", null],
            ["1 Introduction", null],
            ["2 Methods", "var(--iris)"],
            ["2.1 Sampling", null],
            ["2.2 Spectroscopy", "var(--teal)"],
            ["3 Results", null],
            ["4 Discussion", "var(--rose)"],
          ].map(([label, dot]) => (
            <div
              key={label}
              className={`flex items-center justify-between ${dot === "var(--iris)" ? "text-ink" : "text-muted"} ${label?.startsWith("2.") ? "pl-3" : ""}`}
            >
              <span>{label}</span>
              {dot && (
                <motion.span
                  className="h-2 w-2 rounded-full"
                  style={{ background: dot }}
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </div>
          ))}
        </nav>

        {/* Page */}
        <LayoutGroup>
          <div className="min-w-0 px-5 py-6 font-serif text-[17px] leading-[1.75] text-ink sm:px-8">
            <h3 className="mb-3 font-serif text-2xl font-semibold">2 Methods</h3>
            <p className="text-ink/85">
              Sediment cores were collected at twelve intertidal sites along the Lagos lagoon between
              March and June, following the density-separation protocol of Hidalgo-Ruz et al.{" "}
              <Cite>[7]</Cite>.{" "}
              <span className="relative">
                {SENTENCE_A.slice(0, a)}
                {typingA && <Caret color="var(--iris)" name="Ayomide" />}
              </span>
              <AnimatePresence>
                {citedA && (
                  <motion.span
                    layout
                    initial={{ opacity: 0, scale: 0.4, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="inline-block"
                  >
                    &nbsp;<Cite>[12, 15]</Cite>.
                  </motion.span>
                )}
              </AnimatePresence>
            </p>
            <p className="mt-4 text-ink/85">
              <motion.span
                className="rounded-sm"
                animate={{
                  backgroundColor: flagged
                    ? "rgb(246 193 119 / 0.28)"
                    : resolved
                      ? "rgb(94 224 160 / 0.14)"
                      : "rgb(0 0 0 / 0)",
                }}
                transition={{ duration: 0.6 }}
              >
                {SENTENCE_B.slice(0, b)}
              </motion.span>
              {typingB && <Caret color="var(--teal)" name="Mira" />}
              <AnimatePresence>
                {resolved && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="inline-block"
                  >
                    &nbsp;<Cite>[19]</Cite>
                  </motion.span>
                )}
              </AnimatePresence>
            </p>
          </div>
        </LayoutGroup>

        {/* Context rail */}
        <aside className="flex flex-col gap-3 border-t border-line p-4 text-[13px] md:border-t-0 md:border-l">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">In this section</p>
          <div className="rounded-xl border border-line bg-bg-elev/60 p-3">
            <p className="font-medium text-ink">[7] Hidalgo-Ruz et al., 2012</p>
            <p className="text-muted">Env. Sci. &amp; Technology · PDF · 3 notes</p>
          </div>
          <AnimatePresence mode="popLayout">
            {flagged && (
              <motion.div
                key="flag"
                layout
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-amber"
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-3.5 w-3.5" /> Claim needs a source
                </p>
                <p className="mt-1 text-amber/80">Suggested from your library: [19] Lusher, 2017</p>
              </motion.div>
            )}
            {resolved && (
              <motion.div
                key="ok"
                layout
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                className="rounded-xl border border-success/40 bg-success/10 p-3 text-success"
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <Check className="h-3.5 w-3.5" /> Citation added by Mira
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div layout className="rounded-xl border border-line p-3">
            <p className="flex items-center gap-1.5 text-muted">
              <MessageSquareText className="h-3.5 w-3.5" /> Dr. Mensah · reviewer
            </p>
            <p className="mt-1 text-ink">Say why 20% and not a fixed count.</p>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

function Cite({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-iris-soft px-1.5 py-0.5 font-sans text-[12px] font-medium text-iris">
      {children}
    </span>
  );
}

function Caret({ color, name }: { color: string; name: string }) {
  return (
    <span className="relative inline-block h-[1.15em] w-[2px] translate-y-[3px] align-baseline" style={{ background: color }}>
      <motion.span
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute -top-5 left-0 whitespace-nowrap rounded-md rounded-bl-none px-1.5 py-px font-sans text-[10px] font-semibold text-bg"
        style={{ background: color }}
      >
        {name}
      </motion.span>
    </span>
  );
}

function SyncPill() {
  return (
    <span className="hidden items-center gap-1.5 font-mono text-[10px] text-success sm:flex">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      Synced · 3 here
    </span>
  );
}
