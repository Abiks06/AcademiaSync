"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const FIELDS = [
  "Marine biology labs",
  "Engineering capstones",
  "Public health teams",
  "History seminars",
  "Computational linguistics",
  "Materials science",
  "Thesis committees",
  "Economics working groups",
];

export function FieldsMarquee() {
  return (
    <div className="border-y border-line py-6">
      <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
        Made for anyone writing research together
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <motion.div
          className="flex w-max gap-10"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 36, repeat: Infinity, ease: "linear" }}
        >
          {[...FIELDS, ...FIELDS].map((f, i) => (
            <span key={i} className="font-serif text-xl whitespace-nowrap text-muted italic">
              {f}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

export function ClosingCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 30 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="grain relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-line bg-bg-elev px-6 py-20 text-center"
      >
        <motion.div
          aria-hidden
          className="absolute -top-40 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-iris/30 blur-[100px]"
          animate={{ opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <h2 className="relative mx-auto max-w-3xl font-serif text-[clamp(2rem,5vw,3.8rem)] leading-[1.05] font-medium">
          Your next paper deserves a <span className="text-gradient italic">better room</span> to be written in.
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-lg text-muted">
          Start a project, invite your co-authors with any university email, and write together today.
        </p>
        <Link
          href="/sign-in"
          className="group relative mt-9 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-bg transition-transform hover:scale-[1.04]"
        >
          Create your first project
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 text-sm text-muted">
        <Logo className="h-5 w-5" />
        <span className="font-medium text-ink">AcademiaSync</span>
        <span>Research, written together.</span>
        <span className="ml-auto text-faint">Built for research teams</span>
      </div>
    </footer>
  );
}
