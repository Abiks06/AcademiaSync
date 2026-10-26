"use client";

import { createContext, useContext } from "react";
import type { Source } from "@/lib/library/types";
import { citeContext, type CiteContext } from "@/lib/library/styles";

/**
 * The project's library, by id, so citations in the text can show their current label.
 * `checking` is true while the editor is catching up with the library, so a citation of a
 * source a co-author just added isn't flagged as missing before the editor has seen it.
 * `cite` holds the document's style and the numbering of everything it cites.
 */
export const SourcesContext = createContext<{ byId: Map<string, Source>; checking: boolean; cite: CiteContext }>({
  byId: new Map(),
  checking: false,
  cite: citeContext("apa", [], () => undefined),
});

export function useSources() {
  return useContext(SourcesContext);
}
