"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRING } from "@/components/motion/tokens";

/** Supabase sends 6 to 8 digits, depending on the project's "Email OTP length" setting. */
const MIN = 6;
const MAX = 8;
/** After a typed (not pasted) 6th or 7th digit, how long to wait in case more are coming. */
const SETTLE_MS = 1200;

/**
 * Boxes for the code from the email: six, growing to eight if the code is longer. Underneath
 * is one ordinary input, so pasting, the phone's "From Mail" suggestion and password
 * managers all just work. Calls `onComplete` once the whole code is in: at once for a paste
 * or an 8-digit code, or after a short pause once 6 or 7 digits have been typed.
 */
export function CodeInput({
  name,
  disabled,
  invalid,
  onComplete,
}: {
  name: string;
  disabled?: boolean;
  invalid?: boolean;
  onComplete?: (code: string) => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reduce = useReducedMotion();
  const length = Math.max(MIN, value.length);

  useEffect(() => () => clearTimeout(settle.current), []);

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, MAX);
          const pasted = digits.length - value.length > 1;
          setValue(digits);
          clearTimeout(settle.current);
          if (digits.length === MAX || (pasted && digits.length >= MIN)) onComplete?.(digits);
          else if (digits.length >= MIN) settle.current = setTimeout(() => onComplete?.(digits), SETTLE_MS);
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
        maxLength={MAX}
        aria-label="Sign-in code from the email"
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
