"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import "./pdf-viewer.css";

type Size = { width: number; height: number };

/** pdf.js is large, so it loads only when a PDF is opened. */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/**
 * Reads a PDF with pdf.js: crisp pages at any zoom, with real text that can be selected,
 * copied and found with the browser's search. Pages render as they scroll into view.
 */
export function PdfViewer({ url, onError }: { url: string; onError: (message: string) => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  // 1 = the page fits the reader's width.
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const report = useRef(onError);
  useEffect(() => {
    report.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        // A shared file is someone else's file: no scripts, no forms.
        const loading = pdfjs.getDocument({ url, enableXfa: false });
        task = loading;
        const loaded = await loading.promise;
        if (cancelled) return;
        const pages = await Promise.all(Array.from({ length: loaded.numPages }, (_, i) => loaded.getPage(i + 1)));
        if (cancelled) return;
        setSizes(pages.map((p) => p.getViewport({ scale: 1 })).map((v) => ({ width: v.width, height: v.height })));
        setDoc(loaded);
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string }).name;
        report.current(name === "PasswordException" ? "This PDF is password-protected, so it can't be shown here. Download it to open it." : "This PDF couldn't be opened here. Download it to open it on your computer.");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const widest = Math.max(1, ...sizes.map((s) => s.width));
  // Fit-to-width at zoom 1, never wider than a comfortable reading size.
  const scale = width ? (Math.min(width, 980) / widest) * zoom : 0;

  useEffect(() => {
    const el = frame.current;
    if (!el || !doc) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setCurrent(Number((visible.target as HTMLElement).dataset.page));
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    el.querySelectorAll("[data-page]").forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [doc, scale]);

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 0.001);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? ZOOMS.length - 1 : i) + dir))]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mt-3 flex items-center justify-center gap-2 px-3 py-1 text-sm">
        <span className="font-mono text-xs text-muted" aria-live="polite">
          {doc ? `Page ${current} of ${doc.numPages}` : "Opening…"}
        </span>
        <span className="mx-2 h-4 w-px bg-line" aria-hidden />
        <button onClick={() => step(-1)} disabled={!doc} aria-label="Zoom out" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-iris-soft hover:text-ink disabled:opacity-40">
          <Minus className="h-4 w-4" />
        </button>
        <button onClick={() => setZoom(1)} disabled={!doc} className="min-w-14 rounded-full px-2 py-1 font-mono text-xs text-muted hover:bg-iris-soft hover:text-ink">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => step(1)} disabled={!doc} aria-label="Zoom in" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-iris-soft hover:text-ink disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div ref={frame} className="flex-1 overflow-x-auto py-4">
        {!doc && (
          <div className="grid h-64 place-items-center text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-iris" aria-label="Opening the PDF" />
          </div>
        )}
        {doc && scale > 0 && (
          <div className="mx-auto flex w-max flex-col items-center gap-4">
            {sizes.map((size, i) => (
              <PdfPage key={i} doc={doc} number={i + 1} size={size} scale={scale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({ doc, number, size, scale }: { doc: PDFDocumentProxy; number: number; size: Size; scale: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(number <= 2);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    let layer: { cancel: () => void } | null = null;
    (async () => {
      const [pdfjs, page] = await Promise.all([loadPdfJs(), doc.getPage(number)]);
      if (cancelled || !canvas.current || !text.current) return;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      task = page.render({ canvas: c, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise.catch(() => {});
      if (cancelled) return;
      text.current.replaceChildren();
      const textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text.current, viewport });
      layer = textLayer;
      await textLayer.render().catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [near, doc, number, scale]);

  const width = Math.floor(size.width * scale);
  const height = Math.floor(size.height * scale);
  return (
    <div
      ref={box}
      data-page={number}
      className={`as-pdf-page relative bg-white shadow-[0_10px_40px_-12px_rgba(0,0,0,0.45)]`}
      style={{ width, height, ["--scale-factor" as string]: scale }}
      aria-label={`Page ${number}`}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div ref={text} className="textLayer" />
    </div>
  );
}
