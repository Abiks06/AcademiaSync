import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

/**
 * Typing "/" at the start of a line, or after a space, opens a menu of blocks to insert.
 * Only nodes already in the manuscript schema are offered, so this adds no new content
 * types (an older tab would delete those for everyone).
 */
export type SlashCommand = {
  id: string;
  title: string;
  hint: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", title: "Heading 1", hint: "Section title", keywords: ["title", "h1", "section"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { id: "h2", title: "Heading 2", hint: "Subsection", keywords: ["h2", "subsection"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { id: "h3", title: "Heading 3", hint: "Smaller heading", keywords: ["h3"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { id: "text", title: "Text", hint: "Plain paragraph", keywords: ["paragraph", "p", "body"], run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { id: "bullets", title: "Bulleted list", hint: "A simple list", keywords: ["ul", "unordered", "list", "bullet"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: "numbers", title: "Numbered list", hint: "Steps or ranked items", keywords: ["ol", "ordered", "list", "number"], run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: "quote", title: "Quote", hint: "A quotation, set apart", keywords: ["blockquote", "citation", "excerpt"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: "code", title: "Code block", hint: "Code or a formula in monospace", keywords: ["pre", "snippet", "monospace"], run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { id: "divider", title: "Divider", hint: "A line between sections", keywords: ["hr", "rule", "separator"], run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

export const CITE_COMMAND_ID = "cite";

/** Commands matching what was typed after "/": by title first, then by keyword. */
export function filterCommands(commands: SlashCommand[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const starts = commands.filter((c) => c.title.toLowerCase().startsWith(q));
  const rest = commands.filter(
    (c) => !starts.includes(c) && (c.title.toLowerCase().includes(q) || c.keywords.some((k) => k.startsWith(q))),
  );
  return [...starts, ...rest];
}

export type SlashState = {
  items: SlashCommand[];
  rect: DOMRect | null;
  select: (command: SlashCommand) => void;
} | null;

export type SlashOptions = {
  /** Extra commands that depend on the page, like "Cite" opening the citation picker. */
  extra: () => SlashCommand[];
  onChange: (state: SlashState) => void;
  /** Arrow keys and Enter while the menu is open. Return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const slashKey = new PluginKey("slash-commands");

/**
 * How a page talks to the "/" plugin, which lives outside React: the page tells it whether
 * citing is allowed and what opening the picker means, and hands it the menu's key handler.
 */
export class SlashBridge {
  private canCite = false;
  private openCite: () => void = () => {};
  private keyHandler: (event: KeyboardEvent) => boolean = () => false;

  setCite(allowed: boolean, open: () => void) {
    this.canCite = allowed;
    this.openCite = open;
  }
  setKeyHandler(handler: (event: KeyboardEvent) => boolean) {
    this.keyHandler = handler;
  }
  extra(): SlashCommand[] {
    if (!this.canCite) return [];
    return [{
      id: CITE_COMMAND_ID,
      title: "Cite a source",
      hint: "From the project library",
      keywords: ["citation", "reference", "source"],
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        this.openCite();
      },
    }];
  }
  keys(event: KeyboardEvent) {
    return this.keyHandler(event);
  }
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: "slashCommands",
  addOptions() {
    return { extra: () => [], onChange: () => {}, onKeyDown: () => false };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: slashKey,
        char: "/",
        allowedPrefixes: [" "],
        // Not inside code, where "/" is just a character.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterCommands([...SLASH_COMMANDS, ...options.extra()], query).slice(0, 10),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          const publish = (props: SuggestionProps<SlashCommand, SlashCommand>) =>
            options.onChange({ items: props.items, rect: props.clientRect?.() ?? null, select: (c) => props.command(c) });
          return {
            onStart: publish,
            onUpdate: publish,
            onExit: () => options.onChange(null),
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              if (event.key === "Escape") {
                options.onChange(null);
                return true;
              }
              return options.onKeyDown(event);
            },
          };
        },
      }),
    ];
  },
});
