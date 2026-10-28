"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookMarked, CornerDownLeft, FileText, FlaskConical, FolderKanban, Loader2, LogOut, Plus, Quote, Search, Volume2, VolumeX, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { EXIT, SPRING } from "@/components/motion/tokens";
import { paletteIndex, type PaletteIndex } from "@/app/(app)/palette-actions";
import { createSampleProject } from "@/app/(app)/projects/sample-actions";
import { rank } from "@/lib/palette/match";
import { setSoundsOn, useSoundsOn } from "@/lib/sound";
import { accentColor } from "./accent";

/** Something the palette can do. Pages add their own while they're open, e.g. "Cite a source" in the editor. */
export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** Extra words that find this command, e.g. "bibliography" for References. */
  keywords?: string;
  perform: () => void;
};

type Item = {
  key: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: ReactNode;
  run: () => void;
};

type Ctx = { open: () => void; register: (key: string, commands: PaletteCommand[], group: string) => () => void };
const PaletteContext = createContext<Ctx | null>(null);

/** Opens the palette from a button. */
export function usePalette() {
  return useContext(PaletteContext)?.open ?? (() => {});
}

/** Adds commands to the palette while the calling component is mounted. Pass a memoised list. */
export function usePaletteCommands(group: string, commands: PaletteCommand[]) {
  const ctx = useContext(PaletteContext);
  const key = useId();
  useEffect(() => ctx?.register(key, commands, group), [ctx, key, commands, group]);
}

const subscribeNothing = () => () => {};
/** "⌘" on a Mac, "Ctrl" elsewhere. The server can't know, so it renders "Ctrl". */
export function useModKey() {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

const GROUP_ORDER = ["Here", "Actions", "Manuscripts", "Projects", "Sources", "Libraries"];
const PER_GROUP = { Manuscripts: 6, Projects: 5, Sources: 8, Libraries: 4 } as Record<string, number>;

/**
 * ⌘K (Ctrl+K) from anywhere in the app: jump to any project, manuscript or source, or run
 * an action. Results come from the person's own projects, loaded when the palette first
 * opens and refreshed each time it opens again.
 */
export function PaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState<Record<string, { group: string; commands: PaletteCommand[] }>>({});

  const register = useCallback((key: string, commands: PaletteCommand[], group: string) => {
    setRegistered((r) => ({ ...r, [key]: { group, commands } }));
    return () =>
      setRegistered((r) => {
        const next = { ...r };
        delete next[key];
        return next;
      });
  }, []);
  const value = useMemo(() => ({ open: () => setOpen(true), register }), [register]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k")) return;
      // Another dialog is in charge of the keyboard; the palette waits its turn. The tour
      // steps aside for it (it closes itself on this key).
      const dialog = document.querySelector('[role="dialog"]:not([data-palette]):not([data-palette-over])');
      if (dialog && !open) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <AnimatePresence>{open && <Palette onClose={() => setOpen(false)} registered={registered} />}</AnimatePresence>
    </PaletteContext.Provider>
  );
}

// Kept between openings, so the second ⌘K shows results at once while they refresh.
let cachedIndex: PaletteIndex | null = null;

function Palette({ onClose, registered }: { onClose: () => void; registered: Record<string, { group: string; commands: PaletteCommand[] }> }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<PaletteIndex | null>(cachedIndex);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The highlighted row, by key, so it stays put when results arrive or reorder.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const listContent = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = listContent.current;
    if (!el) return;
    const resize = new ResizeObserver(() => setListHeight(el.offsetHeight));
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  const listId = useId();
  // One sample project per opening of the palette, however many times it's chosen.
  const [sampleRequest] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let live = true;
    paletteIndex()
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          cachedIndex = result.index;
          setIndex(result.index);
          setLoadError(null);
        } else setLoadError(result.error);
      })
      .catch(() => live && setLoadError("Couldn't reach AcademiaSync, so only actions are listed."));
    return () => {
      live = false;
    };
  }, []);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const soundsOn = useSoundsOn();
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const [key, { group, commands }] of Object.entries(registered)) {
      for (const c of commands) {
        out.push({
          key: `${key}:${c.id}`,
          group: group || "Here",
          label: c.label,
          hint: c.hint,
          keywords: c.keywords,
          icon: c.icon ?? <Quote className="h-4 w-4" />,
          run: () => {
            onClose();
            // Let the palette's exit start before the command opens anything of its own.
            requestAnimationFrame(() => c.perform());
          },
        });
      }
    }
    out.push(
      {
        key: "new-project",
        group: "Actions",
        label: "New project",
        keywords: "create start",
        icon: <Plus className="h-4 w-4" />,
        run: () => {
          if (window.location.pathname === "/projects") {
            onClose();
            window.dispatchEvent(new Event("academiasync:new-project"));
          } else go("/projects?new=1");
        },
      },
      {
        key: "sample",
        group: "Actions",
        label: "Explore a sample project",
        hint: "A short example paper with sources and citations",
        keywords: "demo example tour tutorial",
        icon: <FlaskConical className="h-4 w-4" />,
        run: async () => {
          setBusy("sample");
          try {
            const result = await createSampleProject(sampleRequest);
            if (!result.ok) {
              toast({ tone: "error", title: "Couldn't create the sample project", description: result.error });
              return;
            }
            go(result.href);
          } catch {
            toast({ tone: "error", title: "Couldn't reach AcademiaSync", description: "Check your connection and try again." });
          } finally {
            setBusy(null);
          }
        },
      },
      { key: "all", group: "Actions", label: "All projects", keywords: "home dashboard", icon: <FolderKanban className="h-4 w-4" />, run: () => go("/projects") },
      {
        key: "sounds",
        group: "Actions",
        label: soundsOn ? "Turn sounds off" : "Turn sounds on",
        hint: "A soft paper tap on save, a pen click when you cite",
        keywords: "audio sound effects mute quiet",
        icon: soundsOn ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />,
        run: () => {
          setSoundsOn(!soundsOn);
          toast({ tone: "success", title: soundsOn ? "Sounds off" : "Sounds on" });
          onClose();
        },
      },
      {
        key: "sign-out",
        group: "Actions",
        label: "Sign out",
        keywords: "log out logout",
        icon: <LogOut className="h-4 w-4" />,
        run: () => {
          const form = document.createElement("form");
          form.method = "post";
          form.action = "/auth/sign-out";
          document.body.append(form);
          form.submit();
        },
      },
    );
    if (index) {
      const projectName = new Map(index.projects.map((p) => [p.id, p.name]));
      for (const d of index.documents) {
        out.push({
          key: `doc:${d.id}`,
          group: "Manuscripts",
          label: d.title,
          hint: projectName.get(d.projectId),
          keywords: projectName.get(d.projectId),
          icon: <FileText className="h-4 w-4" />,
          run: () => go(`/projects/${d.projectId}/documents/${d.id}`),
        });
      }
      for (const p of index.projects) {
        const dot = <span className="h-2.5 w-2.5 rounded-full" style={{ background: accentColor(p.accent) }} />;
        out.push({ key: `project:${p.id}`, group: "Projects", label: p.name, hint: p.field ?? undefined, keywords: p.field ?? "", icon: dot, run: () => go(`/projects/${p.id}`) });
        out.push({
          key: `library:${p.id}`,
          group: "Libraries",
          label: `${p.name} library`,
          keywords: "references sources bibliography",
          icon: <BookMarked className="h-4 w-4" />,
          run: () => go(`/projects/${p.id}/library`),
        });
      }
      for (const s of index.sources) {
        out.push({
          key: `source:${s.id}`,
          group: "Sources",
          label: s.title,
          hint: [s.byline, projectName.get(s.projectId)].filter(Boolean).join(" · "),
          keywords: s.byline,
          icon: <BookMarked className="h-4 w-4" />,
          run: () => go(`/projects/${s.projectId}/library?source=${s.id}`),
        });
      }
    }
    return out;
  }, [registered, index, go, onClose, toast, sampleRequest, soundsOn]);

  const shown = useMemo(() => {
    const groups = new Map<string, Item[]>();
    if (!query.trim()) {
      // Before typing: what this page offers, the actions, and where you were lately.
      const limits: Record<string, number> = { Manuscripts: 5, Projects: 4 };
      for (const item of items) {
        if (item.group === "Sources" || item.group === "Libraries") continue;
        const list = groups.get(item.group) ?? [];
        if (list.length < (limits[item.group] ?? 99)) list.push(item);
        groups.set(item.group, list);
      }
    } else {
      for (const item of rank(items, query, (i) => ({ label: i.label, keywords: `${i.keywords ?? ""} ${i.hint ?? ""}` }), 200)) {
        const list = groups.get(item.group) ?? [];
        if (list.length < (PER_GROUP[item.group] ?? 6)) list.push(item);
        groups.set(item.group, list);
      }
    }
    return [...groups.entries()]
      .filter(([, list]) => list.length > 0)
      .sort(([a], [b]) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
  }, [items, query]);
  const flat = useMemo(() => shown.flatMap(([, list]) => list), [shown]);
  const position = useMemo(() => new Map(flat.map((item, i) => [item.key, i])), [flat]);

  // A new query starts at the top.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActiveKey(null);
  }
  const current = (activeKey !== null ? position.get(activeKey) : undefined) ?? 0;
  const setActive = (i: number) => setActiveKey(flat[i]?.key ?? null);
  // While a command is working (making the sample project, say), nothing else runs.
  const run = (item: Item | undefined) => {
    if (!item || busy) return;
    item.run();
  };

  const currentKey = flat[current]?.key;
  useEffect(() => {
    if (currentKey) list.current?.querySelector(`[data-key="${CSS.escape(currentKey)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentKey]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(flat.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === "Enter") {
      // Enter that confirms an input method's word (Japanese, Chinese…) isn't a choice.
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      run(flat[current]);
    }
  };

  return (
    <Dialog onClose={onClose} label="Search and commands" variant="top" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-panel-solid shadow-[0_40px_120px_-40px_rgb(0_0_0/0.8)]">
      <div data-palette className="contents">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-iris" aria-hidden />
          <label htmlFor="palette-input" className="sr-only">Search projects, manuscripts and sources</label>
          <input
            id="palette-input"
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search projects, manuscripts, sources, or type a command"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat[current] ? `${listId}-${flat[current].key}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
          />
          {!index && !loadError && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-faint" aria-label="Loading" />}
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint sm:block">Esc</kbd>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:text-ink sm:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The list's height follows its results, so filtering reads as the list breathing in. */}
        <motion.div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Results"
          initial={false}
          animate={{ height: listHeight ?? "auto" }}
          transition={SPRING.gentle}
          className="max-h-[min(60dvh,28rem)] overflow-y-auto overscroll-contain"
        >
          <div ref={listContent} className="p-2">
            <AnimatePresence initial={false}>
              {shown.map(([group, list]) => (
                <motion.div
                  key={group}
                  role="group"
                  aria-label={group}
                  className="mb-1 overflow-hidden"
                  initial={false}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, transition: EXIT }}
                  transition={SPRING.snappy}
                >
                  <p className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{group === "Here" ? "On this page" : group}</p>
                  <AnimatePresence initial={false}>
                    {list.map((item) => {
                      const i = position.get(item.key) ?? 0;
                      const isActive = i === current;
                      return (
                        <motion.div
                          key={item.key}
                          id={`${listId}-${item.key}`}
                          data-key={item.key}
                          role="option"
                          aria-selected={isActive}
                          aria-disabled={busy ? true : undefined}
                          // Used many times a day, so results appear at once; only leaving rows fold away.
                          initial={false}
                          animate={{ opacity: 1, height: "auto" }}
                          // Rows that stop matching fold away instead of vanishing.
                          exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, transition: EXIT }}
                          transition={SPRING.snappy}
                          onPointerMove={() => !isActive && setActive(i)}
                          onClick={() => run(item)}
                          className="relative flex cursor-pointer items-center gap-3 overflow-hidden aria-disabled:cursor-wait rounded-xl px-3 py-2.5 text-sm"
                        >
                          {isActive && <motion.span layoutId="palette-active" transition={SPRING.snappy} className="absolute inset-0 rounded-xl bg-iris-soft" />}
                          <span className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line ${isActive ? "text-iris" : "text-muted"}`}>
                            {busy && item.key === busy ? <Loader2 className="h-4 w-4 animate-spin" /> : item.icon}
                          </span>
                          <span className="relative min-w-0 flex-1">
                            <span className="block truncate text-ink">{item.label}</span>
                            {item.hint && <span className="block truncate text-xs text-faint">{item.hint}</span>}
                          </span>
                          {isActive && <CornerDownLeft className="relative h-3.5 w-3.5 shrink-0 text-iris" aria-hidden />}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
            {flat.length === 0 &&
              (!index && !loadError ? (
                <p role="status" className="px-3 py-10 text-center text-sm text-muted">
                  Searching…
                </p>
              ) : (
                <p className="px-3 py-10 text-center text-sm text-muted">
                  Nothing matches “{query}”. Try a title, an author&apos;s surname or a project name.
                </p>
              ))}
            {loadError && <p role="alert" className="px-3 pb-2 text-xs text-amber">{loadError}</p>}
          </div>
        </motion.div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 font-mono text-[10px] text-faint sm:flex">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">AcademiaSync</span>
        </div>
      </div>
    </Dialog>
  );
}
