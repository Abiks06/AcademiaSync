"use client";

import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-tiptap/styles.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BookMarked, ChevronLeft, History, Lock, Quote, WifiOff } from "lucide-react";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider, useErrorListener, useThreads } from "@liveblocks/react/suspense";
import { AnchoredThreads, FloatingComposer, FloatingThreads, FloatingToolbar, Toolbar, useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { roomIdFor } from "@/lib/liveblocks/rooms";
import type { DocumentStatus } from "@/lib/supabase/types";
import { accentColor } from "@/components/app/accent";
import {
  resolveUsers,
  saveVersion,
  updateDocumentDetails,
} from "@/app/(app)/projects/[projectId]/documents/[documentId]/actions";
import { inTextLabel } from "@/lib/library/format";
import { collectCitations } from "@/lib/library/citations";
import type { Source } from "@/lib/library/types";
import { listSources } from "@/app/(app)/projects/[projectId]/library/actions";
import { SourceDialog } from "@/components/library/source-dialog";
import { Citation } from "./citation";
import { CitationPicker } from "./citation-picker";
import { ReferencesPanel } from "./references-panel";
import { SourcesContext } from "./sources-context";
import { PresenceStack } from "./presence";
import { SyncStatus } from "./sync-status";
import { VersionsPanel } from "./versions-panel";

export type WorkspaceProps = {
  document: { id: string; title: string; status: DocumentStatus };
  project: { id: string; name: string; accent: string };
  /** The project's library, for citing. */
  sources: Source[];
  canEdit: boolean;
  liveReady: boolean;
};

const STATUS_LABEL: Record<DocumentStatus, string> = { draft: "Draft", in_review: "In review", final: "Final" };
const AUTOSAVE_IDLE_MS = 45_000;

export function DocumentWorkspace(props: WorkspaceProps) {
  if (!props.liveReady) {
    return (
      <Notice
        title="Live editing isn't switched on yet"
        body="This server has no Liveblocks key. Add LIVEBLOCKS_SECRET_KEY to the environment and restart, and this page becomes a live editor."
        project={props.project}
      />
    );
  }

  return (
    <LiveblocksProvider
      authEndpoint={async (room) => {
        const res = await fetch("/api/liveblocks-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room }),
        });
        if (res.ok) return await res.json();
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        const reason = error ?? "Couldn't open this document.";
        return { error: res.status === 401 || res.status === 403 ? "forbidden" : "error", reason };
      }}
      resolveUsers={async ({ userIds }) => resolveUsers(userIds)}
    >
      <RoomProvider id={roomIdFor(props.document.id)}>
        <Shell {...props} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}

function Shell(props: WorkspaceProps) {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const markOpened = useCallback(() => setOpened(true), []);
  // Only connection failures matter here; a failed comment or similar must not take the page over.
  useErrorListener((error) => {
    if (error.context.type === "ROOM_CONNECTION_ERROR") setConnectionError(error.message);
  });

  // Never swap out an editor that's already open: unsynced text lives in it.
  if (connectionError && !opened) {
    return <Notice title="Couldn't open this manuscript" body={connectionError} project={props.project} />;
  }
  return (
    <>
      {connectionError && (
        <p role="alert" className="mx-auto mb-4 max-w-[78rem] rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Connection problem: {connectionError}. Keep this tab open, your text is still here and will sync when it can.
        </p>
      )}
      <ClientSideSuspense fallback={<EditorSkeleton />}>
        <Workspace {...props} onOpened={markOpened} />
      </ClientSideSuspense>
    </>
  );
}

function Workspace({ document, project, canEdit, sources: initialSources, onOpened }: WorkspaceProps & { onOpened: () => void }) {
  const accent = accentColor(project.accent);
  const liveblocks = useLiveblocksExtension({ field: "manuscript" });
  const [words, setWords] = useState(0);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [picker, setPicker] = useState<"closed" | "pick" | "add">("closed");
  const [sources, setSources] = useState(initialSources);
  const [cited, setCited] = useState<{ ids: string[]; count: number }>({ ids: [], count: 0 });
  const [checking, setChecking] = useState(false);
  const sourcesValue = useMemo(() => ({ byId: new Map(sources.map((s) => [s.id, s])), checking }), [sources, checking]);
  useEffect(onOpened, [onOpened]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      liveblocks,
      Citation,
      // The collaboration layer keeps its own history, so the built-in one must be off.
      StarterKit.configure({ undoRedo: false }),
      Placeholder.configure({ placeholder: "Start writing. Everyone in this project sees changes as you type." }),
    ],
    editorProps: {
      attributes: { class: "manuscript-prose", "aria-label": "Manuscript text", spellcheck: "true" },
    },
  });

  // Count words and take an idle snapshot, so history exists even if nobody presses Save.
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!editor) return;
    const countWords = () => setWords(editor.getText().split(/\s+/).filter(Boolean).length);
    const countCitations = () => setCited(collectCitations(editor.state.doc));
    countWords();
    countCitations();
    const onUpdate = () => {
      countWords();
      countCitations();
      if (!canEdit) return;
      clearTimeout(idle.current);
      idle.current = setTimeout(() => {
        void saveVersion({ documentId: document.id, content: editor.getJSON(), plainText: editor.getText(), auto: true });
      }, AUTOSAVE_IDLE_MS);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      clearTimeout(idle.current);
    };
  }, [editor, canEdit, document.id]);

  const cite = useCallback(
    (source: Source) => {
      setSources((prev) => (prev.some((s) => s.id === source.id) ? prev : [source, ...prev]));
      setPicker("closed");
      editor?.chain().focus().insertCitation({ sourceId: source.id, label: inTextLabel(source) }).run();
    },
    [editor],
  );

  // Co-authors add and remove sources while this tab is open. Catch up when the text cites
  // a source we haven't got, and whenever the tab comes back into view.
  const asked = useRef(new Set<string>());
  const refreshSources = useCallback(async () => {
    const result = await listSources(project.id);
    if (result.ok) setSources(result.sources);
  }, [project.id]);
  const unknownKey = cited.ids.filter((id) => !sources.some((s) => s.id === id)).sort().join(",");
  useEffect(() => {
    if (!unknownKey || asked.current.has(unknownKey)) return;
    asked.current.add(unknownKey);
    let live = true;
    setChecking(true);
    void refreshSources().finally(() => live && setChecking(false));
    return () => {
      live = false;
      setChecking(false);
    };
  }, [unknownKey, refreshSources]);
  useEffect(() => {
    const onVisible = () => {
      if (window.document.visibilityState === "visible") void refreshSources();
    };
    window.document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshSources]);

  // Mod-Shift-K opens the citation picker from anywhere in the editor.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPicker("pick");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  return (
    <SourcesContext.Provider value={sourcesValue}>
    <div className="mx-auto max-w-[78rem]">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6"
      >
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          {project.name}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <TitleField documentId={document.id} initial={document.title} canEdit={canEdit} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <PresenceStack />
            <SyncStatus />
            {canEdit && (
              <button
                onClick={() => setPicker("pick")}
                title="Cite a source (Ctrl/Cmd+Shift+K)"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong"
              >
                <Quote className="h-4 w-4 text-iris" /> Cite
              </button>
            )}
            <button
              onClick={() => setReferencesOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong"
            >
              <BookMarked className="h-4 w-4 text-iris" /> References
              {cited.ids.length > 0 && <span className="font-mono text-xs text-faint">{cited.ids.length}</span>}
            </button>
            <button
              onClick={() => setVersionsOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong"
            >
              <History className="h-4 w-4 text-iris" /> History
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-faint">
          <StatusSelect documentId={document.id} initial={document.status} canEdit={canEdit} />
          {!canEdit && (
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> You can read and comment on this manuscript
            </span>
          )}
          <span className="ml-auto font-mono">{words.toLocaleString()} {words === 1 ? "word" : "words"}</span>
        </div>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div className="glass relative min-h-[70dvh] rounded-2xl px-6 py-10 sm:px-14 sm:py-14">
          <div className="mx-auto max-w-[46rem]">
            <EditorContent editor={editor} />
            {editor && canEdit && <FloatingToolbar editor={editor} />}
            {editor && !canEdit && (
              // Readers can't format, but they can still comment on a selection.
              <FloatingToolbar editor={editor}>
                <Toolbar.Button name="Comment" onClick={() => editor.chain().focus().addPendingComment().run()} />
              </FloatingToolbar>
            )}
            {editor && <FloatingComposer editor={editor} style={{ width: 320 }} />}
          </div>
        </div>
        <Comments editor={editor} />
      </motion.div>

      <VersionsPanel
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        documentId={document.id}
        editor={editor}
        canEdit={canEdit}
      />

      {picker === "pick" && (
        <CitationPicker sources={sources} onPick={cite} onAddNew={() => setPicker("add")} onClose={() => setPicker("closed")} />
      )}
      {picker === "add" && (
        <SourceDialog projectId={project.id} onClose={() => setPicker("closed")} onSaved={cite} />
      )}
      <ReferencesPanel
        open={referencesOpen}
        onClose={() => setReferencesOpen(false)}
        citedIds={cited.ids}
        citationCount={cited.count}
        byId={sourcesValue.byId}
        documentTitle={document.title}
      />
    </div>
    </SourcesContext.Provider>
  );
}

function Comments({ editor }: { editor: Editor | null }) {
  const { threads } = useThreads();
  if (!editor) return null;
  return (
    <>
      <div className="hidden xl:block">
        <AnchoredThreads editor={editor} threads={threads} style={{ width: "100%" }} />
      </div>
      <div className="xl:hidden">
        <FloatingThreads editor={editor} threads={threads} />
      </div>
    </>
  );
}

function TitleField({ documentId, initial, canEdit }: { documentId: string; initial: string; canEdit: boolean }) {
  const [title, setTitle] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    const next = title.trim();
    if (next === saved) return setTitle(saved);
    if (!next) {
      setTitle(saved);
      return setError("A manuscript needs a title.");
    }
    setTitle(next);
    const result = await updateDocumentDetails({ documentId, title: next });
    if (result.ok) {
      setSaved(next);
      setError(null);
    } else {
      setTitle(saved);
      setError(result.error);
    }
  };

  return (
    <div className="min-w-0 flex-1 basis-80">
      <label htmlFor="doc-title" className="sr-only">Manuscript title</label>
      <input
        id="doc-title"
        value={title}
        readOnly={!canEdit}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-full rounded-lg bg-transparent px-1 py-0.5 font-serif text-3xl font-medium tracking-tight outline-none transition-shadow focus:shadow-[0_0_0_4px_var(--iris-soft)] sm:text-4xl"
      />
      {error && <p role="alert" className="mt-1 px-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

function StatusSelect({ documentId, initial, canEdit }: { documentId: string; initial: DocumentStatus; canEdit: boolean }) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return <span className="rounded-full bg-iris-soft px-2.5 py-0.5 font-medium text-iris">{STATUS_LABEL[status]}</span>;
  }
  return (
    <>
      <label htmlFor="doc-status" className="sr-only">Status</label>
      <select
        id="doc-status"
        value={status}
        onChange={async (e) => {
          const previous = status;
          const next = e.target.value as DocumentStatus;
          setStatus(next);
          const result = await updateDocumentDetails({ documentId, status: next });
          if (result.ok) setError(null);
          else {
            setStatus(previous);
            setError(result.error);
          }
        }}
        className="rounded-full border border-line bg-iris-soft px-2.5 py-0.5 text-xs font-medium text-iris outline-none focus:border-iris"
      >
        {(Object.keys(STATUS_LABEL) as DocumentStatus[]).map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </>
  );
}

function Notice({ title, body, project }: { title: string; body: string; project: { id: string; name: string } }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-24 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris">
        <WifiOff className="h-5 w-5" />
      </span>
      <h1 className="mt-5 font-serif text-3xl">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <Link href={`/projects/${project.id}`} className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">
        Back to {project.name}
      </Link>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-[78rem]" aria-busy="true" aria-label="Opening manuscript">
      <div className="shimmer h-5 w-40 rounded-lg bg-line" />
      <div className="shimmer mt-4 h-11 w-2/3 rounded-xl bg-line" />
      <div className="glass mt-10 min-h-[60dvh] rounded-2xl p-14">
        {[92, 100, 78, 96, 60].map((w, i) => (
          <div key={i} className="shimmer mb-4 h-3.5 rounded-full bg-line/70" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
