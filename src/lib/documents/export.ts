import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Tab,
  TextRun,
  type ILevelsOptions,
  type IRunOptions,
  type NumberingDefinition,
  type ParagraphChild,
} from "docx";
import { CITATION_NODE } from "@/lib/library/citations";
import type { DocJSON } from "@/lib/editor/ydoc";

export type ExportInput = {
  title: string;
  json: DocJSON;
  /** The citation text in the document's style. */
  citationLabel: (attrs: Record<string, unknown>) => string;
  /** The reference list, as sanitised CSL HTML and plain text. */
  references: { html: string; text: string }[];
};

type Marks = { -readonly [K in "bold" | "italics" | "strike" | "underline" | "font" | "superScript" | "subScript" | "style"]?: IRunOptions[K] };

/** Only links a reader can safely follow go into the file. */
export function safeHref(href: unknown) {
  return typeof href === "string" && /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null;
}

function marksOf(node: DocJSON): Marks {
  const marks: Marks = {};
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") marks.bold = true;
    if (mark.type === "italic") marks.italics = true;
    if (mark.type === "strike") marks.strike = true;
    if (mark.type === "underline") marks.underline = {};
    if (mark.type === "code") marks.font = "Consolas";
    if (mark.type === "superscript") marks.superScript = true;
    if (mark.type === "subscript") marks.subScript = true;
  }
  return marks;
}

const linkOf = (node: DocJSON) => (node.type === "text" ? safeHref(node.marks?.find((m) => m.type === "link")?.attrs?.href) : null);

/**
 * Word ignores newlines and tabs inside a run's text (they show as spaces), so a line
 * becomes a break and a tab a real tab.
 */
function textRuns(text: string, options: Marks = {}): TextRun[] {
  return text.split("\n").map(
    (line, i) =>
      new TextRun({
        ...options,
        ...(i > 0 && { break: 1 }),
        children: line.split("\t").flatMap((part, j) => (j > 0 ? [new Tab(), part] : [part])),
      }),
  );
}

function runs(content: DocJSON[] | undefined, input: ExportInput, extra: Marks = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  const nodes = content ?? [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const href = linkOf(node);
    if (href) {
      // Neighbouring text with the same link (bold inside a link, say) is one hyperlink.
      const group: DocJSON[] = [];
      while (i < nodes.length && linkOf(nodes[i]) === href) group.push(nodes[i++]);
      i--;
      out.push(new ExternalHyperlink({ link: href, children: group.flatMap((n) => textRuns(n.text ?? "", { ...extra, ...marksOf(n), style: "Hyperlink" })) }));
    } else if (node.type === "text") out.push(...textRuns(node.text ?? "", { ...extra, ...marksOf(node) }));
    else if (node.type === "hardBreak") out.push(new TextRun({ ...extra, break: 1 }));
    else if (node.type === CITATION_NODE) out.push(...textRuns(input.citationLabel(node.attrs ?? {}), { ...extra, ...marksOf(node) }));
    else out.push(...runs(node.content, input, extra));
  }
  return out;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

/** Where a list's text starts at each level, which its later paragraphs line up with. */
const listIndent = (level: number) => 720 * (level + 1);
const BULLETS = ["\u2022", "\u25E6", "\u25AA"];

const bulletLevels: ILevelsOptions[] = Array.from({ length: 9 }, (_, level) => ({
  level,
  format: LevelFormat.BULLET,
  text: BULLETS[level % BULLETS.length],
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: listIndent(level), hanging: 360 } }, run: { font: "Arial" } },
}));

const orderedLevels = (start = 1): ILevelsOptions[] =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text: `%${level + 1}.`,
    start: level === 0 ? start : 1,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: listIndent(level), hanging: 360 } } },
  }));

type List = { reference: string | NumberingDefinition; level: number; instance: number };
type Context = { input: ExportInput; instances: number };

/** An ordered list that starts after 1 (TipTap's `start`) gets a numbering of its own. */
function orderedReference(start: unknown): string | NumberingDefinition {
  const n = Math.floor(Number(start));
  return Number.isFinite(n) && n > 1 && n < 100000 ? { reference: `ordered-from-${n}`, levels: orderedLevels(n) } : "ordered";
}

function blocks(nodes: DocJSON[] | undefined, ctx: Context, list?: List, quote = false): Paragraph[] {
  const { input } = ctx;
  return (nodes ?? []).flatMap((node): Paragraph[] => {
    switch (node.type) {
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
        return [new Paragraph({ heading: HEADINGS[level - 1], children: runs(node.content, input) })];
      }
      case "paragraph": {
        const children = runs(node.content, input, quote ? { italics: true } : {});
        if (list) return [new Paragraph({ children, numbering: { reference: list.reference, level: list.level, instance: list.instance } })];
        return [new Paragraph({ children, ...(quote && { style: "Quote" }) })];
      }
      case "bulletList":
      case "orderedList":
        return blocks(
          node.content,
          ctx,
          {
            reference: node.type === "orderedList" ? orderedReference(node.attrs?.start) : "bullet",
            level: list ? Math.min(list.level + 1, 8) : 0,
            instance: ++ctx.instances,
          },
          quote,
        );
      case "listItem":
        // The first paragraph carries the bullet; later ones line up with its text, and nested lists indent further.
        return (node.content ?? []).flatMap((child, i) =>
          child.type === "paragraph" && i > 0 && list
            ? [new Paragraph({ children: runs(child.content, input, quote ? { italics: true } : {}), style: "ListParagraph", indent: { left: listIndent(list.level) } })]
            : blocks([child], ctx, list, quote),
        );
      case "blockquote":
        return blocks(node.content, ctx, list, true);
      case "codeBlock":
        return [new Paragraph({ style: "Code", children: textRuns((node.content ?? []).map((c) => c.text ?? "").join("")) })];
      case "horizontalRule":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, children: [] })];
      default:
        return blocks(node.content, ctx, list, quote);
    }
  });
}

type Piece = { text: string; italics: boolean; bold: boolean; superScript: boolean; subScript: boolean } | "tab";

/**
 * Turns sanitised CSL HTML (<i>, <b>, <sup>, <sub> and spans) into Word runs. A numeric style's
 * label ("[1]", in a `csl-left-margin` span) is followed by a tab, which the hanging indent lines up.
 */
export function htmlToRuns(html: string): TextRun[] {
  const pieces: Piece[] = [];
  const depth = { i: 0, b: 0, sup: 0, sub: 0 };
  const spans: boolean[] = [];
  let skipSpace = true;
  for (const part of html.split(/(<\/?[a-z]+[^>]*>)/i)) {
    const tag = /^<(\/?)([a-z]+)([^>]*)>$/i.exec(part);
    if (tag) {
      const step = tag[1] === "/" ? -1 : 1;
      const name = tag[2].toLowerCase();
      if (name === "i" || name === "em") depth.i = Math.max(0, depth.i + step);
      if (name === "b" || name === "strong") depth.b = Math.max(0, depth.b + step);
      if (name === "sup") depth.sup = Math.max(0, depth.sup + step);
      if (name === "sub") depth.sub = Math.max(0, depth.sub + step);
      if (name === "span" && step > 0) spans.push(/class="csl-left-margin"/.test(tag[3]));
      if (name === "span" && step < 0 && spans.pop()) {
        pieces.push("tab");
        skipSpace = true;
      }
      continue;
    }
    let text = decodeEntities(part);
    if (skipSpace) text = text.trimStart();
    if (!text) continue;
    skipSpace = false;
    pieces.push({ text, italics: depth.i > 0, bold: depth.b > 0, superScript: depth.sup > 0, subScript: depth.sub > 0 });
  }
  const last = pieces.at(-1);
  if (last && last !== "tab") last.text = last.text.trimEnd();
  return pieces.flatMap((p) => {
    if (p === "tab") return [new TextRun({ children: [new Tab()] })];
    if (!p.text) return [];
    return [
      new TextRun({
        text: p.text,
        ...(p.italics && { italics: true }),
        ...(p.bold && { bold: true }),
        ...(p.superScript && { superScript: true }),
        ...(p.subScript && { subScript: true }),
      }),
    ];
  });
}

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const INK = "1A1A1A";
const heading = (size: number, before: number, extra: { italics?: boolean } = {}) => ({
  run: { font: "Georgia", size, bold: true, color: INK, ...extra },
  paragraph: { spacing: { before, after: 120 }, keepNext: true, keepLines: true },
});

/**
 * Word's built-in styles from the docx library are bare: no space between paragraphs, and
 * thin blue headings the same weight as the text. These give a clean manuscript layout.
 */
const STYLES = {
  default: {
    document: { run: { font: "Georgia", size: 24, color: INK }, paragraph: { spacing: { after: 160, line: 300 } } },
    title: { run: { font: "Georgia", size: 40, bold: true, color: INK }, paragraph: { spacing: { after: 320 } } },
    heading1: heading(32, 360),
    heading2: heading(28, 300),
    heading3: heading(26, 240),
    heading4: heading(24, 240, { italics: true }),
    heading5: heading(24, 200),
    heading6: heading(24, 200, { italics: true }),
    listParagraph: { paragraph: { spacing: { after: 80 }, contextualSpacing: true } },
    hyperlink: { run: { color: "1F4E9C", underline: {} } },
  },
  paragraphStyles: [
    {
      id: "Quote",
      name: "Quote",
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { italics: true, color: "404040" },
      paragraph: { indent: { left: 720, right: 720 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: "BFBFBF", space: 12 } } },
    },
    {
      id: "Code",
      name: "Code",
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { font: "Consolas", size: 20 },
      paragraph: { spacing: { line: 240 }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F3F3" } },
    },
    {
      id: "References",
      name: "Reference list",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { indent: { left: 720, hanging: 720 }, spacing: { after: 120 } },
    },
  ],
};

/** A Word document of the manuscript with its reference list. */
export async function toDocx(input: ExportInput) {
  const ctx: Context = { input, instances: 0 };
  const body = blocks(input.json.content, ctx);
  const doc = new Document({
    title: input.title,
    creator: "AcademiaSync",
    styles: STYLES,
    numbering: { config: [{ reference: "ordered", levels: orderedLevels() }, { reference: "bullet", levels: bulletLevels }] },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: textRuns(input.title) }),
          ...body,
          ...(input.references.length
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("References")] }),
                ...input.references.map((r) => new Paragraph({ style: "References", children: htmlToRuns(r.html) })),
              ]
            : []),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** Markdown of the manuscript with its reference list, for Pandoc, Overleaf or a README. */
export function toMarkdown(input: ExportInput) {
  const inline = (content: DocJSON[] | undefined): string =>
    (content ?? [])
      .map((node) => {
        if (node.type === "hardBreak") return "  \n";
        if (node.type === CITATION_NODE) return input.citationLabel(node.attrs ?? {});
        if (node.type !== "text") return inline(node.content);
        let text = (node.text ?? "")
          .replace(/([\\`*_[\]#])/g, "\\$1")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;");
        const marks = new Set((node.marks ?? []).map((m) => m.type));
        if (marks.has("code")) text = `\`${node.text}\``;
        if (marks.has("bold")) text = `**${text}**`;
        if (marks.has("italic")) text = `*${text}*`;
        if (marks.has("strike")) text = `~~${text}~~`;
        const href = linkOf(node);
        if (href) text = `[${text}](<${href.replace(/[<>]/g, encodeURIComponent)}>)`;
        return text;
      })
      .join("");

  const listStart = (node: DocJSON) => {
    const n = Math.floor(Number(node.attrs?.start));
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const block = (node: DocJSON, prefix = ""): string => {
    switch (node.type) {
      case "heading":
        return `${"#".repeat(Math.min(Number(node.attrs?.level) || 1, 6))} ${inline(node.content)}`;
      case "paragraph":
        return prefix + inline(node.content);
      case "bulletList":
      case "orderedList":
        return (node.content ?? [])
          .map((item, i) => (item.content ?? []).map((child, j) => block(child, j === 0 ? (node.type === "orderedList" ? `${listStart(node) + i}. ` : "- ") : "   ")).join("\n"))
          .join("\n");
      case "blockquote":
        return (node.content ?? []).map((child) => block(child).replace(/^/gm, "> ")).join("\n>\n");
      case "codeBlock":
        return `\`\`\`\n${(node.content ?? []).map((c) => c.text ?? "").join("")}\n\`\`\``;
      case "horizontalRule":
        return "---";
      default:
        return inline(node.content);
    }
  };

  const body = (input.json.content ?? []).map((node) => block(node)).join("\n\n");
  const references = input.references.length ? `\n\n## References\n\n${input.references.map((r) => r.text).join("\n\n")}` : "";
  return `# ${input.title}\n\n${body}${references}\n`;
}
