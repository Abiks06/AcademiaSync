"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Logo } from "@/components/brand/logo";

const LINKS = [{ href: "#how-it-works", label: "How it works" }];

export function SiteNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(12px,env(safe-area-inset-top))]"
    >
      <motion.nav
        layout
        className={`flex w-full items-center gap-6 rounded-full px-4 py-2.5 transition-[background,border-color,box-shadow,max-width] duration-500 ${
          scrolled
            ? "glass max-w-3xl shadow-[0_10px_40px_-12px_rgb(0_0_0/0.5)]"
            : "max-w-6xl border border-transparent"
        }`}
      >
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-6 w-6" />
          <span>AcademiaSync</span>
        </Link>
        <div className="ml-auto hidden items-center gap-1 text-sm text-muted sm:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-3 py-1.5 transition-colors hover:bg-iris-soft hover:text-ink">
              {l.label}
            </a>
          ))}
        </div>
        <Link
          href="/sign-in"
          className="ml-auto rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-bg transition-transform hover:scale-105 sm:ml-0"
        >
          Sign in
        </Link>
      </motion.nav>
    </motion.header>
  );
}
