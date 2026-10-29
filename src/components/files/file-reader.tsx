"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BookMarked, ChevronLeft, Download, FileQuestion, Loader2 } from "lucide-react";
import { accentColor } from "@/components/app/accent";
import { canPreview, fileKind, formatBytes, KIND_NAME, type ProjectFile } from "@/lib/files/files";
import { fileLink } from "@/app/(app)/projects/[projectId]/files/actions";
import { KIND_ICON } from "./files-view";

// The viewers bring pdf.js and docx-preview, which only load when such a file is opened.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), { ssr: false });
const DocxViewer = dynamic(() => import("./docx-viewer").then((m) => m.DocxViewer), { ssr: false });

type Props = {
  project: { id: string; name: string; accent: string };
  file: ProjectFile;
  /** A short-lived link to the file in Storage. */
  url: string;
  source: { id: string; title: string } | null;
};

/** Opens a project file in the app: PDFs and Word files as pages, images and text as they are. */
export function FileReader({ project, file, url, source }: Props) {
  const kind = fileKind(file.mime_type);
  const Icon = KIND_ICON[kind];
  const [problem, setProblem] = useState<string | null>(canPreview(kind) ? null : `${KIND_NAME[kind]} files can't be shown here yet. Download it to open it.`);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const result = await fileLink(file.id, true);
      if (result.ok) window.location.assign(result.url);
      else setProblem(result.error);
    } catch {
      setProblem("Couldn't reach AcademiaSync. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col">
      <header className="glass sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <Link href={`/projects/${project.id}/files`} className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
          <span className="h-2 w-2 rounded-full" style={{ background: accentColor(project.accent) }} />
          Files
        </Link>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-iris-soft text-iris"><Icon className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-medium">{file.name}</h1>
          <p className="text-xs text-faint">{KIND_NAME[kind]} · {formatBytes(file.size_bytes)}</p>
        </div>
        {source && (
          <Link
            href={`/projects/${project.id}/library?source=${source.id}`}
            className="inline-flex max-w-xs items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-iris hover:text-ink"
            title={source.title}
          >
            <BookMarked className="h-3.5 w-3.5 shrink-0 text-iris" aria-hidden />
            <span className="truncate">{source.title}</span>
          </Link>
        )}
        <button
          onClick={() => void download()}
          disabled={downloading}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-4 text-sm transition-colors hover:border-line-strong disabled:opacity-60"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} Download original
        </button>
      </header>

      {problem ? (
        <div className="m-auto max-w-md p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris"><FileQuestion className="h-5 w-5" /></span>
          <p className="mt-4 text-muted" role="status">{problem}</p>
        </div>
      ) : kind === "pdf" ? (
        <PdfViewer url={url} onError={setProblem} />
      ) : kind === "word" ? (
        <DocxViewer url={url} onError={setProblem} />
      ) : kind === "image" ? (
        <div className="grid flex-1 place-items-center p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage link, not an optimisable asset */}
          <img src={url} alt={file.name} className="max-h-[80dvh] max-w-full rounded-lg shadow-lg" />
        </div>
      ) : (
        <TextFile url={url} onError={setProblem} />
      )}
    </div>
  );
}

function TextFile({ url, onError }: { url: string; onError: (message: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && onError("This file couldn't be shown here. Download it to open it."));
    return () => {
      cancelled = true;
    };
  }, [url, onError]);
  if (text === null) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-iris" aria-label="Opening the file" />
      </div>
    );
  }
  return <pre className="mx-auto w-full max-w-4xl flex-1 overflow-auto whitespace-pre-wrap p-6 font-mono text-sm leading-relaxed">{text}</pre>;
}
