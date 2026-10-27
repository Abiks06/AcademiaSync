"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";

const STEPS = [
  {
    stage: "Gather",
    title: "Build the library together",
    body: "Paste a DOI, arXiv or PubMed id, or import a BibTeX or RIS file from Zotero, Mendeley or EndNote.",
  },
  {
    stage: "Draft",
    title: "Write in the same document at once",
    body: "Live cursors and comments in one shared text, cited from one shared library.",
  },
  {
    stage: "Review",
    title: "Bring in your co-authors",
    body: "Invite co-authors and advisors as authors, contributors or commenters, and resolve every comment in the margin.",
  },
  {
    stage: "Submit",
    title: "Export a clean manuscript",
    body: "Word or Markdown, or print to PDF, with citations and references in the style your journal asks for.",
  },
];

export function Workflow() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const height = useTransform(fill, [0, 1], ["0%", "100%"]);

  return (
    <section id="workflow" className="scroll-mt-24 px-4 py-28 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-14 md:grid-cols-[1fr_1.2fr]">
        <div className="md:sticky md:top-32 md:self-start">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-teal">How a paper moves</p>
          <h2 className="mt-3 font-serif text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.05] font-medium">
            From first source to final submission.
          </h2>
          <p className="mt-4 max-w-md text-lg text-muted">
            One project carries the whole life of a paper, so nobody asks which file is the latest.
          </p>
        </div>

        <div ref={ref} className="relative pl-10">
          <div className="absolute top-2 bottom-2 left-[11px] w-px bg-line-strong" />
          <motion.div
            style={{ height }}
            className="absolute top-2 left-[11px] w-px bg-gradient-to-b from-iris via-teal to-amber"
          />
          <ol className="flex flex-col gap-14">
            {STEPS.map((s, i) => (
              <Step key={s.stage} index={i} {...s} progress={fill} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Step({
  index,
  stage,
  title,
  body,
  progress,
}: (typeof STEPS)[number] & { index: number; progress: ReturnType<typeof useSpring> }) {
  const at = index / (STEPS.length - 1);
  const active = useTransform(progress, [Math.max(0, at - 0.15), at], [0, 1]);
  const scale = useTransform(active, [0, 1], [0.6, 1]);
  const opacity = useTransform(active, [0, 1], [0.35, 1]);

  return (
    <motion.li style={{ opacity }} className="relative">
      <motion.span
        style={{ scale }}
        className="absolute top-1 -left-10 grid h-6 w-6 place-items-center rounded-full border border-iris bg-bg font-mono text-[10px] text-iris"
      >
        {index + 1}
      </motion.span>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">{stage}</p>
      <h3 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-muted">{body}</p>
    </motion.li>
  );
}
