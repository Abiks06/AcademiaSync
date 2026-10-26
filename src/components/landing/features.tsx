"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BookOpenCheck, FileStack, GitCompareArrows, ListChecks, Quote, Users } from "lucide-react";
import { Reveal, RevealItem, TiltCard } from "@/components/motion/primitives";

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-24 px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="max-w-2xl">
          <RevealItem>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-iris">One workspace</p>
          </RevealItem>
          <RevealItem>
            <h2 className="mt-3 font-serif text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.05] font-medium">
              Everything a paper touches, connected.
            </h2>
          </RevealItem>
          <RevealItem>
            <p className="mt-4 text-lg text-muted">
              Stop stitching together Docs, Zotero, Drive and a group chat. Each piece knows about the
              others, so a comment, a source or a task always points at the exact sentence it is about.
            </p>
          </RevealItem>
        </Reveal>

        <Reveal className="mt-14 grid gap-4 md:grid-cols-6" delay={0.1}>
          <Tile className="md:col-span-4" icon={<Users className="h-4 w-4" />} title="Live co-editing that never loses a word"
            body="Cursors, selections and who-is-where on the outline. Edit offline and it merges when you reconnect.">
            <PresenceDemo />
          </Tile>
          <Tile className="md:col-span-2" icon={<Quote className="h-4 w-4" />} title="Citations that write themselves"
            body="Paste a DOI and the reference, in-text citation and bibliography appear in your style.">
            <CitationDemo />
          </Tile>
          <Tile className="md:col-span-2" icon={<BookOpenCheck className="h-4 w-4" />} title="Every claim, checked"
            body="Uncited claims are highlighted, with matching sources suggested from your own library." />
          <Tile className="md:col-span-2" icon={<GitCompareArrows className="h-4 w-4" />} title="History you can trust"
            body="Named versions and a word-level comparison between any two drafts.">
            <HistoryDemo />
          </Tile>
          <Tile className="md:col-span-2" icon={<ListChecks className="h-4 w-4" />} title="Tasks pinned to paragraphs"
            body="Assign “add spectra to 2.2” and it sits in the margin of section 2.2 until it is done." />
          <Tile className="md:col-span-6" icon={<FileStack className="h-4 w-4" />} title="Papers, datasets and figures in one library"
            body="Read and annotate PDFs together, preview CSVs, and drag any highlight into the draft as a cited quote.">
            <LibraryStrip />
          </Tile>
        </Reveal>
      </div>
    </section>
  );
}

function Tile({
  className,
  icon,
  title,
  body,
  children,
}: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <RevealItem className={`min-w-0 ${className ?? ""}`}>
      <TiltCard className="glass h-full overflow-hidden rounded-2xl p-6">
        <div className="relative flex h-full flex-col gap-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-iris-soft text-iris">{icon}</span>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
          </div>
          {children && <div className="mt-auto">{children}</div>}
        </div>
      </TiltCard>
    </RevealItem>
  );
}

function useTicker(length: number, ms: number) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => clearInterval(id);
  }, [length, ms, reduce]);
  return i;
}

function PresenceDemo() {
  const people = [
    { n: "AO", c: "var(--iris)", line: 0 },
    { n: "MK", c: "var(--teal)", line: 2 },
    { n: "JT", c: "var(--amber)", line: 3 },
  ];
  const tick = useTicker(6, 1400);
  return (
    <div className="relative rounded-xl border border-line bg-bg-elev/60 p-4">
      {[92, 78, 85, 64, 70].map((w, line) => (
        <div key={line} className="relative mb-2.5 h-2.5 last:mb-0">
          <div className="h-full rounded-full bg-line-strong/60" style={{ width: `${w}%` }} />
          {people
            .filter((p) => (p.line + tick) % 5 === line)
            .map((p) => (
              <motion.span
                key={p.n}
                layoutId={`cursor-${p.n}`}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                className="absolute -top-1.5 flex items-start gap-1"
                style={{ left: `${(w * (0.4 + ((tick * 13 + p.line * 7) % 50) / 100)).toFixed(0)}%` }}
              >
                <span className="h-5 w-[2px]" style={{ background: p.c }} />
                <span className="rounded px-1 text-[9px] font-semibold text-bg" style={{ background: p.c }}>
                  {p.n}
                </span>
              </motion.span>
            ))}
        </div>
      ))}
    </div>
  );
}

const DOIS = [
  { doi: "10.1021/es2031505", ref: "Hidalgo-Ruz, V., et al. (2012). Environ. Sci. Technol., 46(6)." },
  { doi: "10.1038/s41586-020-2649-2", ref: "Harris, C. R., et al. (2020). Nature, 585, 357–362." },
];

function CitationDemo() {
  const i = useTicker(DOIS.length, 3200);
  return (
    <div className="space-y-2 font-mono text-[11px]">
      <div className="rounded-lg border border-line bg-bg-elev/60 px-3 py-2 text-muted">
        doi: <span className="text-ink">{DOIS[i].doi}</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="rounded-lg border border-iris/30 bg-iris-soft px-3 py-2 font-serif text-[12px] text-ink"
        >
          {DOIS[i].ref}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function HistoryDemo() {
  const versions = ["Outline", "Draft 1", "Sent to advisor", "Draft 3"];
  const i = useTicker(versions.length, 1600);
  return (
    <div className="relative flex items-center justify-between pt-2">
      <div className="absolute inset-x-1 top-[17px] h-px bg-line-strong" />
      <motion.div
        className="absolute left-1 top-[17px] h-px bg-iris"
        animate={{ width: `${(i / (versions.length - 1)) * 100}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      {versions.map((v, n) => (
        <div key={v} className="relative flex flex-col items-center gap-2">
          <motion.span
            className="h-2.5 w-2.5 rounded-full border-2"
            animate={{
              borderColor: n <= i ? "var(--iris)" : "var(--line-strong)",
              backgroundColor: n === i ? "var(--iris)" : "var(--bg-elev)",
              scale: n === i ? 1.3 : 1,
            }}
          />
          <span className={`text-[10px] ${n === i ? "text-ink" : "text-faint"}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function LibraryStrip() {
  const items = [
    ["PDF", "Lusher 2017 · Microplastics in the marine environment"],
    ["CSV", "lagoon_counts_2026.csv · 1,284 rows"],
    ["FIG", "Figure 3 · FTIR spectra"],
    ["PDF", "Hidalgo-Ruz 2012 · Methods review"],
    ["LINK", "github.com/lab/particle-pipeline"],
  ];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
      <motion.div
        className="flex w-max gap-3"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      >
        {[...items, ...items].map(([kind, label], n) => (
          <div key={n} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg-elev/60 px-3 py-2 text-sm">
            <span className="rounded bg-iris-soft px-1.5 py-0.5 font-mono text-[10px] text-iris">{kind}</span>
            <span className="whitespace-nowrap text-muted">{label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
