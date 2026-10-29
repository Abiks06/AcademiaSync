"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Avatar } from "@/components/app/app-shell";
import { EASE_OUT, EXIT, MOTION, SPRING } from "@/components/motion/tokens";
import { InkText } from "@/components/auth/ink-text";
import { saveProfile, type ProfileState } from "@/lib/profile/actions";

export type ProfileFields = { full_name: string; position: string; institution: string; field: string };

const initial: ProfileState = { status: "idle" };

/**
 * The profile as a manuscript's title page: you fill in your byline on the paper itself,
 * the way it will read to co-authors. Underneath, the same details as collaborators meet
 * them in the editor.
 */
export function TitlePageForm({
  defaults,
  email,
  avatarUrl,
  color,
  mode,
  next = "/projects",
  aside,
}: {
  defaults: ProfileFields;
  email: string;
  avatarUrl: string | null;
  /** This person's cursor colour in the editor. */
  color: string;
  mode: "welcome" | "settings";
  next?: string;
  /** Extra controls under the sheet, e.g. the picture picker. */
  aside?: React.ReactNode;
}) {
  const [state, action] = useActionState(saveProfile, initial);
  const [values, setValues] = useState(defaults);
  const [saved, setSaved] = useState(defaults);
  const reduce = useReducedMotion();
  const dirty = (Object.keys(values) as (keyof ProfileFields)[]).some((k) => values[k].trim() !== saved[k].trim());
  const set = (k: keyof ProfileFields) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  // A save makes what's on the page the new baseline.
  const [lastSave, setLastSave] = useState<number | undefined>();
  if (state.status === "saved" && state.savedAt !== lastSave) {
    setLastSave(state.savedAt);
    setSaved(values);
  }

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty || mode !== "settings") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, mode]);

  const name = values.full_name.trim();
  const affiliation = [values.position, values.institution].map((s) => s.trim()).filter(Boolean).join(", ");

  return (
    <form action={action} className="grid gap-8">
      {mode === "welcome" && <input type="hidden" name="welcome" value="1" />}
      <input type="hidden" name="next" value={next} />

      <motion.div
        className="sheet px-6 pt-8 pb-10 sm:px-12 sm:pt-10 sm:pb-14"
        initial={reduce ? false : { opacity: 0, y: 28, rotate: -0.8 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: MOTION.scene, ease: EASE_OUT }}
      >
        <p className="running-head flex justify-between pb-2">
          <span>Title page</span>
          <span>AcademiaSync</span>
        </p>
        <p className="mt-10 text-center font-serif text-[clamp(1.4rem,3.4vw,2rem)] leading-tight text-sheet-muted/80 italic sm:mt-14">
          Your next manuscript
        </p>
        <div className="mx-auto mt-8 grid max-w-md gap-3 text-center sm:mt-10">
          <PaperField
            name="full_name"
            label="Your name, as you publish it"
            value={values.full_name}
            onChange={set("full_name")}
            placeholder="Your name"
            className="font-serif text-2xl sm:text-[1.7rem]"
            maxLength={120}
            required
            autoFocus={mode === "welcome"}
            autoComplete="name"
            error={state.field === "full_name" ? state.message : undefined}
          />
          <PaperField
            name="position"
            label="Position"
            value={values.position}
            onChange={set("position")}
            placeholder="Position, e.g. PhD candidate"
            className="font-serif text-lg italic"
            maxLength={80}
            autoComplete="organization-title"
            list="positions"
          />
          <PaperField
            name="institution"
            label="Institution"
            value={values.institution}
            onChange={set("institution")}
            placeholder="Institution"
            className="font-serif text-lg"
            maxLength={200}
            autoComplete="organization"
          />
          <PaperField
            name="field"
            label="Field"
            value={values.field}
            onChange={set("field")}
            placeholder="Field of research"
            className="font-mono text-[12px] tracking-[0.14em] uppercase"
            maxLength={80}
          />
        </div>
        <p className="mt-10 text-center font-serif text-sm text-sheet-muted">
          Correspondence: <span className="text-sheet-ink">{email}</span>
        </p>
        <datalist id="positions">
          {["PhD candidate", "Master's student", "Postdoctoral researcher", "Research fellow", "Lecturer", "Assistant Professor", "Associate Professor", "Professor", "Research assistant", "Independent researcher"].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </motion.div>

      <section aria-label="How collaborators see you" className="grid gap-4">
        <p className="font-mono text-[10px] tracking-[0.16em] text-faint uppercase">How collaborators see you</p>
        <div className="flex flex-wrap items-center gap-3">
          {/* The presence pill from the editor's header. */}
          <span className="glass inline-flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-sm">
            <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${color}` }}>
              <Avatar name={name || email} url={avatarUrl} size={26} />
            </span>
            <InkText text={name} placeholder="Your name" className="font-medium" />
            <span className="text-faint">is editing</span>
          </span>
          {/* A comment's byline in the margin. */}
          <span className="glass inline-flex max-w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm">
            <Avatar name={name || email} url={avatarUrl} size={28} />
            <span className="min-w-0">
              <span className="block truncate font-medium">{name || "Your name"}</span>
              <span className="block truncate text-xs text-muted">{affiliation || "Position, institution"}</span>
            </span>
          </span>
        </div>
        {aside}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton mode={mode} dirty={dirty} />
        <AnimatePresence mode="wait" initial={false}>
          {state.status === "error" && !state.field ? (
            <motion.p key="error" role="alert" className="text-sm text-danger" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: EXIT }}>
              {state.message}
            </motion.p>
          ) : state.status === "saved" && !dirty ? (
            <motion.p
              key={`saved-${state.savedAt}`}
              className="flex items-center gap-1.5 text-sm text-success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: EXIT }}
              transition={SPRING.pop}
            >
              <Check className="h-4 w-4" aria-hidden /> Saved. Co-authors see it next time they open a manuscript.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </form>
  );
}

/** An input set on the paper like a typeset line, with a hairline that inks in on focus. */
function PaperField({
  label,
  className = "",
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="group relative block">
      <span className="sr-only">{label}</span>
      <input
        {...props}
        aria-invalid={error ? true : undefined}
        className={`peer w-full bg-transparent px-2 py-1.5 text-center text-sheet-ink outline-none placeholder:text-sheet-muted/35 ${className}`}
      />
      <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-sheet-line" />
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-6 bottom-0 h-px origin-center scale-x-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] peer-focus:scale-x-100 ${error ? "scale-x-100 bg-danger" : "bg-iris"}`}
      />
      <span aria-hidden className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.16em] text-sheet-muted uppercase opacity-0 transition-opacity peer-focus:opacity-100">
        {label}
      </span>
      {error && (
        <span role="alert" className="mt-1 block text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

function SaveButton({ mode, dirty }: { mode: "welcome" | "settings"; dirty: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || (mode === "settings" && !dirty);
  return (
    <motion.button
      type="submit"
      disabled={disabled}
      whileTap={{ scale: 0.98 }}
      className="group inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 font-semibold text-bg transition-opacity disabled:opacity-50"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {mode === "welcome" ? (pending ? "Setting your title page" : "Enter your workspace") : pending ? "Saving" : "Save changes"}
      {mode === "welcome" && !pending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />}
    </motion.button>
  );
}
