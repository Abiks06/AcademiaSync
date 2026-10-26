"use client";

import { createContext, useContext } from "react";
import type { Source } from "@/lib/library/types";

/** The project's library, by id, so citations in the text can show their current label. */
export const SourcesContext = createContext<{ byId: Map<string, Source> }>({ byId: new Map() });

export function useSources() {
  return useContext(SourcesContext);
}
