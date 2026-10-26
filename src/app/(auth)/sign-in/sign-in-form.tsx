"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { EASE_OUT_EXPO } from "@/components/motion/primitives";
import { sendMagicLink, signInWithProvider, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action] = useActionState(sendMagicLink, initial);
  const error = state.status === "error" ? state.message : initialError;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.status === "sent" ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
          className="flex flex-col items-start gap-5"
        >
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.1 }}
            className="grid h-14 w-14 place-items-center rounded-2xl bg-teal/15 text-teal"
          >
            <MailCheck className="h-7 w-7" />
          </motion.span>
          <h1 className="font-serif text-4xl font-medium">Check your inbox</h1>
          <p className="text-muted">
            We sent a sign-in link to <span className="font-medium text-ink">{state.email}</span>. It
            works once and expires in an hour.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-iris underline-offset-4 hover:underline"
          >
            Use a different email
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="form"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20, filter: "blur(6px)" }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
        >
          <h1 className="font-serif text-4xl font-medium tracking-tight">Welcome back to the draft</h1>
          <p className="mt-3 text-muted">Sign in or create an account. Any university or personal email works.</p>

          <form action={signInWithProvider} className="mt-8 grid gap-3">
            <input type="hidden" name="next" value={next} />
            <ProviderButton provider="google" label="Continue with Google" icon={<GoogleIcon />} />
            <ProviderButton provider="azure" label="Continue with Microsoft" icon={<MicrosoftIcon />} />
          </form>

          <div className="my-7 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or with email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form action={action} className="grid gap-3">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={state.email}
              placeholder="you@university.edu"
              className="h-12 rounded-xl border border-line bg-bg-elev px-4 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)]"
            />
            <SubmitButton />
            <AnimatePresence>
              {error && (
                <motion.p
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -3, 0] }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-danger"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      type="submit"
      disabled={pending}
      whileTap={{ scale: 0.98 }}
      className="group relative mt-1 flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-ink font-semibold text-bg disabled:opacity-70"
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Sending link" : "Email me a sign-in link"}
      {!pending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
    </motion.button>
  );
}

function ProviderButton({ provider, label, icon }: { provider: string; label: string; icon: React.ReactNode }) {
  return (
    <motion.button
      name="provider"
      value={provider}
      type="submit"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="flex h-12 items-center justify-center gap-3 rounded-xl border border-line bg-bg-elev text-sm font-medium transition-colors hover:border-line-strong"
    >
      {icon}
      {label}
    </motion.button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}
