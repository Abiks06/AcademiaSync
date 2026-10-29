"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { EASE_OUT, EXIT, MOTION, SPRING } from "@/components/motion/tokens";
import { CodeInput } from "@/components/auth/code-input";
import { LetterScene, type LetterPhase } from "@/components/auth/letter-scene";
import { WaxSeal } from "@/components/auth/wax-seal";
import { mailApps, suggestEmail } from "@/lib/auth/email-hints";
import { sendMagicLink, signInWithProvider, verifyCode, type CodeState, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };
const initialCode: CodeState = { status: "idle" };

type Providers = { google: boolean; azure: boolean };
type Method = "google" | "azure" | "email";

const LAST_METHOD = "academiasync:last-sign-in";

function readLastMethod(): Method | null {
  try {
    const m = localStorage.getItem(LAST_METHOD);
    return m === "google" || m === "azure" || m === "email" ? m : null;
  } catch {
    return null;
  }
}
function rememberMethod(method: Method) {
  try {
    localStorage.setItem(LAST_METHOD, method);
  } catch {
    // Storage is blocked; the hint simply won't show next time.
  }
}
const noop = () => () => {};

/** The whole sign-in page: the form on the left, the letter on the desk to the right. */
export function SignInExperience({
  next,
  initialError,
  providers,
  header,
  footer,
}: {
  next: string;
  initialError?: string;
  providers: Providers;
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [state, action] = useActionState(sendMagicLink, initial);
  const [email, setEmail] = useState(state.email ?? "");
  // "Use a different email" goes back to the form without forgetting the link already sent.
  const [dismissed, setDismissed] = useState<number | undefined>();
  const [opening, setOpening] = useState(false);
  const sent = state.status === "sent" && state.sentAt !== dismissed;
  const phase: LetterPhase = !sent ? "compose" : opening ? "opening" : "sent";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative flex flex-col px-6 py-8 sm:px-12">
        {header}
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <AnimatePresence mode="wait" initial={false}>
            {sent ? (
              <SentView
                key="sent"
                state={state}
                next={next}
                resend={action}
                onOpening={setOpening}
                onBack={() => {
                  setDismissed(state.sentAt);
                  setOpening(false);
                }}
              />
            ) : (
              <ComposeView
                key="form"
                state={state}
                action={action}
                next={next}
                email={email}
                onEmail={setEmail}
                providers={providers}
                initialError={initialError}
              />
            )}
          </AnimatePresence>
        </div>
        {footer}
      </section>
      <LetterScene email={sent ? (state.email ?? email) : email} phase={phase} sentAt={state.sentAt} />
    </main>
  );
}

function ComposeView({
  state,
  action,
  next,
  email,
  onEmail,
  providers,
  initialError,
}: {
  state: SignInState;
  action: (formData: FormData) => void;
  next: string;
  email: string;
  onEmail: (email: string) => void;
  providers: Providers;
  initialError?: string;
}) {
  const reduce = useReducedMotion();
  const last = useSyncExternalStore(noop, readLastMethod, () => null);
  const [touched, setTouched] = useState(false);
  const error = state.status === "error" && !touched ? state.message : !touched ? initialError : undefined;
  const suggestion = suggestEmail(email);
  const anyProvider = providers.google || providers.azure;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, filter: "blur(6px)", transition: EXIT }}
      transition={{ duration: MOTION.scene, ease: EASE_OUT }}
    >
      <p className="rise font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Sign in · Sign up</p>
      <h1 className="rise mt-3 font-serif text-4xl font-medium tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
        Your workspace is a link away
      </h1>
      <p className="rise mt-3 text-muted" style={{ "--i": 2 } as React.CSSProperties}>
        New here? The same steps create your account. Any university or personal email works.
      </p>

      {anyProvider && (
        <>
          <form action={signInWithProvider} className="rise mt-8 grid gap-3" style={{ "--i": 3 } as React.CSSProperties}>
            <input type="hidden" name="next" value={next} />
            {providers.google && <ProviderButton provider="google" label="Continue with Google" icon={<GoogleIcon />} last={last === "google"} />}
            {providers.azure && <ProviderButton provider="azure" label="Continue with Microsoft" icon={<MicrosoftIcon />} last={last === "azure"} />}
          </form>
          <div className="my-7 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or with email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form
        action={(fd) => {
          rememberMethod("email");
          setTouched(false);
          action(fd);
        }}
        className={`grid gap-3 ${anyProvider ? "" : "mt-8"}`}
        noValidate
      >
        <input type="hidden" name="next" value={next} />
        <div className="flex items-baseline justify-between">
          <label htmlFor="email" className="text-sm font-medium">
            Email address
          </label>
          {last === "email" && <LastUsed />}
        </div>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            onEmail(e.target.value);
            setTouched(true);
          }}
          placeholder="you@university.edu"
          aria-invalid={state.status === "error" && !touched ? true : undefined}
          aria-describedby={error ? "email-error" : suggestion ? "email-suggestion" : undefined}
          className="h-12 rounded-xl border border-line bg-bg-elev px-4 text-ink outline-none transition-[border-color,box-shadow] placeholder:text-faint focus:border-iris focus:shadow-[0_0_0_4px_var(--iris-soft)] aria-invalid:border-danger/70"
        />
        <AnimatePresence initial={false}>
          {suggestion && (
            <motion.button
              id="email-suggestion"
              type="button"
              key="suggestion"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: EXIT }}
              transition={SPRING.snappy}
              onClick={() => onEmail(suggestion)}
              className="-mt-1 flex items-center gap-1.5 overflow-hidden text-left text-sm text-muted"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
              Did you mean <span className="font-medium text-iris underline decoration-iris/40 underline-offset-4">{suggestion}</span>?
            </motion.button>
          )}
        </AnimatePresence>
        <SubmitButton />
        <AnimatePresence>
          {error && (
            <motion.p
              id="email-error"
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -3, 0] }}
              // Springs only take two keyframes, so the shake runs as a tween.
              transition={{ x: { type: "tween", duration: 0.4, ease: "easeOut" } }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-danger"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
}

function SentView({
  state,
  next,
  resend,
  onOpening,
  onBack,
}: {
  state: SignInState;
  next: string;
  resend: (formData: FormData) => void;
  onOpening: (opening: boolean) => void;
  onBack: () => void;
}) {
  const reduce = useReducedMotion();
  const [codeState, verify, verifying] = useActionState(verifyCode, initialCode);
  const formRef = useRef<HTMLFormElement>(null);
  const email = state.email ?? "";
  const wait = useCountdown(state.sentAt, state.wait ?? 0);
  // A wrong code clears the "breaking the seal" moment; a right one leaves the page.
  useEffect(() => onOpening(verifying), [verifying, onOpening]);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, transition: EXIT }}
      transition={{ duration: MOTION.scene, ease: EASE_OUT, delay: reduce ? 0 : 0.15 }}
    >
      <motion.div
        className="mb-6 h-16 w-16 lg:hidden"
        initial={reduce ? false : { opacity: 0, scale: 1.7, rotate: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: -8 }}
        transition={{ duration: 0.32, ease: [0.5, 0, 0.75, 0], delay: 0.2 }}
      >
        <WaxSeal className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.3)]" tone={verifying ? "teal" : "iris"} />
      </motion.div>
      <h1 className="font-serif text-4xl font-medium tracking-tight">Check your inbox</h1>
      <p className="mt-3 text-muted">
        We sent a sign-in link and a code to <span className="font-medium text-ink [overflow-wrap:anywhere]">{email}</span>. Use
        whichever is easier: the code works on any device.
      </p>

      <form ref={formRef} action={verify} className="mt-7 grid gap-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <CodeInput
          name="code"
          disabled={verifying}
          invalid={codeState.status === "error" && !verifying}
          onComplete={() => formRef.current?.requestSubmit()}
        />
        <div className="flex min-h-5 items-center gap-2 text-sm" aria-live="polite">
          {verifying ? (
            <span className="flex items-center gap-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the code
            </span>
          ) : codeState.status === "error" ? (
            <motion.span
              key={codeState.message}
              role="alert"
              className="text-danger"
              animate={{ x: [0, -6, 6, -3, 0] }}
              transition={{ type: "tween", duration: 0.4, ease: "easeOut" }}
            >
              {codeState.message}
            </motion.span>
          ) : (
            <span className="text-faint">The code fills itself in when you paste it.</span>
          )}
        </div>
      </form>

      <div className="mt-5 flex flex-wrap gap-2">
        {mailApps(email).map((app) => (
          <a
            key={app.label}
            href={app.href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-bg-elev px-4 text-sm font-medium transition-colors hover:border-line-strong"
          >
            Open {app.label}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </a>
        ))}
      </div>

      <div className="mt-8 grid gap-3 border-t border-line pt-5 text-sm">
        <form action={resend} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="resend" value="1" />
          Nothing yet? Check spam, or
          <ResendButton wait={wait} total={state.wait ?? 60} />
        </form>
        {state.message && <p className="text-xs text-faint">{state.message}</p>}
        <button type="button" onClick={onBack} className="flex w-fit items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Use a different email
        </button>
      </div>
    </motion.div>
  );
}

/** Seconds left before another email can be asked for, counting down from when the last one went. */
function useCountdown(sentAt: number | undefined, seconds: number) {
  const [now, setNow] = useState(() => sentAt ?? 0);
  useEffect(() => {
    if (!sentAt || !seconds) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [sentAt, seconds]);
  if (!sentAt) return 0;
  return Math.max(0, Math.ceil(seconds - (now - sentAt) / 1000));
}

function ResendButton({ wait, total }: { wait: number; total: number }) {
  const { pending } = useFormStatus();
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="submit"
      disabled={wait > 0 || pending}
      className="inline-flex items-center gap-1.5 font-medium text-iris disabled:text-faint enabled:hover:underline enabled:underline-offset-4"
    >
      {wait > 0 && (
        <svg viewBox="0 0 18 18" className="h-4 w-4 -rotate-90" aria-hidden>
          <circle cx="9" cy="9" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2" />
          <circle
            cx="9"
            cy="9"
            r={r}
            fill="none"
            stroke="var(--iris)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - wait / Math.max(total, 1))}
            className="transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
      )}
      {pending ? "sending…" : wait > 0 ? `send again in ${wait}s` : "send a new link and code"}
    </button>
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
      {pending ? "Sealing your link" : "Email me a sign-in link"}
      {!pending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
    </motion.button>
  );
}

function LastUsed() {
  return <span className="rounded-full bg-iris-soft px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-iris uppercase">Last used</span>;
}

function ProviderButton({ provider, label, icon, last }: { provider: Method; label: string; icon: React.ReactNode; last: boolean }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("provider") === provider;
  return (
    <motion.button
      name="provider"
      value={provider}
      type="submit"
      disabled={pending}
      onClick={() => rememberMethod(provider)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex h-12 items-center justify-center gap-3 rounded-xl border border-line bg-bg-elev text-sm font-medium transition-colors hover:border-line-strong disabled:opacity-70"
    >
      {mine ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {label}
      {last && (
        <span className="absolute right-3">
          <LastUsed />
        </span>
      )}
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
