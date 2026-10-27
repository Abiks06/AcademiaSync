"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { EXIT, SPRING } from "@/components/motion/tokens";

type Tone = "success" | "error" | "info";
export type ToastInput = {
  title: string;
  description?: string;
  tone?: Tone;
  /** One action, e.g. Undo. Clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen; hovering or focusing the toast pauses the countdown. */
  duration?: number;
};
type Toast = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Shows a short message at the bottom of the screen: `toast({ title: "Copied" })`. */
export function useToast() {
  const toast = useContext(ToastContext);
  // Outside the provider (tests, isolated stories) toasts are simply dropped.
  return toast ?? (() => {});
}

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const toast = useCallback((input: ToastInput) => {
    setToasts((list) => [...list, { ...input, id: next.current++ }].slice(-MAX_VISIBLE));
  }, []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;
const TONE_CLASS = { success: "text-success", error: "text-danger", info: "text-iris" } as const;

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = toast.tone ?? "info";
  const duration = toast.duration ?? (toast.action ? 8000 : 4500);
  const [paused, setPaused] = useState(false);
  const left = useRef(duration);
  const reduce = useReducedMotion();
  const Icon = ICONS[tone];

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(onDismiss, left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [paused, onDismiss]);

  return (
    <motion.div
      layout
      role={tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING.smooth }}
      exit={{ opacity: 0, y: 12, scale: 0.98, transition: EXIT }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-2xl border border-line-strong bg-panel-solid/95 px-4 py-3 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)] backdrop-blur-xl"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_CLASS[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{toast.description}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded-full bg-iris-soft px-3 py-1 text-xs font-semibold text-iris transition-colors hover:bg-iris hover:text-bg"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded-full p-1 text-faint transition-colors hover:text-ink">
        <X className="h-3.5 w-3.5" />
      </button>
      {!reduce && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-iris/60"
          style={{ animation: `toast-progress ${duration}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
        />
      )}
    </motion.div>
  );
}
