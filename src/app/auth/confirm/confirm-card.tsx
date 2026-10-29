"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { EASE_OUT, MOTION } from "@/components/motion/tokens";
import { WaxSeal } from "@/components/auth/wax-seal";
import { confirmLink } from "./actions";

export function ConfirmCard({ tokenHash, type }: { tokenHash: string; type: string }) {
  const reduce = useReducedMotion();
  if (!tokenHash) {
    return (
      <div className="sheet px-8 py-10 text-center">
        <h1 className="font-serif text-3xl">This link is incomplete</h1>
        <p className="mt-3 text-sheet-muted">Some email apps cut long links short. Ask for a new one, or type the code from the email instead.</p>
        <Link href="/sign-in" className="mt-6 inline-flex h-11 items-center rounded-xl bg-sheet-ink px-5 text-sm font-semibold text-sheet">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <motion.form
      action={confirmLink}
      className="sheet px-8 pt-16 pb-10 text-center"
      initial={reduce ? false : { opacity: 0, y: 24, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: MOTION.scene, ease: EASE_OUT }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <Seal />
      <p className="font-mono text-[11px] tracking-[0.16em] text-sheet-muted uppercase">Your key has arrived</p>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Open your workspace</h1>
      <p className="mt-3 text-sheet-muted">Press the button to sign in on this device. The link works once.</p>
      <OpenButton />
    </motion.form>
  );
}

/** The seal sits on the card; while signing in it breaks into two halves. */
function Seal() {
  const { pending } = useFormStatus();
  const reduce = useReducedMotion();
  const half = (side: -1 | 1) => ({
    clipPath: side < 0 ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)",
  });
  return (
    <div className="absolute -top-10 left-1/2 h-20 w-20 -translate-x-1/2" aria-hidden>
      {([-1, 1] as const).map((side) => (
        <motion.div
          key={side}
          className="absolute inset-0"
          style={half(side)}
          initial={reduce ? false : { scale: 1.6, opacity: 0, rotate: -20 }}
          animate={
            pending && !reduce
              ? { x: side * 10, rotate: side * 14, opacity: 0.9, scale: 1, transition: { type: "spring", stiffness: 260, damping: 14 } }
              : { x: 0, rotate: -8, opacity: 1, scale: 1 }
          }
          transition={{ duration: 0.32, ease: [0.5, 0, 0.75, 0], delay: 0.2 }}
        >
          <WaxSeal className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)]" tone={pending ? "teal" : "iris"} />
        </motion.div>
      ))}
    </div>
  );
}

function OpenButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      autoFocus
      className="group mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sheet-ink font-semibold text-sheet transition-opacity disabled:opacity-80"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? "Opening" : "Open AcademiaSync"}
      {!pending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />}
    </button>
  );
}
