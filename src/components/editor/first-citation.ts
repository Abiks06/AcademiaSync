"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { clearHighlight, setHighlight } from "@/lib/editor/highlight";

/**
 * The first citation in a manuscript draws its thread to the margin on its own, once, with a
 * small caption, so people discover where the threads come from. Manuscripts that already
 * had citations when they were opened never show it.
 */
export function useFirstCitation(editor: Editor | null, cited: string[], quietUntil: number) {
  const [caption, setCaption] = useState<string | null>(null);
  const count = useRef(cited.length);
  useEffect(() => {
    count.current = cited.length;
  }, [cited.length]);
  // Armed only once the manuscript has finished loading with no citations in it.
  const armed = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      armed.current = count.current === 0;
    }, Math.max(0, quietUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [quietUntil]);

  const first = cited[0];
  useEffect(() => {
    if (!editor || !first || !armed.current) return;
    armed.current = false;
    let anchor: Element | null = null;
    // Give the margin a moment to place its card before the thread reaches for it.
    const start = setTimeout(() => {
      anchor = editor.view.dom.querySelector(`[data-source-ids~="${CSS.escape(first)}"]`);
      if (!anchor) return;
      setHighlight({ sourceId: first, from: "text", anchor });
      setCaption("Your first source. The thread shows where this claim comes from.");
    }, 500);
    const end = setTimeout(() => {
      if (anchor) clearHighlight(anchor);
      setCaption(null);
    }, 4200);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
      if (anchor) clearHighlight(anchor);
      setCaption(null);
    };
  }, [editor, first]);

  return caption;
}
