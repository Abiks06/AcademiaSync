"use client";

import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-tiptap/styles.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, ChevronLeft, Compass, Download, Eye, FileCode2, FileText, History, Lock, MoreHorizontal, PauseCircle, Plus, Printer, Quote, RefreshCw, WifiOff } from "lucide-react";
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
  useClient,
  useEventListener,
  useOthers,
  useRoom,
  useSelf,
  useStatus,
  useThreads,
  useUpdateMyPresence,
} from "@liveblocks/react/suspense";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { AnchoredThreads, FloatingComposer, FloatingThreads, FloatingToolbar, Toolbar, useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import type { Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "y-prosemirror";
import { roomIdFor } from "@/lib/liveblocks/rooms";
import { DURATION, EXIT, SPRING } from "@/components/motion/tokens";
import { Menu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { DocumentStatus } from "@/lib/supabase/types";
import { accentColor } from "@/components/app/accent";
import {
  resolveUsers,
  syncDocument,
  updateDocumentDetails,
} from "@/app/(app)/projects/[projectId]/documents/[documentId]/actions";
import { CITATION_NODE, citationItems, citationMode, collectCitations, type CitationItem, type CitationMode } from "@/lib/library/citations";
import { CITATION_STYLES, STYLE_LABEL, citeContext, formatCitation, isCitationStyle, type CitationStyle } from "@/lib/library/styles";
import type { Source } from "@/lib/library/types";
import { useLibrarySync } from "@/lib/library/use-library-sync";
import { useBibliography } from "@/lib/library/use-bibliography";
import { useRequestKey } from "@/lib/use-request-key";
import { SCHEMA_VERSION, canOpen, claimSchema, documentMeta, readStyle, writeStyle } from "@/lib/editor/schema-version";
import { listSources, lookupSource, saveSource } from "@/app/(app)/projects/[projectId]/library/actions";
import { SourceDialog } from "@/components/library/source-dialog";
import { SlashBridge, SlashCommands, type SlashState } from "@/lib/editor/slash-commands";
import { PasteBridge, SmartPaste, finishSmartPaste, pendingPosition } from "@/lib/editor/smart-paste";
import { identifierQuery, matchesIdentifier } from "@/lib/library/paste-identifier";
import type { Identifier } from "@/lib/library/lookup";
import { useModKey, usePaletteCommands, type PaletteCommand } from "@/components/app/command-palette";
import { SlashMenu } from "./slash-menu";
import { Citation, quietCitationsForAMoment } from "./citation";
import { CitationPicker } from "./citation-picker";
import { ReferencesPanel } from "./references-panel";
import { ReferencesSection } from "./references-section";
import { SourcesContext } from "./sources-context";
import { PresenceStack } from "./presence";
import { SyncStatus } from "./sync-status";
import { VersionsPanel } from "./versions-panel";
import { FollowBanner, FollowContext, MarginPresence, useFollowScroll, usePositionBroadcast } from "./follow";
import { Tour } from "./tour";

export type WorkspaceProps = {
  document: { id: string; title: string; status: DocumentStatus };
  project: { id: string; name: string; accent: string };
  /** The project's library, for citing. Includes deleted sources, so citations of them still show. */
  sources: Source[];
  canEdit: boolean;
  liveReady: boolean;
};

const STATUS_LABEL: Record<DocumentStatus, string> = { draft: "Draft", in_review: "In review", final: "Final" };
const SYNC_IDLE_MS = 20_000;
// The local Liveblocks dev server, for testing on a laptop. Production builds ignore it.
const LIVEBLOCKS_BASE_URL = process.env.NODE_ENV === "production" ? undefined : process.env.NEXT_PUBLIC_LIVEBLOCKS_BASE_URL || undefined;

export function DocumentWorkspace(props: WorkspaceProps) {
  const [signedOut, setSignedOut] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  if (!props.liveReady) {
    return (
      <Notice
        title="Live editing is unavailable right now"
        body="The manuscript can't be opened for editing on this server at the moment. Nothing is lost; try again a little later."
        project={props.project}
        icon="paused"
      />
    );
  }

  return (
    <LiveblocksProvider
      // Set only when running against the local Liveblocks dev server.
      baseUrl={LIVEBLOCKS_BASE_URL}
      authEndpoint={async (room) => {
        try {
          const res = await fetch("/api/liveblocks-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room, schema: SCHEMA_VERSION }),
          });
          setSignedOut(res.status === 401);
          setNoAccess(res.status === 403);
          if (res.ok) return await res.json();
          const { error } = (await res.json().catch(() => ({}))) as { error?: string };
          const reason = error ?? "Couldn't open this document.";
          // No access, or an outdated editor: retrying won't help. Anything else, including a
          // lapsed sign-in, is retried, so the tab reconnects once the person signs in again.
          return { error: res.status === 403 || res.status === 409 ? "forbidden" : "error", reason };
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
        <Shell {...props} signedOut={signedOut} noAccess={noAccess} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}

function Shell({ signedOut, noAccess, ...props }: WorkspaceProps & { signedOut: boolean; noAccess: boolean }) {
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

  // Removed from the project: the editor goes, since nothing typed here could be saved.
  if (noAccess) {
    return <Notice title="You no longer have access" body="You were removed from this project, or it was deleted. Ask an owner if you think this is a mistake." project={props.project} icon="lock" />;
  }
  // Never swap out an editor that's already open: unsynced text lives in it.
  if (signedOut && opened) {
    return (
      <>
        <p role="alert" className="mx-auto mb-4 max-w-[78rem] rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5 text-sm text-amber">
          Your sign-in has ended, so changes are waiting in this tab.{" "}
          <a href={`/sign-in?next=${encodeURIComponent(window.location.pathname)}`} target="_blank" rel="noopener" className="font-semibold underline">
            Sign in again in a new tab
          </a>{" "}
          and this one reconnects by itself. Don&apos;t close it until it says all changes are saved.
        </p>
        <ClientSideSuspense fallback={<EditorSkeleton />}>
          <SchemaGate {...props} onOpened={markOpened} />
        </ClientSideSuspense>
      </>
    );
  }
  if (signedOut) {
    return <Notice title="Your sign-in has ended" body="Sign in again to open this manuscript." project={props.project} signIn icon="lock" />;
  }
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
        icon="update"
      />
    );
  }
  return <Workspace {...props} />;
}

type PickerState = { mode: "closed" } | { mode: "pick"; initial?: { items: CitationItem[]; mode: CitationMode } } | { mode: "add" };

function Workspace({ document, project, canEdit, sources: initialSources, onOpened }: WorkspaceProps & { onOpened: () => void }) {
  const accent = accentColor(project.accent);
  const room = useRoom();
  const updatePresence = useUpdateMyPresence();
  const lastTyped = useRef(0);
  // Mentions are off: their nodes aren't in the manuscript schema, so versions holding them
  // couldn't be restored. Offline support keeps unsynced edits in the browser (IndexedDB).
  const liveblocks = useLiveblocksExtension({ field: "manuscript", mentions: false, offlineSupport_experimental: true });
  const [words, setWords] = useState(0);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState>({ mode: "closed" });
  const [sources, setSources] = useState(initialSources);
  const [cited, setCited] = useState<{ ids: string[]; count: number }>({ ids: [], count: 0 });
  const [checking, setChecking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const followValue = useMemo(() => ({ following, follow: setFollowing }), [following]);
  const [touring, setTouring] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(onOpened, [onOpened]);
  // Runs once, before the citations already in the text mount.
  useState(quietCitationsForAMoment);

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
  // Readers can't change the text, so their tabs don't count.
  const olderTabOpen = useOthers((others) => others.some((o) => o.canWrite && (o.presence.schema ?? 0) < SCHEMA_VERSION));
  const canCite = canEdit && !olderTabOpen;
  const othersHere = useOthers((others) => new Set(others.map((o) => o.id)).size);

  // An owner changed someone's access: get a fresh token (which fails if it was ours that
  // was removed) and reload the page data, so a new role takes effect straight away.
  const router = useRouter();
  const client = useClient();
  useEventListener(({ event, user }) => {
    // Only the server sends this (user is null then); a collaborator's tab can't fake it.
    if (event.type !== "access-changed" || user !== null) return;
    // logout() drops the cached token, so reconnecting has to ask the server again.
    client.logout();
    room.reconnect();
    router.refresh();
  });

  const byId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const live = useMemo(() => sources.filter((s) => !s.deleted_at), [sources]);
  // Any edit to a cited source (or deleting it) re-formats the reference list.
  const citedVersion = cited.ids.map((id) => `${byId.get(id)?.updated_at ?? ""}${byId.get(id)?.deleted_at ?? ""}`).join();
  const bib = useBibliography(project.id, cited.ids, style, citedVersion);
  // Set once the editor exists; citations call it to edit themselves from their hover card.
  const editCitation = useRef<((pos: number) => void) | null>(null);
  const sourcesValue = useMemo(
    () => ({
      byId,
      checking,
      cite: citeContext(style, cited.ids, (id) => byId.get(id)),
      projectId: project.id,
      editCitation: canCite ? (pos: number) => editCitation.current?.(pos) : null,
    }),
    [byId, checking, style, cited.ids, project.id, canCite],
  );

  const openPicker = useRef<() => void>(() => {});
  const [slash, setSlash] = useState<SlashState>(null);
  // The "/" menu's plugin lives outside React; this plain object is how the two talk.
  const [slashBridge] = useState(() => new SlashBridge());
  const bindSlashKeys = useCallback((handler: (e: KeyboardEvent) => boolean) => slashBridge.setKeyHandler(handler), [slashBridge]);
  const canCiteRef = useRef(canCite);
  // The paste plugin lives outside React too, and talks through its own bridge.
  const [pasteBridge] = useState(() => new PasteBridge());
  // What a screen reader hears about a pasted link: "Looking up…", then the outcome.
  const [pasteStatus, setPasteStatus] = useState("");
  const announce = useCallback((text: string) => setPasteStatus(text), []);
  useEffect(() => {
    canCiteRef.current = canCite;
    pasteBridge.setEnabled(canCite);
  }, [canCite, pasteBridge]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      liveblocks,
      Citation,
      // The collaboration layer keeps its own history, so the built-in one must be off.
      StarterKit.configure({ undoRedo: false }),
      Placeholder.configure({ placeholder: "Start writing, or type / for headings, lists and more. Everyone in this project sees changes as you type." }),
      SlashCommands.configure({
        extra: () => slashBridge.extra(),
        onChange: setSlash,
        onKeyDown: (event) => slashBridge.keys(event),
      }),
      SmartPaste.configure({ enabled: pasteBridge.enabled, onIdentifier: pasteBridge.handle }),
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

  // A role change arrives as new page data; the editor follows it without a reload.
  useEffect(() => {
    if (editor && editor.isEditable !== canEdit) editor.setEditable(canEdit);
  }, [editor, canEdit]);

  // Opening the picker with a citation selected edits that citation.
  const startCiting = useCallback(() => {
    if (!canCite) return;
    const selected = (editor?.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined)?.node;
    if (selected?.type.name === CITATION_NODE) {
      setPicker({ mode: "pick", initial: { items: citationItems(selected.attrs), mode: citationMode(selected.attrs) } });
    } else {
      setPicker({ mode: "pick" });
    }
  }, [editor, canCite]);
  useEffect(() => {
    openPicker.current = startCiting;
    slashBridge.setCite(canCite, startCiting);
    editCitation.current = (pos) => {
      editor?.chain().focus().setNodeSelection(pos).run();
      startCiting();
    };
  }, [startCiting, slashBridge, canCite, editor]);

  usePositionBroadcast(editor);

  // Opened from the sample project (?tour=1): start the tour once the page has settled.
  const [tourAsked] = useState(() => new URLSearchParams(window.location.search).get("tour") === "1");
  useEffect(() => {
    if (!tourAsked) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("tour");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    const timer = setTimeout(() => setTouring(true), 900);
    return () => clearTimeout(timer);
  }, [tourAsked]);

  const download = useExport(document.id, document.title);
  const mod = useModKey();
  const selfId = useSelf((me) => me.id);
  const people = useOthers((others) => {
    const seen = new Map<string, string>();
    // My own other tabs aren't someone to follow.
    for (const o of others) if (o.id && o.id !== selfId && !seen.has(o.id)) seen.set(o.id, o.info?.name ?? "Collaborator");
    return [...seen].map(([id, name]) => `${id}\u0000${name}`).join("\u0001");
  });
  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [];
    if (canCite) {
      list.push(
        { id: "cite", label: "Cite a source", hint: `${mod}+Shift+K`, keywords: "citation reference insert", icon: <Quote className="h-4 w-4" />, perform: startCiting },
        { id: "add-source", label: "Add a source and cite it", keywords: "doi arxiv pubmed new reference", icon: <Plus className="h-4 w-4" />, perform: () => setPicker({ mode: "add" }) },
      );
    }
    list.push(
      { id: "references", label: "Show references", keywords: "bibliography works cited", icon: <BookMarked className="h-4 w-4" />, perform: () => setReferencesOpen(true) },
      { id: "history", label: "Show version history", keywords: "versions restore compare snapshot", icon: <History className="h-4 w-4" />, perform: () => setVersionsOpen(true) },
      { id: "docx", label: "Export to Word", keywords: "download docx", icon: <FileText className="h-4 w-4" />, perform: () => void download("docx") },
      { id: "md", label: "Export to Markdown", keywords: "download pandoc overleaf", icon: <FileCode2 className="h-4 w-4" />, perform: () => void download("md") },
      { id: "tour", label: "Take the tour of the editor", keywords: "help guide tutorial", icon: <Compass className="h-4 w-4" />, perform: () => setTouring(true) },
    );
    for (const entry of people ? people.split("\u0001") : []) {
      const [id, name] = entry.split("\u0000");
      list.push({ id: `follow-${id}`, label: `Follow ${name}`, hint: "Scroll with them through the manuscript", keywords: "presence watch", icon: <Eye className="h-4 w-4" />, perform: () => setFollowing(id) });
    }
    return list;
  }, [canCite, startCiting, download, people, mod]);
  usePaletteCommands("Here", commands);

  // Count words, and after a pause ask the server to copy the live text into Supabase (and
  // take an automatic version when one is due), in case the webhook is off or behind.
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
    const onUpdate = ({ transaction }: { transaction: Transaction }) => {
      countWords();
      countCitations();
      // Only this person's own typing asks the server to save; a collaborator's change
      // reaches the server through their own editor.
      if (!canEdit || transaction.getMeta(ySyncPluginKey)) return;
      // Let collaborators see who is typing, at most once a second.
      const now = Date.now();
      if (transaction.docChanged && now - lastTyped.current > 1000) {
        lastTyped.current = now;
        updatePresence({ typingAt: now });
      }
      clearTimeout(idle.current);
      idle.current = setTimeout(async () => {
        try {
          const result = await syncDocument(document.id);
          setSaveError(result.ok ? null : result.error);
        } catch {
          // Offline: the live document is safe in Liveblocks, and the next idle pause tries again.
        }
      }, SYNC_IDLE_MS);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      clearTimeout(idle.current);
    };
  }, [editor, canEdit, document.id, updatePresence]);

  /** Inserts a citation at the cursor, or at `at` (where a DOI was pasted). */
  const insert = useCallback(
    (items: CitationItem[], mode: CitationMode, extra?: Source, at?: number) => {
      const lookup = (id: string) => (extra?.id === id ? extra : byId.get(id));
      const ids = [...cited.ids, ...items.map((i) => i.sourceId).filter((id) => !cited.ids.includes(id))];
      const label = formatCitation(items, mode, citeContext(style, ids, lookup));
      setPicker({ mode: "closed" });
      if (at === undefined) editor?.chain().focus().insertCitation({ items, mode, label }).run();
      else editor?.chain().insertContentAt(at, [{ type: CITATION_NODE, attrs: { items, mode, label } }, { type: "text", text: " " }]).run();
    },
    [editor, byId, cited.ids, style],
  );

  // A pasted DOI, arXiv or PubMed link: cite the library's copy if there is one, otherwise
  // look the paper up, add it to the library and cite it. If that fails, the link goes in
  // as the plain text that was pasted, so nothing is lost.
  useEffect(() => {
    pasteBridge.setHandler(async (ident: Identifier, pending: { id: string; text: string }) => {
      if (!editor) return;
      const land = (fn: (at: number) => void) => {
        // The person may have left the manuscript while the paper was looked up.
        if (editor.isDestroyed) return;
        const at = pendingPosition(editor.state, pending.id);
        finishSmartPaste(editor.view, pending.id);
        if (at !== null) fn(at);
      };
      const asText = (title: string, description: string) => {
        // A text node, so the link goes in exactly as pasted and isn't parsed as HTML.
        land((at) => editor.chain().insertContentAt(at, { type: "text", text: pending.text }).run());
        announce(`${title}. ${description}`);
        toast({ tone: "error", title, description });
      };
      const cite = (source: Source) => land((at) => insert([{ sourceId: source.id }], "parenthetical", source, at));

      announce(`Looking up ${pending.text}`);
      const existing = live.find((s) => matchesIdentifier(s, ident));
      if (existing) {
        cite(existing);
        return announce(`Cited ${existing.title}`);
      }
      try {
        const found = await lookupSource(identifierQuery(ident));
        if (!found.ok) return asText("Pasted as text", found.error);
        const saved = await saveSource({ projectId: project.id, requestId: crypto.randomUUID(), fields: found.source });
        if (!saved.ok) {
          // A co-author may have added it a moment ago.
          const fresh = await listSources(project.id, { abstracts: false });
          const theirs = fresh.ok ? fresh.sources.find((s) => !s.deleted_at && matchesIdentifier(s, ident)) : undefined;
          if (fresh.ok) setSources(fresh.sources);
          if (!theirs) return asText("Pasted as text", saved.error);
          cite(theirs);
          return announce(`Cited ${theirs.title}`);
        }
        setSources((prev) => (prev.some((s) => s.id === saved.source.id) ? prev : [saved.source, ...prev]));
        cite(saved.source);
        announce(`Cited ${saved.source.title}`);
        toast({
          tone: "success",
          title: "Added to the library and cited",
          description: saved.source.title.length > 90 ? `${saved.source.title.slice(0, 87)}…` : saved.source.title,
        });
      } catch {
        asText("Pasted as text", "Couldn't reach AcademiaSync to look the paper up. Check your connection and paste it again.");
      }
    });
  }, [editor, insert, live, project.id, toast, pasteBridge, announce]);

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
      const result = await listSources(project.id, { abstracts: false });
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
    <FollowContext.Provider value={followValue}>
    <FollowScroll editor={editor} />
    <div className="mx-auto max-w-[78rem]">
      <EditorBar
        project={project}
        accent={accent}
        title={document.title}
        actions={
          <>
            {canEdit && (
              <button
                onClick={startCiting}
                data-tour="cite"
                disabled={!canCite}
                title={canCite ? `Cite a source (${mod}+Shift+K, or type [@ or /cite)` : "Someone has this manuscript open in an older version. Citing resumes when they reload."}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong disabled:opacity-50"
              >
                <Quote className="h-4 w-4 text-iris" /> Cite
              </button>
            )}
            <button
              onClick={() => setReferencesOpen(true)}
              data-tour="references"
              className="hidden h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong md:inline-flex"
            >
              <BookMarked className="h-4 w-4 text-iris" /> References
              <RollingCount value={cited.ids.length} />
            </button>
            <ExportMenu documentId={document.id} title={document.title} className="hidden md:block" />
            <button
              onClick={() => setVersionsOpen(true)}
              data-tour="history"
              className="hidden h-9 items-center gap-2 rounded-full border border-line bg-bg-elev/70 px-3.5 text-sm transition-colors hover:border-line-strong md:inline-flex"
            >
              <History className="h-4 w-4 text-iris" /> History
            </button>
            <MoreMenu
              documentId={document.id}
              title={document.title}
              onReferences={() => setReferencesOpen(true)}
              onHistory={() => setVersionsOpen(true)}
              className="md:hidden"
            />
          </>
        }
      />

      <header className="mt-6 mb-6">
        <TitleField documentId={document.id} initial={document.title} canEdit={canEdit} />
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
      </header>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.base }}
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"
      >
        {/* Writing happens on solid paper, not glass. */}
        <div ref={page} data-tour="page" className="print-area relative min-h-[70dvh] rounded-2xl border border-line bg-panel-solid px-6 py-10 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.55)] sm:px-14 sm:py-14">
          <MarginPresence editor={editor} container={page} />
          <div className="mx-auto max-w-[46rem]">
            <h1 className="mb-8 hidden font-serif text-3xl print:block">{document.title}</h1>
            <EditorContent editor={editor} />
            {editor && canEdit && <FloatingToolbar editor={editor} />}
            {editor && !canEdit && (
              // Readers can't format, but they can still comment on a selection.
              <FloatingToolbar editor={editor}>
                <Toolbar.Button name="Comment" onClick={() => editor.chain().focus().addPendingComment().run()} />
              </FloatingToolbar>
            )}
            {editor && <FloatingComposer editor={editor} style={{ width: 320 }} />}
            {canEdit && <SlashMenu state={slash} bindKeys={bindSlashKeys} />}
            <ReferencesSection bib={bib} style={style} />
          </div>
        </div>
        <Comments editor={editor} />
      </motion.div>

      <AnimatePresence>
        {versionsOpen && (
          <VersionsPanel onClose={() => setVersionsOpen(false)} documentId={document.id} canEdit={canEdit} othersHere={othersHere} />
        )}
      </AnimatePresence>

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
            bib={bib}
            onClose={() => setReferencesOpen(false)}
            citedIds={cited.ids}
            citationCount={cited.count}
            documentTitle={document.title}
          />
        )}
      </AnimatePresence>
      <FollowBanner />
      <p role="status" aria-live="polite" className="sr-only">
        {pasteStatus}
      </p>
      {touring && <Tour onClose={() => setTouring(false)} />}
    </div>
    </FollowContext.Provider>
    </SourcesContext.Provider>
  );
}

/** Lives inside the follow context it reads. */
function FollowScroll({ editor }: { editor: Editor | null }) {
  useFollowScroll(editor);
  return null;
}

/** Downloads an export without leaving the editor; a failure is a toast, never a raw error page. */
function useExport(documentId: string, title: string) {
  const toast = useToast();
  return async (format: "docx" | "md") => {
    try {
      const res = await fetch(`/api/documents/${documentId}/export?format=${format}`);
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ tone: "error", title: "Export didn't work", description: error ?? "Try again in a moment." });
        return;
      }
      const blob = await res.blob();
      const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
      const link = window.document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = named ? decodeURIComponent(named) : `${title || "manuscript"}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      toast({ tone: "success", title: format === "docx" ? "Word file downloaded" : "Markdown downloaded" });
    } catch {
      toast({ tone: "error", title: "Couldn't reach AcademiaSync", description: "Check your connection and try again." });
    }
  };
}

/** Word and Markdown come from the server with citations and references in the document's style. */
function ExportMenu({ documentId, title, className }: { documentId: string; title: string; className?: string }) {
  const download = useExport(documentId, title);
  return (
    <Menu
      label="Export"
      className={className}
      trigger={<><Download className="h-4 w-4 text-iris" aria-hidden /> Export</>}
      items={[
        { label: "Word (.docx)", hint: "With citations and references", icon: <FileText className="h-4 w-4" />, onSelect: () => download("docx") },
        { label: "Markdown", hint: "For Pandoc or Overleaf", icon: <FileCode2 className="h-4 w-4" />, onSelect: () => download("md") },
        { label: "Print to PDF", hint: "Uses your browser's print dialog", icon: <Printer className="h-4 w-4" />, onSelect: () => window.print() },
      ]}
    />
  );
}

/** On phones, everything but Cite folds into one menu so the bar stays on one row. */
function MoreMenu({ documentId, title, onReferences, onHistory, className }: {
  documentId: string;
  title: string;
  onReferences: () => void;
  onHistory: () => void;
  className?: string;
}) {
  const download = useExport(documentId, title);
  return (
    <Menu
      label="More actions"
      className={className}
      trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
      items={[
        { label: "References", icon: <BookMarked className="h-4 w-4" />, onSelect: onReferences },
        { label: "History", icon: <History className="h-4 w-4" />, onSelect: onHistory },
        { label: "Export to Word", icon: <FileText className="h-4 w-4" />, onSelect: () => download("docx") },
        { label: "Export to Markdown", icon: <FileCode2 className="h-4 w-4" />, onSelect: () => download("md") },
        { label: "Print to PDF", icon: <Printer className="h-4 w-4" />, onSelect: () => window.print() },
      ]}
    />
  );
}

/** A count whose digits roll when it changes, e.g. how many sources the manuscript cites. */
function RollingCount({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className="relative inline-flex h-4 overflow-hidden font-mono text-xs text-faint" aria-label={`${value} cited`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={SPRING.snappy}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * The bar above the manuscript. It sticks while you write and, once the big title has
 * scrolled away, condenses and shows the title itself, so the tools and the save state
 * never scroll out of reach.
 */
function EditorBar({ project, accent, title, actions }: { project: { id: string; name: string }; accent: string; title: string; actions: React.ReactNode }) {
  const [condensed, setCondensed] = useState(false);
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.div
      layout
      transition={SPRING.gentle}
      className={`sticky top-[3.75rem] z-30 -mx-2 flex items-center gap-3 rounded-2xl border px-2 transition-[background-color,border-color,box-shadow] duration-300 lg:top-3 ${
        condensed
          ? "border-line bg-bg-elev/85 py-1.5 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.6)] backdrop-blur-xl"
          : "border-transparent bg-transparent py-1"
      }`}
    >
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
        <span className={`truncate ${condensed ? "hidden sm:inline" : ""}`}>{project.name}</span>
      </Link>
      <AnimatePresence initial={false}>
        {condensed && (
          <motion.span
            key="title"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: EXIT }}
            transition={SPRING.snappy}
            className="hidden min-w-0 truncate font-serif text-lg font-medium sm:block"
          >
            <span className="mr-2 text-faint">/</span>
            {title}
          </motion.span>
        )}
      </AnimatePresence>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="hidden sm:block" data-tour="presence">
          <PresenceStack compact={condensed} />
        </div>
        <SyncStatus compact={condensed} />
        {actions}
      </div>
    </motion.div>
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

type NoticeProps = {
  title: string;
  body: string;
  project: { id: string; name: string };
  reload?: boolean;
  signIn?: boolean;
  icon?: "offline" | "lock" | "update" | "paused";
};

const NOTICE_ICONS = { offline: WifiOff, lock: Lock, update: RefreshCw, paused: PauseCircle } as const;

function Notice({ title, body, project, reload, signIn, icon = "offline" }: NoticeProps) {
  const Icon = NOTICE_ICONS[icon];
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.smooth}
      className="mx-auto max-w-md py-24 text-center"
    >
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris">
        <Icon className="h-5 w-5" />
      </span>
      <h1 className="mt-5 font-serif text-3xl">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <div className="mt-6 flex justify-center gap-2">
        {signIn && (
          <a href={`/sign-in?next=${encodeURIComponent(window.location.pathname)}`} className="inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">
            Sign in
          </a>
        )}
        {reload && (
          <button onClick={() => window.location.reload()} className="inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">
            Reload
          </button>
        )}
        <Link
          href={`/projects/${project.id}`}
          className={reload || signIn ? "inline-flex rounded-full border border-line px-5 py-2.5 text-sm" : "inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg"}
        >
          Back to {project.name}
        </Link>
      </div>
    </motion.div>
  );
}

/** The same shape as the open editor, so nothing jumps when the manuscript arrives. */
function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-[78rem]" aria-busy="true" aria-label="Opening manuscript">
      <div className="flex h-11 items-center gap-3">
        <div className="shimmer h-5 w-40 rounded-lg bg-line" />
        <div className="ml-auto flex gap-2">
          {[96, 72, 92].map((w, i) => (
            <div key={i} className="shimmer h-9 rounded-full bg-line/70" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="shimmer mt-6 h-11 w-2/3 rounded-xl bg-line" />
      <div className="shimmer mt-4 h-4 w-48 rounded-full bg-line/60" />
      <div className="mt-6 min-h-[70dvh] rounded-2xl border border-line bg-panel-solid p-14">
        {[92, 100, 78, 96, 60].map((w, i) => (
          <div key={i} className="shimmer mb-4 h-3.5 rounded-full bg-line/70" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
