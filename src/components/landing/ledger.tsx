"use client";

import { motion } from "motion/react";
import { Reveal, RevealItem } from "@/components/motion/primitives";

// Example contributors for the marketing preview; CRediT role names are real.
const ROWS = [
  { name: "Ayomide O.", color: "var(--iris)", roles: { "Writing – original draft": 46, "Investigation": 30, "Formal analysis": 12 } },
  { name: "Mira K.", color: "var(--teal)", roles: { "Formal analysis": 38, "Visualization": 34, "Writing – review & editing": 14 } },
  { name: "J. Tunde", color: "var(--amber)", roles: { "Investigation": 44, "Data curation": 30 } },
  { name: "Dr. Mensah", color: "var(--rose)", roles: { "Supervision": 40, "Writing – review & editing": 26 } },
];

export function Ledger() {
  return (
    <section id="ledger" className="scroll-mt-24 px-4 py-28 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="grid items-end gap-6 md:grid-cols-2">
          <RevealItem>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-rose">Contribution ledger</p>
            <h2 className="mt-3 font-serif text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.05] font-medium">
              Authorship conversations, settled by evidence.
            </h2>
          </RevealItem>
          <RevealItem>
            <p className="text-lg text-muted">
              AcademiaSync quietly records who drafted, analysed, reviewed and sourced what, mapped to
              the CRediT roles journals ask for. Students get proof of their work. Leads get a fair
              author order.
            </p>
          </RevealItem>
        </Reveal>

        <div className="glass mt-12 rounded-2xl p-5 sm:p-8">
          <div className="flex flex-col gap-6">
            {ROWS.map((row, r) => {
              const total = Object.values(row.roles).reduce((a, b) => a + b, 0);
              return (
                <div key={row.name} className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                    {row.name}
                  </div>
                  <div className="flex h-9 w-full gap-1 overflow-hidden rounded-lg">
                    {Object.entries(row.roles).map(([role, v], i) => (
                      <motion.div
                        key={role}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(v / 100) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: r * 0.12 + i * 0.08, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                        className="flex min-w-0 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium whitespace-nowrap text-bg"
                        style={{ background: row.color, opacity: 1 - i * 0.22 }}
                        title={`${role}: ${Math.round((v / total) * 100)}% of ${row.name}'s activity`}
                      >
                        <span className="truncate">{role}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs text-faint">Example project. Bars show share of tracked activity by CRediT role.</p>
        </div>
      </div>
    </section>
  );
}
