"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { Download, MessageSquareText } from "lucide-react";
import { Seal } from "@/components/editor/seal";
import { EASE_OUT, MOTION, SPRING } from "@/components/motion/tokens";

/**
 * The landing page's one story: scroll once and watch a paper get written by three people.
 * A pasted DOI becomes a source in the margin, two people write at once and their words dry
 * into ink, a citation ties a claim to its source, a reviewer's note lands, and the paper is
 * sealed and exported. It is built from the same page, margin, citation and seal the app
 * uses. On phones it falls back to the same scene as four still frames.
 */

const CHAPTERS = [
  { stage: "Gather", title: "A pasted DOI becomes a source", body: "Paste a DOI, arXiv or PubMed id and the details fill themselves in, ready to cite." },
  { stage: "Write", title: "Two people write at once", body: "Each person's new words arrive in their colour, then dry into ink." },
  { stage: "Cite", title: "Every claim tied to its source", body: "A thread runs from the citation to its source in the margin, and reviewers comment beside the text." },
  { stage: "Submit", title: "Sealed and exported", body: "Mark it final and export to Word with the references formatted for your journal." },
] as const;

/** Where each chapter starts, as a share of the scroll through the scene. */
const STARTS = [0, 0.25, 0.5, 0.76];
/** The still frames for the phone version: each chapter at its fullest. */
const STILLS = [0.22, 0.48, 0.72, 1];

const DOI = "doi: 10.1126/science.1260352";
const SENTENCE_A = "Most plastic in the ocean starts on land, carried out to sea by rivers and wind";
const SENTENCE_B = "An estimated 4.8 to 12.7 million tonnes reached the sea in 2010 alone.";
const WET = 18;
const PEOPLE = {
  a: { name: "Ayomide", color: "var(--iris)" },
  b: { name: "Mira", color: "var(--teal)" },
  c: { name: "Dr. Mensah", color: "var(--rose)" },
};

const span = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));

export function Story() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setP(Math.round(v * 1000) / 1000));
  const chapter = STARTS.findLastIndex((s) => p >= s);

  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + travel * (STARTS[i] + 0.12), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <>
      {/* Wide screens: one scene, pinned while you scroll through it. */}
      <section ref={ref} aria-label="How a paper gets written in AcademiaSync" className="relative hidden h-[420vh] md:block">
        <div className="sticky top-0 flex h-[100dvh] items-center overflow-hidden px-6">
          <div className="desk mx-auto grid w-full max-w-6xl grid-cols-[16rem_minmax(0,1fr)] items-center gap-12 lg:grid-cols-[19rem_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-iris uppercase">How a paper moves</p>
              <h2 className="mt-3 font-serif text-[clamp(2rem,3.6vw,3rem)] leading-[1.05] font-medium">Watch a paper get written.</h2>
              <ol className="mt-8 flex flex-col gap-1">
                {CHAPTERS.map((c, i) => {
                  const fill = span(p, STARTS[i], STARTS[i + 1] ?? 1);
                  return (
                    <li key={c.stage}>
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        aria-current={chapter === i ? "step" : undefined}
                        className="group relative w-full rounded-xl py-2.5 pr-3 pl-5 text-left"
                      >
                        <span aria-hidden className="absolute top-3 bottom-3 left-0 w-px bg-line-strong">
                          <span className="absolute inset-x-0 top-0 bg-iris" style={{ height: `${fill * 100}%` }} />
                        </span>
                        <span className={`block font-mono text-[11px] tracking-[0.16em] uppercase transition-colors ${chapter === i ? "text-iris" : "text-faint"}`}>
                          {c.stage}
                        </span>
                        <span className={`mt-0.5 block font-semibold transition-colors ${chapter === i ? "text-ink" : "text-muted group-hover:text-ink"}`}>{c.title}</span>
                        <AnimatePresence initial={false}>
                          {chapter === i && (
                            <motion.span
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={SPRING.glide}
                              className="block overflow-hidden text-sm text-muted"
                            >
                              <span className="block pt-1">{c.body}</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <Scene p={p} />
          </div>
        </div>
      </section>

      {/* Phones: the same scene as four still frames, one per chapter. */}
      <section aria-label="How a paper gets written in AcademiaSync" className="px-4 py-24 md:hidden">
        <p className="font-mono text-xs tracking-[0.18em] text-iris uppercase">How a paper moves</p>
        <h2 className="mt-3 font-serif text-4xl leading-[1.05] font-medium">Watch a paper get written.</h2>
        <ol className="mt-10 flex flex-col gap-14">
          {CHAPTERS.map((c, i) => (
            <li key={c.stage}>
              <p className="font-mono text-[11px] tracking-[0.16em] text-iris uppercase">
                {i + 1} · {c.stage}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{c.title}</h3>
              <p className="mt-1 text-muted">{c.body}</p>
              <div className="desk mt-5">
                <Scene p={STILLS[i]} still />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/** The page and its margin at one moment `p` (0 to 1) of the story. */
function Scene({ p, still = false }: { p: number; still?: boolean }) {
  const reduce = useReducedMotion() || still;
  const doi = Math.round(span(p, 0.03, 0.13) * DOI.length);
  const sourceIn = p >= 0.15;
  const a = Math.round(span(p, 0.26, 0.42) * SENTENCE_A.length);
  const b = Math.round(span(p, 0.33, 0.5) * SENTENCE_B.length);
  const cited = p >= 0.53;
  const thread = span(p, 0.56, 0.66);
  const note = p >= 0.66;
  const final = p >= 0.8;
  const exported = p >= 0.9;
  const writing = p >= 0.25 && p < 0.52;

  // The thread runs from the citation to the source card, measured from the real layout.
  const box = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ d: string; x1: number; y1: number; x2: number; y2: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current?.getBoundingClientRect();
      const from = chip.current?.getBoundingClientRect();
      const to = card.current?.getBoundingClientRect();
      const sheet = page.current?.getBoundingClientRect();
      // Only when the margin sits beside the page; stacked on a phone, the glow says enough.
      if (!root || !from || !to || !sheet || to.left < sheet.right) return setPath(null);
      // As in the app, the thread leaves from the page's edge, level with the citation, so it never crosses the text.
      const x1 = sheet.right - root.left - 14;
      const y1 = from.top + from.height / 2 - root.top;
      const x2 = to.left - root.left - 8;
      const y2 = to.top - root.top + 22;
      const mid = x1 + (x2 - x1) * 0.55;
      setPath({ d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, x1, y1, x2, y2 });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [cited, sourceIn]);

  const arrive = reduce ? { duration: 0 } : SPRING.glide;

  return (
    <div ref={box} className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_13rem] lg:grid-cols-[minmax(0,1fr)_15rem]" aria-hidden>
      <div ref={page} className="sheet relative min-h-[27rem] px-6 py-7 sm:px-10 sm:py-9">
        <Seal shown={final} place="bottom-6 left-6 sm:bottom-8 sm:left-10" />
        <div className="running-head flex items-baseline justify-between gap-4 pb-2">
          <span className="truncate">Where does ocean plastic go?</span>
          <span className="shrink-0">{final ? "Final" : "Draft"} · APA 7</span>
        </div>
        <p className="mt-6 font-serif text-xl font-semibold text-sheet-ink">Introduction</p>
        <p className="manuscript-prose mt-3 !min-h-0 !text-[1.02rem] sm:!text-[1.08rem]">
          <Typed text={SENTENCE_A} shown={a} person={PEOPLE.a} cursor={writing && a > 0 && a < SENTENCE_A.length} still={reduce} />
          {cited && " "}
          <AnimatePresence initial={false}>
            {cited && (
              <motion.span
                ref={chip}
                className={`citation ${thread > 0 && thread < 1 ? "is-echo" : ""}`}
                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0 } : SPRING.pop}
                style={{ display: "inline-block" }}
              >
                (Jambeck et al., 2015)
              </motion.span>
            )}
          </AnimatePresence>
          {a >= SENTENCE_A.length && "."}
          {a === 0 && <span className="text-sheet-muted/60">Start writing…</span>}
        </p>
        {/* Mira writes the next paragraph at the same time. */}
        <p className="manuscript-prose mt-3 !min-h-0 !text-[1.02rem] sm:!text-[1.08rem]">
          <Typed text={SENTENCE_B} shown={b} person={PEOPLE.b} cursor={writing && b > 0 && b < SENTENCE_B.length} still={reduce} />
        </p>
        <AnimatePresence>
          {exported && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduce ? { duration: 0 } : SPRING.smooth}
              className="absolute right-6 bottom-6 flex items-center gap-3 rounded-xl border border-sheet-line bg-sheet px-3.5 py-2.5 text-sm text-sheet-ink shadow-[0_18px_40px_-18px_rgb(0_0_0/0.5)]"
            >
              <span className="relative h-7 w-6">
                {/* The pages fanning into one file. */}
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute inset-0 rounded-[3px] border border-sheet-line bg-sheet"
                    initial={reduce ? false : { rotate: (i - 1) * 14, x: (i - 1) * 8 }}
                    animate={{ rotate: 0, x: 0 }}
                    transition={{ duration: reduce ? 0 : MOTION.ceremony, ease: EASE_OUT, delay: reduce ? 0 : 0.1 }}
                  />
                ))}
                <Download className="absolute inset-0 m-auto h-3.5 w-3.5 text-iris" />
              </span>
              <span>
                <span className="block font-medium">ocean-plastic-review.docx</span>
                <span className="block text-xs text-sheet-muted">Exported with APA 7 references</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative flex flex-col gap-3">
        {/* The paste: a DOI typed into the library's add box. */}
        <AnimatePresence initial={false}>
          {!sourceIn && (
            <motion.div
              key="paste"
              exit={{ opacity: 0, y: -6, transition: { duration: MOTION.quick } }}
              className="rounded-xl border border-dashed border-line-strong bg-bg-elev/70 px-3 py-2.5 font-mono text-[11px] text-muted"
            >
              <span className="mb-1 block text-[10px] tracking-[0.14em] text-faint uppercase">Paste to add a source</span>
              {DOI.slice(0, doi)}
              <span className="ml-px inline-block h-3 w-px translate-y-0.5 bg-iris" />
            </motion.div>
          )}
          {sourceIn && (
            <motion.div
              key="card"
              ref={card}
              initial={reduce ? false : { opacity: 0, y: -18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: thread > 0 && thread < 1 ? -6 : 0 }}
              transition={arrive}
              className={`rounded-xl border px-3.5 py-3 text-sheet-ink transition-[border-color,background-color] duration-300 ${
                thread > 0 && thread < 1 ? "border-iris bg-sheet" : "border-sheet-line bg-sheet/80"
              }`}
            >
              <span className="flex justify-between font-mono text-[10px] tracking-[0.12em] text-sheet-muted uppercase">
                <span>Journal article · 2015</span>
                <span>{cited ? "1 use" : "new"}</span>
              </span>
              <span className="mt-1 block font-serif text-[0.95rem] leading-snug">Plastic waste inputs from land into the ocean</span>
              <span className="mt-0.5 block text-xs text-sheet-muted">Jambeck, Geyer +6 · Science</span>
            </motion.div>
          )}
          {note && (
            <motion.div
              key="note"
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={arrive}
              className="rounded-xl border border-line bg-bg-elev px-3.5 py-3 text-sm"
            >
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold text-bg" style={{ background: PEOPLE.c.color }}>
                  DM
                </span>
                {PEOPLE.c.name}
                <MessageSquareText className="ml-auto h-3.5 w-3.5 text-faint" />
              </span>
              <span className="mt-1.5 block text-ink">Worth giving the range here, not just the midpoint.</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {path && cited && thread > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-iris">
          <path d={path.d} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - thread} opacity={0.9} />
          <circle cx={path.x1} cy={path.y1} r={2.5} fill="currentColor" />
          {thread >= 1 && <circle cx={path.x2} cy={path.y2} r={2.5} fill="currentColor" />}
        </svg>
      )}
    </div>
  );
}

/** A sentence as it is being typed: the newest letters are wet in the writer's colour. */
function Typed({ text, shown, person, cursor, still }: { text: string; shown: number; person: { name: string; color: string }; cursor: boolean; still: boolean }) {
  return (
    <>
      {[...text.slice(0, shown)].map((ch, i) => (
        <span
          key={i}
          style={{
            color: !still && shown - i <= WET && shown < text.length ? person.color : undefined,
            transition: "color 900ms cubic-bezier(.3,.5,.3,1)",
          }}
        >
          {ch}
        </span>
      ))}
      {cursor && (
        <span className="relative inline-block h-[1.1em] w-0 align-text-bottom">
          <span className="absolute inset-y-0 left-0 w-[2px] rounded-full" style={{ background: person.color }} />
          <span
            className="absolute -top-5 left-0 rounded-[4px] px-1.5 py-px font-sans text-[10px] leading-4 font-semibold whitespace-nowrap text-bg"
            style={{ background: person.color }}
          >
            {person.name}
          </span>
        </span>
      )}
    </>
  );
}
