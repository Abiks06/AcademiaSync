"use client";

import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-tiptap/styles.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, ChevronLeft, History, Lock, Quote, WifiOff } from "lucide-react";
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
  useOthers,
  useRoom,
  useStatus,
  useThreads,
} from "@liveblocks/react/suspense";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
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
import { CITATION_NODE, citationItems, citationMode, collectCitations, type CitationItem, type CitationMode } from "@/lib/library/citations";
import { CITATION_STYLES, STYLE_LABEL, citeContext, formatCitation, isCitationStyle, type CitationStyle } from "@/lib/library/styles";
import type { Source } from "@/lib/library/types";
import { useLibrarySync } from "@/lib/library/use-library-sync";
import { useRequestKey } from "@/lib/use-request-key";
import { SCHEMA_VERSION, canOpen, claimSchema, documentMeta, readStyle, writeStyle } from "@/lib/editor/schema-version";
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
  /** The project's library, for citing. Includes deleted sources, so citations of them still show. */
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
        try {
          const res = await fetch("/api/liveblocks-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room, schema: SCHEMA_VERSION }),
          });
          if (res.ok) return await res.json();
          const { error } = (await res.json().catch(() => ({}))) as { error?: string };
          const reason = error ?? "Couldn't open this document.";
          // Signed out, no access, or an outdated editor: retrying won't help. Anything else is retried.
          return { error: [401, 403, 409].includes(res.status) ? "forbidden" : "error", reason };
        } catch {
          return { error: "error", reason: "Couldn't reach AcademiaSync. Check your connection." };
        }
      }}
      resolveUsers={async ({ userIds }) => {
        try {
          return await resolveUsers(userIds);
        } catch {
          return userIds.map(() => undefined);
        }
      }}
    >
      <RoomProvider id={roomIdFor(props.document.id)} initialPresence={{ schema: SCHEMA_VERSION }}>
        <Shell {...props} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}

function Shell(props: WorkspaceProps) {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const markOpened = useCallback(() => setOpened(true), []);
  const status = useStatus();
  // Only connection failures matter here; a failed comment or similar must not take the page over.
  useErrorListener((error) => {
    if (error.context.type === "ROOM_CONNECTION_ERROR") setConnectionError(error.message);
  });
  // Once the connection is back, the warning has done its job.
  const [lastStatus, setLastStatus] = useState(status);
  if (status !== lastStatus) {
    setLastStatus(status);
    if (status === "connected") setConnectionError(null);
  }

  // Never swap out an editor that's already open: unsynced text lives in it.
  if (connectionError && !opened) {
    return <Notice title="Couldn't open this manuscript" body={connectionError} project={props.project} reload />;
  }
  return (
    <>
      {connectionError && (
        <p role="alert" className="mx-auto mb-4 max-w-[78rem] rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Connection problem: {connectionError}. Keep this tab open, your text is still here and will sync when it can.
        </p>
      )}
      <ClientSideSuspense fallback={<EditorSkeleton />}>
        <SchemaGate {...props} onOpened={markOpened} />
      </ClientSideSuspense>
    </>
  );
}

/**
 * Waits for the shared document, then opens the editor only if this tab understands it.
 * An editor meeting a node it doesn't know deletes it for everyone, so a tab older than the
 * document stops here and asks for a reload instead.
 */
function SchemaGate(props: WorkspaceProps & { onOpened: () => void }) {
  const room = useRoom();
  const [state, setState] = useState<"waiting" | "ok" | "newer">("waiting");
  const { canEdit } = props;

  useEffect(() => {
    const provider = getYjsProviderForRoom(room);
    const doc = provider.getYDoc();
    const check = () => {
      if (!provider.synced) return;
      if (!canOpen(doc)) return setState("newer");
      // Mark the document before this tab can add anything older tabs wouldn't understand.
      if (canEdit) claimSchema(doc);
      setState("ok");
    };
    check();
    provider.on("sync", check);
    const meta = documentMeta(doc);
    meta.observe(check);
    return () => {
      provider.off("sync", check);
      meta.unobserve(check);
    };
  }, [room, canEdit]);

  if (state === "waiting") return <EditorSkeleton />;
  if (state === "newer") {
    return (
      <Notice
        title="A newer version of AcademiaSync is out"
        body="Someone opened this manuscript with a newer version. Reload this page to keep working; nothing you wrote is lost."
        project={props.project}
        reload
      />
    );
  }
  return <Workspace {...props} />;
}

type PickerState = { mode: "closed" } | { mode: "pick"; initial?: { items: CitationItem[]; mode: CitationMode } } | { mode: "add" };

function Workspace({ document, project, canEdit, sources: initialSources, onOpened }: WorkspaceProps & { onOpened: () => void }) {
  const accent = accentColor(project.accent);
  const room = useRoom();
  const liveblocks = useLiveblocksExtension({ field: "manuscript" });
  const [words, setWords] = useState(0);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState>({ mode: "closed" });
  const [sources, setSources] = useState(initialSources);
  const [cited, setCited] = useState<{ ids: string[]; count: number }>({ ids: [], count: 0 });
  const [checking, setChecking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(onOpened, [onOpened]);

  // The citation style is shared live: when one author switches it, every citation changes for everyone.
  const doc = useMemo(() => getYjsProviderForRoom(room).getYDoc(), [room]);
  const [style, setStyle] = useState<CitationStyle>(() => {
    const value = readStyle(doc);
    return isCitationStyle(value) ? value : "apa";
  });
  useEffect(() => {
    const meta = documentMeta(doc);
    const onChange = () => {
      const value = readStyle(doc);
      setStyle(isCitationStyle(value) ? value : "apa");
    };
    meta.observe(onChange);
    return () => meta.unobserve(onChange);
  }, [doc]);

  // A tab on an older version can't show citations and would delete new ones, so while one
  // is open nobody adds or edits citations. It clears as soon as that tab reloads or leaves.
  const olderTabOpen = useOthers((others) => others.some((o) => (o.presence.schema ?? 0) < SCHEMA_VERSION));
  const canCite = canEdit && !olderTabOpen;

  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const live = useMemo(() => sources.filter((s) => !s.deleted_at), [sources]);
  const sourcesValue = useMemo(
    () => ({ byId, checking, cite: citeContext(style, cited.ids, (id) => byId.get(id)) }),
    [byId, checking, style, cited.ids],
  );

  const openPicker = useRef<() => void>(() => {});
  const canCiteRef = useRef(canCite);
  useEffect(() => {
    canCiteRef.current = canCite;
  }, [canCite]);

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
      // Typing "[@" opens the citation picker, as in Pandoc and most reference managers.
      handleTextInput: (view, from, to, text) => {
        if (text !== "@" || !canCiteRef.current || from < 1) return false;
        if (view.state.doc.textBetween(from - 1, from) !== "[") return false;
        view.dispatch(view.state.tr.delete(from - 1, to));
        openPicker.current();
        return true;
      },
    },
  });

  // Opening the picker with a citation selected edits that citation.
  const startCiting = useCallback(() => {
    if (!canCiteRef.current) return;
    const selected = (editor?.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined)?.node;
    if (selected?.type.name === CITATION_NODE) {
      setPicker({ mode: "pick", initial: { items: citationItems(selected.attrs), mode: citationMode(selected.attrs) } });
    } else {
      setPicker({ mode: "pick" });
    }
  }, [editor]);
  useEffect(() => {
    openPicker.current = startCiting;
  }, [startCiting]);

  // Count words and take an idle snapshot, so history exists even if nobody presses Save.
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!editor) return;
    const countWords = () => setWords(editor.getText().split(/\s+/).filter(Boolean).length);
    const countCitations = () =>
      setCited((prev) => {
        const next = collectCitations(editor.state.doc);
        return next.count === prev.count && next.ids.join() === prev.ids.join() ? prev : next;
      });
    countWords();
    countCitations();
    const onUpdate = () => {
      countWords();
      countCitations();
      if (!canEdit) return;
      clearTimeout(idle.current);
      idle.current = setTimeout(async () => {
        try {
          const result = await saveVersion({ documentId: document.id, content: editor.getJSON(), plainText: editor.getText(), auto: true });
          setSaveError(result.ok ? null : result.error);
        } catch {
          // Offline: the live document is safe in Liveblocks, and the next idle pause tries again.
        }
      }, AUTOSAVE_IDLE_MS);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      clearTimeout(idle.current);
    };
  }, [editor, canEdit, document.id]);

  const insert = useCallback(
    (items: CitationItem[], mode: CitationMode, extra?: Source) => {
      const lookup = (id: string) => (extra?.id === id ? extra : byId.get(id));
      const ids = [...cited.ids, ...items.map((i) => i.sourceId).filter((id) => !cited.ids.includes(id))];
      const label = formatCitation(items, mode, citeContext(style, ids, lookup));
      setPicker({ mode: "closed" });
      editor?.chain().focus().insertCitation({ items, mode, label }).run();
    },
    [editor, byId, cited.ids, style],
  );

  const onSourceAdded = useCallback(
    (source: Source) => {
      setSources((prev) => (prev.some((s) => s.id === source.id) ? prev : [source, ...prev]));
      insert([{ sourceId: source.id }], "parenthetical", source);
    },
    [insert],
  );

  // Co-authors add, edit and delete sources while this tab is open. Catch up when they do,
  // when the text cites a source we haven't got, and when the tab comes back into view.
  const asked = useRef(new Set<string>());
  const refreshSources = useCallback(async () => {
    try {
      const result = await listSources(project.id);
      if (result.ok) setSources(result.sources);
    } catch {
      // Offline; the next change or focus tries again.
    }
  }, [project.id]);
  useLibrarySync(project.id, refreshSources);
  const unknownKey = cited.ids.filter((id) => !byId.has(id)).sort().join(",");
  useEffect(() => {
    if (!unknownKey || asked.current.has(unknownKey)) return;
    asked.current.add(unknownKey);
    let active = true;
    setChecking(true);
    void refreshSources().finally(() => active && setChecking(false));
    return () => {
      active = false;
      setChecking(false);
    };
  }, [unknownKey, refreshSources]);

  // Mod-Shift-K opens the citation picker while writing, but not over another dialog or field.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k")) return;
      const target = e.target as HTMLElement | null;
      const inEditor = !!target?.closest(".ProseMirror");
      const elsewhere = !!target?.closest("input, textarea, select, [role=dialog]");
      if (!inEditor && elsewhere) return;
      e.preventDefault();
      startCiting();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, startCiting]);

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
                onClick={startCiting}
                disabled={!canCite}
                title={canCite ? "Cite a source (Ctrl/Cmd+Shift+K, or type [@)" : "Someone has this manuscript open in an older version. Citing resumes when they reload."}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-50"
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

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-faint">
          <StatusSelect documentId={document.id} initial={document.status} canEdit={canEdit} />
          <StyleSelect style={style} canEdit={canEdit} onChange={(next) => writeStyle(doc, next)} />
          {!canEdit && (
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> You can read and comment on this manuscript
            </span>
          )}
          {olderTabOpen && canEdit && (
            <span role="status" className="text-amber">Someone is on an older version, so citing is paused until they reload.</span>
          )}
          {saveError && <span role="alert" className="text-danger">History: {saveError}</span>}
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

      <AnimatePresence>
        {picker.mode === "pick" && (
          <CitationPicker
            sources={live}
            initial={picker.initial}
            onInsert={(items, mode) => insert(items, mode)}
            onAddNew={() => setPicker({ mode: "add" })}
            onClose={() => setPicker({ mode: "closed" })}
          />
        )}
        {picker.mode === "add" && (
          <AddSource projectId={project.id} onClose={() => setPicker({ mode: "closed" })} onSaved={onSourceAdded} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {referencesOpen && (
          <ReferencesPanel
            onClose={() => setReferencesOpen(false)}
            citedIds={cited.ids}
            citationCount={cited.count}
            documentTitle={document.title}
          />
        )}
      </AnimatePresence>
    </div>
    </SourcesContext.Provider>
  );
}

/** Adding a source from the editor, with its own idempotency key so a retry never adds it twice. */
function AddSource({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: (source: Source) => void }) {
  const [requestKey] = useRequestKey();
  return <SourceDialog projectId={projectId} requestId={requestKey} onClose={onClose} onSaved={onSaved} />;
}

function StyleSelect({ style, canEdit, onChange }: { style: CitationStyle; canEdit: boolean; onChange: (style: CitationStyle) => void }) {
  if (!canEdit) return <span className="rounded-full border border-line px-2.5 py-0.5">{STYLE_LABEL[style]}</span>;
  return (
    <>
      <label htmlFor="doc-style" className="sr-only">Citation style</label>
      <select
        id="doc-style"
        value={style}
        onChange={(e) => isCitationStyle(e.target.value) && onChange(e.target.value)}
        title="Citation style for this manuscript"
        className="rounded-full border border-line bg-bg-elev px-2.5 py-0.5 text-xs text-muted outline-none focus:border-iris"
      >
        {CITATION_STYLES.map((s) => (
          <option key={s} value={s}>{STYLE_LABEL[s]}</option>
        ))}
      </select>
    </>
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
    const result = await updateDocumentDetails({ documentId, title: next }).catch(() => ({
      ok: false as const,
      error: "Couldn't reach AcademiaSync, so the title wasn't saved. Try again.",
    }));
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
          const result = await updateDocumentDetails({ documentId, status: next }).catch(() => ({
            ok: false as const,
            error: "Couldn't reach AcademiaSync. Try again.",
          }));
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

function Notice({ title, body, project, reload }: { title: string; body: string; project: { id: string; name: string }; reload?: boolean }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-24 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris">
        <WifiOff className="h-5 w-5" />
      </span>
      <h1 className="mt-5 font-serif text-3xl">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <div className="mt-6 flex justify-center gap-2">
        {reload && (
          <button onClick={() => window.location.reload()} className="inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">
            Reload
          </button>
        )}
        <Link
          href={`/projects/${project.id}`}
          className={reload ? "inline-flex rounded-full border border-line px-5 py-2.5 text-sm" : "inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg"}
        >
          Back to {project.name}
        </Link>
      </div>
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
