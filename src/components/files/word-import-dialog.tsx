"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatReference } from "@/lib/library/format";
import { useRequestKey } from "@/lib/use-request-key";
import type { ProjectFile } from "@/lib/files/files";
import {
  createManuscriptFromWord,
  previewWordImport,
  type ImportPreview,
  type ImportSourcePreview,
} from "@/app/(app)/projects/[projectId]/files/import-actions";

const NETWORK_ERROR = "Couldn't reach AcademiaSync. Check your connection and try again.";

/** What happens to each source: added as found ("new"), a library source ("lib:<id>"), or none ("text"). */
type Choice = string;

const GROUPS: { status: ImportSourcePreview["status"]; title: string; hint: string }[] = [
  { status: "unresolved", title: "Not found", hint: "Nothing reliable matched these. Pick a library source, or their citations stay as typed text." },
  { status: "suggested", title: "Please check", hint: "Crossref's best guess doesn't fully agree with the reference as typed. Use it only if it's the same work." },
  { status: "matched", title: "Found on Crossref", hint: "Same first author, year and title as the reference list. These will be added to the library." },
  { status: "new", title: "From the file's citations", hint: "Zotero, Mendeley, EndNote or Word stored the full reference. These will be added to the library." },
  { status: "library", title: "Already in the library", hint: "Citations will use the library's copy." },
];

const defaultChoice = (s: ImportSourcePreview): Choice =>
  s.libraryId && s.status !== "suggested" ? `lib:${s.libraryId}` : s.fields && (s.status === "new" || s.status === "matched") ? "new" : "text";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Turns a Word file from the shelf into a manuscript. The file is read on the server first;
 * this shows what was found, lets a person settle each source, and then creates the manuscript.
 */
export function WordImportDialog({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const ids = useId();
  const router = useRouter();
  const toast = useToast();
  const [requestKey] = useRequestKey();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    previewWordImport(file.id)
      .then((result) => {
        if (!live) return;
        if (!result.ok) return setMessage(result.error);
        setPreview(result.preview);
        setTitle(result.preview.title);
        setChoices(Object.fromEntries(result.preview.sources.map((s) => [s.key, defaultChoice(s)])));
      })
      .catch(() => live && setMessage(NETWORK_ERROR))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [file.id]);

  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, sources: preview?.sources.filter((s) => s.status === g.status) ?? [] })).filter((g) => g.sources.length > 0),
    [preview],
  );
  const adding = preview?.sources.filter((s) => choices[s.key] === "new").length ?? 0;
  const asText = preview?.sources.filter((s) => choices[s.key] === "text" && s.citations > 0).length ?? 0;

  const create = async () => {
    if (!preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const decisions = Object.fromEntries(
        preview.sources.map((s) => {
          const choice = choices[s.key] ?? "text";
          if (choice.startsWith("lib:")) return [s.key, { use: "library" as const, id: choice.slice(4) }];
          if (choice === "new" && s.fields) return [s.key, { use: "new" as const, fields: s.fields }];
          return [s.key, { use: "text" as const }];
        }),
      );
      const result = await createManuscriptFromWord({ fileId: file.id, requestId: requestKey, title, decisions });
      if (!result.ok) return setMessage(result.error);
      toast({
        tone: "success",
        title: "Manuscript created",
        description: [
          result.linked > 0 && `${plural(result.linked, "citation")} linked`,
          result.added > 0 && `${plural(result.added, "source")} added to the library`,
          result.asText > 0 && `${plural(result.asText, "citation")} kept as typed text`,
        ].filter(Boolean).join(", ") || undefined,
      });
      router.push(result.href);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const kept = preview
    ? [
        preview.kept.tables && plural(preview.kept.tables, "table"),
        preview.kept.figures && plural(preview.kept.figures, "figure"),
        preview.kept.equations && plural(preview.kept.equations, "equation"),
      ].filter(Boolean)
    : [];

  return (
    <Dialog onClose={onClose} labelledBy={`${ids}-title`} className="my-8 w-full max-w-3xl" dirty={preview !== null && !busy}>
      <div className="grid gap-5 rounded-2xl border border-line bg-bg-elev p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-iris-soft text-iris"><FileText className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 id={`${ids}-title`} className="font-serif text-2xl">Import as a manuscript</h2>
            <p className="mt-1 truncate text-sm text-muted">{file.name}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-iris-soft">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!preview && busy && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-line px-4 py-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-iris" aria-hidden />
            Reading the file and checking its references. A long reference list can take up to a minute.
          </div>
        )}

        {preview && (
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="h-10 rounded-xl border border-line bg-bg px-3 outline-none focus:border-iris"
              />
            </label>

            <p className="text-sm text-muted" role="status">
              {preview.origin === "none"
                ? "No citations were found, so the text comes in as it is."
                : `Found ${plural(preview.citations, "citation")} using ${plural(preview.sources.length, "source")}${
                    preview.origin === "typed" ? ", typed by hand and matched to the reference list" : ", made with a reference manager"
                  }.`}
              {kept.length > 0 && ` ${kept.join(", ")} can't be edited here yet, so each becomes a note pointing to the original file.`}
            </p>

            {groups.length > 0 && (
              <div className="grid max-h-[50vh] gap-4 overflow-y-auto pr-1">
                {groups.map((g) => (
                  <section key={g.status} aria-labelledby={`${ids}-${g.status}`} className="grid gap-2">
                    <div>
                      <h3 id={`${ids}-${g.status}`} className="text-sm font-semibold">
                        {g.title} <span className="font-normal text-faint">· {g.sources.length}</span>
                      </h3>
                      <p className="text-xs text-muted">{g.hint}</p>
                    </div>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {g.sources.map((s) => (
                        <SourceRow
                          key={s.key}
                          source={s}
                          library={preview.library}
                          choice={choices[s.key] ?? "text"}
                          onChoose={(choice) => setChoices((c) => ({ ...c, [s.key]: choice }))}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {preview.unmatched.length > 0 && (
              <details className="rounded-xl border border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer text-muted">
                  {plural(preview.unmatched.length, "citation")} didn&apos;t fit any reference and will stay as typed text
                </summary>
                <ul className="mt-2 grid gap-1 text-xs text-muted">
                  {preview.unmatched.map((text, i) => <li key={i}>{text}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {message && <p role="alert" className="text-sm text-danger">{message}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {preview && (
            <p className="mr-auto text-xs text-faint">
              {adding > 0 ? `${plural(adding, "source")} will be added to the library. ` : ""}
              {asText > 0 ? `${plural(asText, "source")} will stay as typed text.` : ""}
            </p>
          )}
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm text-muted hover:bg-iris-soft">Cancel</button>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !preview || !title.trim()}
            className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {busy && preview && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Create manuscript
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function SourceRow({
  source,
  library,
  choice,
  onChoose,
}: {
  source: ImportSourcePreview;
  library: ImportPreview["library"];
  choice: Choice;
  onChoose: (choice: Choice) => void;
}) {
  const found = source.fields && source.status !== "library" ? formatReference(source.fields) : null;
  const inLibrary = source.status === "library" && source.fields ? formatReference(source.fields) : null;
  return (
    <li className="grid gap-2 px-4 py-3 text-sm">
      {source.written && <p className={source.status === "library" || source.status === "matched" ? "text-muted" : ""}>{source.written}</p>}
      {!source.written && (found ?? inLibrary) && <p>{found ?? inLibrary}</p>}
      {source.written && found && (
        <p className="rounded-lg bg-iris-soft/50 px-3 py-2 text-xs">
          <span className="font-medium text-iris">Crossref: </span>
          {found}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
        <span>{source.citations === 0 ? "Not cited in the text" : `Cited ${plural(source.citations, "time")}`}</span>
        <select
          aria-label="What to do with this source"
          value={choice}
          onChange={(e) => onChoose(e.target.value)}
          className="ml-auto max-w-full rounded-lg border border-line bg-bg px-2 py-1 text-xs text-ink outline-none focus-visible:border-iris sm:max-w-80"
        >
          {source.fields && source.status !== "library" && <option value="new">{source.status === "new" ? "Add to the library" : "Add Crossref's record to the library"}</option>}
          <option value="text">Leave its citations as typed text</option>
          {library.length > 0 && (
            <optgroup label="Use a library source">
              {library.map((l) => (
                <option key={l.id} value={`lib:${l.id}`}>{l.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </li>
  );
}
