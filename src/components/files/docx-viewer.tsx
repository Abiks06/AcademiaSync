"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Shows a Word file as pages with docx-preview. The rendered pages go into a sandboxed frame
 * with scripts off, so nothing in a shared file (a "javascript:" link, embedded HTML) can run
 * in the app. Images are inlined as data URLs for the same reason.
 */
export function DocxViewer({ url, onError }: { url: string; onError: (message: string) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [height, setHeight] = useState(800);
  const frame = useRef<HTMLIFrameElement>(null);
  const report = useRef(onError);
  useEffect(() => {
    report.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ renderAsync }, res] = await Promise.all([import("docx-preview"), fetch(url)]);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.blob();
        const body = document.createElement("div");
        const style = document.createElement("div");
        await renderAsync(data, body, style, {
          inWrapper: true,
          ignoreLastRenderedPageBreak: true,
          useBase64URL: true,
          ignoreFonts: true,
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
          experimental: false,
        });
        if (cancelled) return;
        setHtml(
          `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">${style.innerHTML}` +
            `<style>html,body{margin:0;background:transparent}.docx-wrapper{background:transparent!important;padding:24px 0!important}` +
            `.docx-wrapper>section.docx{box-shadow:0 10px 40px -12px rgba(0,0,0,.45)!important;margin-bottom:16px!important}</style>` +
            `</head><body>${body.innerHTML}</body></html>`,
        );
      } catch {
        if (!cancelled) report.current("This Word file couldn't be shown here. Download it to open it in Word.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // The frame can't run scripts to report its size, so the page measures it once it loads.
  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(doc.documentElement.scrollHeight);
  };

  if (!html) {
    return (
      <div className="grid h-64 place-items-center text-muted">
        <Loader2 className="h-5 w-5 animate-spin text-iris" aria-label="Opening the Word file" />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <iframe
        ref={frame}
        title="Word document"
        // Same origin only so the page can measure it; scripts stay off.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={html}
        onLoad={measure}
        className="mx-auto block w-full min-w-[640px] border-0"
        style={{ height }}
      />
    </div>
  );
}
