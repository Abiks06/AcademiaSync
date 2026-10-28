"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRING } from "@/components/motion/tokens";

/**
 * Six boxes for the code from the email. Underneath is one ordinary input, so pasting,
 * the phone's "From Messages/Mail" suggestion and password managers all just work.
 * Calls `onComplete` once all six digits are in.
 */
export function CodeInput({
  name,
  length = 6,
  disabled,
  invalid,
  onComplete,
}: {
  name: string;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  onComplete?: (code: string) => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, length);
          setValue(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        onFocus={(e) => {
          setFocused(true);
          // A wrong code is easiest to fix by typing over it.
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        aria-label={`${length}-digit code from the email`}
        aria-invalid={invalid || undefined}
        autoFocus
        className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
      />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length }, (_, i) => {
          const ch = value[i];
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <div
              key={i}
              className={`relative grid h-14 place-items-center rounded-xl border bg-bg-elev font-mono text-2xl font-medium transition-[border-color,box-shadow] duration-150 ${
                invalid ? "border-danger/70" : active ? "border-iris shadow-[0_0_0_4px_var(--iris-soft)]" : ch ? "border-line-strong" : "border-line"
              }`}
            >
              {ch && (
                <motion.span
                  key={ch + i}
                  initial={reduce ? false : { y: 8, opacity: 0, color: "var(--iris)" }}
                  animate={{ y: 0, opacity: 1, color: "var(--ink)" }}
                  transition={{ y: SPRING.pop, opacity: { duration: 0.12 }, color: { duration: 1.2 } }}
                >
                  {ch}
                </motion.span>
              )}
              {active && !ch && <span className="caret-blink h-6 w-px bg-iris" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
