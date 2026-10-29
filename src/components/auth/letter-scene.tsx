"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT, MOTION } from "@/components/motion/tokens";
import { play } from "@/lib/sound";
import { InkText } from "./ink-text";
import { WaxSeal } from "./wax-seal";

export type LetterPhase = "compose" | "sent" | "opening";

const noop = () => () => {};
const today = () => new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/**
 * The sign-in page's desk. A letter of introduction lies under the lamp, addressed to
 * whatever is typed in the email field, in wet ink. Sending the link folds it into an
 * envelope and presses the wax seal; typing the code breaks the seal again.
 */
export function LetterScene({ email, phase, sentAt }: { email: string; phase: LetterPhase; sentAt?: number }) {
  const reduce = useReducedMotion();
  const date = useSyncExternalStore(noop, today, () => "");
  const sealed = phase !== "compose";
  // Seconds into the sealing: fold, slide in, close the flap, press the seal.
  const t = reduce ? { fold: 0, slide: 0, flap: 0, seal: 0, post: 0 } : { fold: 0, slide: 0.32, flap: 0.86, seal: 1.22, post: 1.6 };
  const quick = reduce ? { duration: MOTION.quick } : undefined;

  return (
    <aside className="desk grain relative hidden overflow-hidden border-l border-line bg-bg-elev lg:flex lg:flex-col" aria-hidden>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,var(--lamp),transparent_72%)]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-1/2 h-[26rem] w-[44rem] -translate-x-1/2 bg-[radial-gradient(closest-side,var(--iris-soft),transparent_70%)]" />

      <div className="relative flex flex-1 items-center justify-center [perspective:1400px]">
        <div className="relative h-[540px] w-[460px]">
          {/* The envelope's back and the open flap, behind the letter. */}
          <AnimatePresence>
            {sealed && (
              <motion.div
                key="back"
                className="absolute inset-x-0 bottom-6 h-[290px] rounded-md bg-[color-mix(in_oklab,var(--sheet)_86%,var(--sheet-ink))] shadow-[0_40px_80px_-40px_rgb(0_0_0/0.6)]"
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40, transition: { duration: MOTION.quick } }}
                transition={quick ?? { duration: 0.5, ease: EASE_OUT, delay: 0.12 }}
              >
                <motion.div
                  className="absolute inset-x-0 bottom-full h-[150px] origin-bottom bg-[color-mix(in_oklab,var(--sheet)_80%,var(--sheet-ink))] [clip-path:polygon(0_100%,50%_0,100%_100%)]"
                  initial={{ rotateX: 0 }}
                  animate={{ rotateX: 90 }}
                  transition={quick ?? { duration: 0.18, ease: "easeIn", delay: t.flap }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* The letter. */}
          <motion.div
            className="sheet absolute top-0 left-[30px] h-[500px] w-[400px] origin-top px-10 pt-10"
            initial={reduce ? false : { opacity: 0, y: 24, rotate: -1.5 }}
            animate={
              sealed
                ? { opacity: reduce ? 0 : 1, rotate: 0, scaleY: 0.42, scaleX: 0.84, y: 296 }
                : { opacity: 1, rotate: -1.5, scaleY: 1, scaleX: 1, y: 0 }
            }
            transition={
              quick ??
              (sealed
                ? { scaleY: { duration: 0.32, ease: EASE_OUT }, scaleX: { duration: 0.5, delay: t.slide, ease: EASE_OUT }, y: { duration: 0.55, delay: t.slide, ease: EASE_OUT }, rotate: { duration: 0.3 } }
                : { duration: MOTION.scene, ease: EASE_OUT })
            }
          >
            <p className="running-head pb-2">AcademiaSync · Correspondence</p>
            <p className="mt-6 text-right font-serif text-sm text-sheet-muted">{date}</p>
            <p className="mt-6 font-serif text-[15px] text-sheet-muted">
              To&nbsp;&nbsp;
              <InkText text={email} placeholder="you@university.edu" className="font-medium text-sheet-ink" />
            </p>
            <div className="mt-6 space-y-3 font-serif text-[17px] leading-relaxed text-sheet-ink">
              <p>Dear colleague,</p>
              <p className="text-sheet-ink/85">
                Enclosed is your key to the workspace. Your co-authors, sources and drafts are waiting, exactly where you left them.
              </p>
              <p className="text-sheet-ink/85">It opens once, for an hour, in whichever browser you like.</p>
            </div>
            <p className="mt-8 font-serif text-[15px] italic text-sheet-muted">With every good wish,</p>
            <p className="font-serif text-[15px] text-sheet-ink">The AcademiaSync desk</p>
            {/* Fold creases, which only show once it's folded. */}
            <motion.span className="absolute inset-x-0 top-1/3 h-px bg-sheet-line" animate={{ opacity: sealed ? 1 : 0 }} />
            <motion.span className="absolute inset-x-0 top-2/3 h-px bg-sheet-line" animate={{ opacity: sealed ? 1 : 0 }} />
          </motion.div>

          {/* The envelope's pocket, the closed flap and the seal, in front of the letter. */}
          <AnimatePresence>
            {sealed && (
              <motion.div
                key="front"
                className="absolute inset-x-0 bottom-6 h-[290px]"
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40, transition: { duration: MOTION.quick } }}
                transition={quick ?? { duration: 0.5, ease: EASE_OUT, delay: 0.12 }}
              >
                <div className="absolute inset-0 rounded-md bg-sheet shadow-[0_0_0_1px_var(--sheet-line)] [clip-path:polygon(0_0,50%_58%,100%_0,100%_100%,0_100%)]" />
                <div className="absolute inset-0 [clip-path:polygon(0_100%,50%_52%,100%_100%)] bg-[color-mix(in_oklab,var(--sheet)_94%,var(--sheet-ink))]" />
                <motion.div
                  className="absolute inset-x-0 top-0 h-[170px] origin-top bg-[color-mix(in_oklab,var(--sheet)_90%,var(--sheet-ink))] drop-shadow-[0_6px_6px_rgb(0_0_0/0.18)] [clip-path:polygon(0_0,100%_0,50%_100%)]"
                  initial={{ rotateX: reduce ? 0 : -90 }}
                  animate={{ rotateX: phase === "opening" && !reduce ? -24 : 0 }}
                  transition={quick ?? { duration: 0.34, ease: EASE_OUT, delay: phase === "opening" ? 0 : t.flap + 0.18 }}
                />
                <motion.div
                  className="absolute top-[128px] left-1/2 h-[84px] w-[84px] -translate-x-1/2"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.8, rotate: -30 }}
                  animate={
                    phase === "opening" && !reduce
                      ? { opacity: 1, scale: [1, 1.06, 1], rotate: -8, transition: { scale: { repeat: Infinity, duration: 1.1 } } }
                      : { opacity: 1, scale: 1, rotate: -8 }
                  }
                  transition={quick ?? { duration: 0.32, ease: [0.5, 0, 0.75, 0], delay: t.seal }}
                  onAnimationComplete={() => {
                    if (phase === "sent") play("press");
                  }}
                >
                  {!reduce && (
                    <motion.span
                      className="absolute inset-0 rounded-full border-2 border-iris"
                      initial={{ opacity: 0, scale: 1 }}
                      animate={{ opacity: [0, 0.5, 0], scale: [1, 1, 1.6] }}
                      transition={{ duration: 0.8, times: [0, 0.4, 1], delay: t.seal + 0.2, ease: EASE_OUT }}
                    />
                  )}
                  <WaxSeal className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)]" tone={phase === "opening" ? "teal" : "iris"} />
                </motion.div>
                <Postmark sentAt={sentAt} delay={t.post} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative px-12 pb-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, transition: { duration: MOTION.quick } }}
            transition={{ duration: MOTION.scene, ease: EASE_OUT, delay: phase === "sent" ? t.post : 0 }}
            className="max-w-md font-serif text-2xl leading-snug text-ink"
          >
            {phase === "compose" && "One link, one key. No password to forget, nothing for anyone to guess."}
            {phase === "sent" && "Sealed and on its way. The link and the code inside both open the same door."}
            {phase === "opening" && "Breaking the seal…"}
          </motion.p>
        </AnimatePresence>
      </div>
    </aside>
  );
}

/** A circular postmark stamped beside the seal, with the time the email went out. */
function Postmark({ sentAt, delay }: { sentAt?: number; delay: number }) {
  const time = sentAt ? new Date(sentAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <motion.div
      className="absolute top-8 right-8 grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-rose/60 text-center font-mono text-[9px] leading-tight tracking-[0.14em] text-rose/80 uppercase"
      initial={{ opacity: 0, scale: 1.3, rotate: 18 }}
      animate={{ opacity: 1, scale: 1, rotate: 12 }}
      transition={{ duration: 0.3, delay, ease: EASE_OUT }}
    >
      <span>
        Sent
        <br />
        <span className="text-[11px] tracking-[0.06em]">{time}</span>
        <br />
        by email
      </span>
    </motion.div>
  );
}
