"use client";

import { useRef, type ComponentProps } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";
import { clsx } from "clsx";

import { EASE_OUT } from "./tokens";

export const EASE_OUT_EXPO = EASE_OUT;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: EASE_OUT_EXPO },
  },
};

export const stagger = (delayChildren = 0, staggerChildren = 0.08): Variants => ({
  hidden: {},
  show: { transition: { delayChildren, staggerChildren } },
});

/**
 * Reveals children once when scrolled into view. Without JavaScript the content is simply
 * visible (see `[data-reveal]` in globals.css).
 */
export function Reveal({
  className,
  delay = 0,
  children,
  as = "div",
}: {
  className?: string;
  delay?: number;
  children: React.ReactNode;
  as?: "div" | "section" | "li";
}) {
  const Component = motion[as];
  return (
    <Component
      data-reveal
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={stagger(delay)}
    >
      {children}
    </Component>
  );
}

export function RevealItem({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}

/** A button that leans toward the pointer, with a light sheen on hover. */
export function MagneticButton({
  className,
  children,
  strength = 0.25,
  ...props
}: ComponentProps<typeof motion.button> & { strength?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });

  return (
    <motion.button
      ref={ref}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || e.pointerType !== "mouse") return;
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
      className={clsx("relative overflow-hidden", className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Card that tilts slightly in 3D and lights up under the cursor. */
export function TiltCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [5, -5]), { stiffness: 180, damping: 20 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-5, 5]), { stiffness: 180, damping: 20 });
  const glowX = useTransform(px, (v) => v * 100);
  const glowY = useTransform(py, (v) => v * 100);
  const glow = useMotionTemplate`radial-gradient(420px circle at ${glowX}% ${glowY}%, var(--iris-soft), transparent 60%)`;

  return (
    <motion.div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || e.pointerType !== "mouse") return;
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={clsx("group relative", className)}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: glow }}
      />
      {children}
    </motion.div>
  );
}
