"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import { EASE_OUT_EXPO } from "@/components/motion/primitives";
import { LiveManuscript } from "./live-manuscript";

const HEADLINE = ["Write", "the", "paper", "together.", "Keep", "every", "source", "in", "sync."];

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // The preview starts tilted back and settles flat as the reader scrolls toward it.
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.35], [16, 0]), { stiffness: 120, damping: 24 });
  const scale = useSpring(useTransform(scrollYProgress, [0, 0.35], [0.94, 1]), { stiffness: 120, damping: 24 });
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 220]);

  return (
    <section ref={ref} className="grain relative overflow-hidden px-4 pt-36 pb-24 sm:px-6">
      <Aurora y={glowY} />
      <div className="hairline-grid pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          className="glass mb-7 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
          </span>
          Live co-writing for research teams
        </motion.div>

        <h1 className="max-w-4xl font-serif text-[clamp(2.6rem,7vw,5.4rem)] leading-[1.02] font-medium tracking-[-0.02em]">
          {HEADLINE.map((word, i) => (
            <motion.span
              key={i}
              className={`inline-block pr-[0.25em] ${i >= 4 ? "text-gradient italic" : ""}`}
              initial={{ opacity: 0, y: "0.5em", filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.9, ease: EASE_OUT_EXPO }}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.8, ease: EASE_OUT_EXPO }}
          className="mt-7 max-w-2xl text-lg leading-relaxed text-muted"
        >
          AcademiaSync brings your manuscript, references, data and co-authors into one live
          workspace. Every edit, citation and review comment lands for everyone, instantly, and
          nothing is ever lost.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8, ease: EASE_OUT_EXPO }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/sign-in"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-ink px-6 py-3 text-sm font-semibold text-bg transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98]"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            Start a project free
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <a
            href="#features"
            className="glass inline-flex items-center rounded-full px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-line-strong"
          >
            See how it works
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 1.2, ease: EASE_OUT_EXPO }}
        className="relative mx-auto mt-16 max-w-6xl [perspective:1400px]"
      >
        <motion.div style={{ rotateX, scale, transformOrigin: "50% 0%" }}>
          <LiveManuscript />
        </motion.div>
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-20 -bottom-24 h-48 bg-[radial-gradient(ellipse_at_center,var(--iris-soft),transparent_70%)] blur-2xl"
        />
      </motion.div>
    </section>
  );
}

function Aurora({ y }: { y: ReturnType<typeof useTransform<number, number>> }) {
  return (
    <motion.div aria-hidden style={{ y }} className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute top-[-10%] left-[10%] h-[520px] w-[520px] rounded-full bg-iris/25 blur-[120px]"
        animate={{ x: [0, 80, -40, 0], y: [0, 40, 80, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[5%] right-[5%] h-[440px] w-[440px] rounded-full bg-teal/20 blur-[120px]"
        animate={{ x: [0, -60, 30, 0], y: [0, 60, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[35%] left-[40%] h-[360px] w-[360px] rounded-full bg-rose/15 blur-[120px]"
        animate={{ x: [0, 40, -60, 0], y: [0, -40, 20, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
