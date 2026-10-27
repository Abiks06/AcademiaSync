"use client";

import { AnimatePresence, motion } from "motion/react";
import { STYLE_LABEL, type CitationStyle } from "@/lib/library/styles";
import type { BibliographyState } from "@/lib/library/use-bibliography";

/**
 * The reference list at the end of the manuscript, built from its citations. It sits
 * outside the editable text, so nobody can change it by accident; fix a reference by
 * editing the source in the library.
 */
export function ReferencesSection({ bib, style }: { bib: BibliographyState; style: CitationStyle }) {
  if (bib.entries.length === 0 && !bib.loading) return null;
  return (
    <section aria-labelledby="manuscript-references" className="mt-14 border-t border-line pt-8" contentEditable={false}>
      <div className="flex items-baseline gap-3">
        <h2 id="manuscript-references" className="font-serif text-2xl">References</h2>
        <span className="text-xs text-faint">{STYLE_LABEL[style]} · built from your citations</span>
        {bib.loading && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-iris" aria-label="Updating" />}
      </div>
      {bib.error && <p role="alert" className="mt-3 text-sm text-danger">{bib.error}</p>}
      <ol className="csl-bibliography mt-4 space-y-3 text-[0.95rem] leading-relaxed">
        <AnimatePresence initial={false}>
          {bib.entries.map((entry) => (
            <motion.li
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pl-8 -indent-8"
              // Sanitised on the server to a few formatting tags without attributes.
              dangerouslySetInnerHTML={{ __html: entry.html }}
            />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
