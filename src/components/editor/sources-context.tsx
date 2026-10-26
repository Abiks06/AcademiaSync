"use client";

import { createContext, useContext } from "react";
import type { Source } from "@/lib/library/types";

/**
 * The project's library, by id, so citations in the text can show their current label.
 * `checking` is true while the editor is catching up with the library, so a citation of a
 * source a co-author just added isn't flagged as deleted before the editor has seen it.
 */
export const SourcesContext = createContext<{ byId: Map<string, Source>; checking: boolean }>({
  byId: new Map(),
  checking: false,
});

export function useSources() {
  return useContext(SourcesContext);
}
