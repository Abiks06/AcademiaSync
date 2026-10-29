"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BookMarked, Check, Copy, ExternalLink, FileType2, Pencil } from "lucide-react";
import { formatReference } from "@/lib/library/format";
import { KIND_LABEL, type Source } from "@/lib/library/types";
import { sourceDetails, type SourceDetailsResult } from "@/app/(app)/projects/[projectId]/library/actions";
import { DURATION, EXIT, SPRING } from "@/components/motion/tokens";
import type { Editor } from "@tiptap/react";

type Details = Extract<SourceDetailsResult, { ok: true }>;

// Abstracts and who added a source, fetched once per version of a source per page. A
// failed fetch isn't kept, so hovering again tries again.
const details = new Map<string, Promise<Details | null>>();
function loadDetails(id: string, version: string) {
  const key = `${id}@${version}`;
  let pending = details.get(key);
  if (!pending) {
    const forget = () => {
      details.delete(key);
      return null;
    };
    pending = sourceDetails(id)
      .then((r) => (r.ok ? r : forget()))
      .catch(forget);
    details.set(key, pending);
  }
  return pending;
}

const WIDTH = 368;
const GAP = 8;

function byline(s: Source) {
  const names = s.authors.map((a) => [a.given, a.family].filter(Boolean).join(" "));
  if (names.length === 0) return null;
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
}

/**
 * What a citation points to, shown when you hover it or select it: the paper, its abstract,
 * the team's notes, and quick ways to open, copy or change it. Springs out of the citation
 * and follows it while the page scrolls.
 */
export function CitationCard({
  id,
  anchor,
  editor,
  sources,
  missing,
  projectId,
  onEdit,
  onPointerEnter,
  onPointerLeave,
  onEscape,
}: {
  id: string;
  anchor: RefObject<HTMLElement | null>;
  /** The card follows its citation as the text around it changes. */
  editor: Editor;
  sources: (Source | undefined)[];
  missing: boolean;
  projectId: string;
  onEdit: (() => void) | null;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** Escape inside the card: close it and go back to the text. */
  onEscape: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Where the card's edge facing the citation sits (its top when below, its bottom when
  // above), so a growing card grows away from the citation.
  const [place, setPlace] = useState<{ left: number; edge: number; below: boolean; originX: number } | null>(null);
  // The height the card is gliding to: its content's, up to the cap.
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    // The side the card first opens on, kept while it's open so it doesn't jump from
    // below to above as the abstract loads or the page scrolls.
    let side: boolean | undefined;
    const measure = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(WIDTH, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
      const cap = Math.min(window.innerHeight * 0.7, 512);
      // Content plus the 1px border on each side.
      const height = Math.min((content.current?.offsetHeight ?? 218) + 2, cap);
      side ??= r.bottom + GAP + height < window.innerHeight - 12 || r.top - GAP - height < 12;
      const below = side;
      setHeight(height);
      setPlace({ left, edge: below ? r.bottom + GAP : window.innerHeight - r.top + GAP, below, originX: r.left + r.width / 2 - left });
    };
    measure();
    // The abstract arrives after the card opens, and the card grows to fit it.
    const resize = new ResizeObserver(measure);
    if (content.current) resize.observe(content.current);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    editor.on("update", measure);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      editor.off("update", measure);
    };
  }, [anchor, editor]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onEscape();
  };

  const known = sources.filter((s): s is Source => Boolean(s));
  const shown = known.slice(0, 3);

  return createPortal(
    <motion.div
      ref={card}
      id={id}
      // Not modal: the text stays usable. Tab or Enter on the selected citation moves in here.
      role="dialog"
      aria-modal="false"
      aria-label="About this citation"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      initial={{ opacity: 0, scale: 0.92, y: place?.below === false ? 6 : -6, height: height ?? "auto" }}
      animate={{ opacity: place ? 1 : 0, scale: 1, y: 0, height: height ?? "auto" }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
      transition={{ ...SPRING.snappy, height: SPRING.gentle }}
      className="fixed z-50 max-h-[min(70dvh,32rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-panel-solid shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)]"
      style={{
        width: Math.min(WIDTH, typeof window === "undefined" ? WIDTH : window.innerWidth - 24),
        left: place?.left ?? -9999,
        ...(place?.below === false ? { bottom: place.edge } : { top: place?.edge ?? 0 }),
        transformOrigin: `${place?.originX ?? WIDTH / 2}px ${place?.below === false ? "100%" : "0%"}`,
      }}
    >
      <div ref={content}>
        {missing && (
          <p className="flex items-start gap-2 border-b border-line px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />A source cited here isn&apos;t in this project&apos;s library any more.
          </p>
        )}
        {shown.map((s, i) => (
          <SourceBlock key={s.id} source={s} projectId={projectId} divider={i > 0 || missing} />
        ))}
        {known.length > shown.length && (
          <p className="border-t border-line px-4 py-2.5 text-xs text-faint">and {known.length - shown.length} more in this citation</p>
        )}
        {onEdit && (
          <div className="border-t border-line p-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-iris-soft hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Change this citation
              <span className="ml-auto font-mono text-[10px] text-faint">add a page, more sources</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

function SourceBlock({ source: s, projectId, divider }: { source: Source; projectId: string; divider: boolean }) {
  const [info, setInfo] = useState<Details | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    void loadDetails(s.id, s.updated_at).then((d) => live && setInfo(d));
    return () => {
      live = false;
    };
  }, [s.id, s.updated_at]);

  const authors = byline(s);
  const where = [s.container, s.volume && `${s.volume}${s.issue ? `(${s.issue})` : ""}`, s.pages].filter(Boolean).join(", ");
  const doiHref = s.doi ? `https://doi.org/${s.doi}` : s.url;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatReference(s));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Copying was blocked; the reference is still in the library.
    }
  };

  return (
    <div className={`relative grid gap-2 px-4 py-3.5 ${divider ? "border-t border-line" : ""}`}>
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
        {KIND_LABEL[s.kind]}
        {s.year && <span className="text-iris">{s.year}</span>}
        {s.deleted_at && <span className="text-danger">Deleted from the library</span>}
      </p>
      <p className="font-serif text-[17px] leading-snug text-ink">{s.title}</p>
      {authors && <p className="text-xs text-muted">{authors}</p>}
      {where && <p className="text-xs italic text-faint">{where}</p>}

      {/* The shimmer fades into the abstract while the card grows to fit it. */}
      <AnimatePresence initial={false} mode="popLayout">
        {info === undefined ? (
          <motion.div key="loading" exit={{ opacity: 0, transition: EXIT }} className="grid gap-1.5" aria-hidden>
            <div className="shimmer h-2.5 w-full rounded-full bg-line" />
            <div className="shimmer h-2.5 w-4/5 rounded-full bg-line" />
          </motion.div>
        ) : (
          info?.abstract && (
            <motion.p key="abstract" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DURATION.base }} className="line-clamp-4 text-[13px] leading-relaxed text-muted">
              {info.abstract}
            </motion.p>
          )
        )}
      </AnimatePresence>
      {s.notes && (
        <p className="rounded-xl border border-amber/25 bg-amber/10 px-3 py-2 text-[13px] leading-relaxed text-ink">
          <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Team notes</span>
          <span className="line-clamp-4">{s.notes}</span>
        </p>
      )}
      {info?.addedBy && <p className="text-[11px] text-faint">Added by {info.addedBy}</p>}

      <div className="mt-1 flex flex-wrap gap-1.5">
        <Link
          href={`/projects/${projectId}/library?source=${s.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-iris hover:text-ink"
        >
          <BookMarked className="h-3 w-3" aria-hidden /> Open in library
        </Link>
        {info?.fileId && (
          <Link
            href={`/projects/${projectId}/files/${info.fileId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-iris hover:text-ink"
          >
            <FileType2 className="h-3 w-3" aria-hidden /> Open attached file
          </Link>
        )}
        {doiHref && (
          <a
            href={doiHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-iris hover:text-ink"
          >
            <ExternalLink className="h-3 w-3" aria-hidden /> {s.doi ? "Read the paper" : "Open link"}
          </a>
        )}
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-iris hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3 text-success" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? "Copied" : "Copy reference"}
        </button>
      </div>
    </div>
  );
}
