import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun, type IRunOptions } from "docx";
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

type Marks = { -readonly [K in "bold" | "italics" | "strike" | "underline" | "font"]?: IRunOptions[K] };

function marksOf(node: DocJSON): Marks {
  const marks: Marks = {};
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") marks.bold = true;
    if (mark.type === "italic") marks.italics = true;
    if (mark.type === "strike") marks.strike = true;
    if (mark.type === "underline") marks.underline = {};
    if (mark.type === "code") marks.font = "Consolas";
  }
  return marks;
}

function runs(content: DocJSON[] | undefined, input: ExportInput, extra: Marks = {}): TextRun[] {
  return (content ?? []).flatMap((node) => {
    if (node.type === "text") return [new TextRun({ text: node.text ?? "", ...extra, ...marksOf(node) })];
    if (node.type === "hardBreak") return [new TextRun({ text: "", break: 1 })];
    if (node.type === CITATION_NODE) return [new TextRun({ text: input.citationLabel(node.attrs ?? {}), ...extra })];
    return runs(node.content, input, extra);
  });
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function blocks(nodes: DocJSON[] | undefined, input: ExportInput, list?: { ordered: boolean; level: number; instance: number }, quote = false): Paragraph[] {
  return (nodes ?? []).flatMap((node): Paragraph[] => {
    switch (node.type) {
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
        return [new Paragraph({ heading: HEADINGS[level - 1], children: runs(node.content, input) })];
      }
      case "paragraph":
        return [
          new Paragraph({
            children: runs(node.content, input, quote ? { italics: true } : {}),
            ...(quote && { indent: { left: 720 } }),
            ...(list && {
              ...(list.ordered ? { numbering: { reference: "ordered", level: list.level, instance: list.instance } } : { bullet: { level: list.level } }),
            }),
          }),
        ];
      case "bulletList":
      case "orderedList":
        return blocks(node.content, input, { ordered: node.type === "orderedList", level: list ? Math.min(list.level + 1, 8) : 0, instance: nextInstance() }, quote);
      case "listItem":
        // The first paragraph carries the bullet; nested lists indent further.
        return (node.content ?? []).flatMap((child, i) =>
          child.type === "paragraph" && i > 0 ? blocks([child], input, undefined, quote) : blocks([child], input, list, quote),
        );
      case "blockquote":
        return blocks(node.content, input, list, true);
      case "codeBlock":
        return [new Paragraph({ children: [new TextRun({ text: (node.content ?? []).map((c) => c.text ?? "").join(""), font: "Consolas" })] })];
      case "horizontalRule":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, children: [] })];
      default:
        return blocks(node.content, input, list, quote);
    }
  });
}

let instances = 0;
const nextInstance = () => ++instances;

/** Turns sanitised CSL HTML (<i>, <b> and spans only) into Word runs. */
export function htmlToRuns(html: string): TextRun[] {
  const out: TextRun[] = [];
  let italics = false;
  let bold = false;
  for (const part of html.split(/(<\/?[a-z]+[^>]*>)/i)) {
    const tag = /^<(\/?)([a-z]+)/i.exec(part);
    if (tag) {
      const on = tag[1] !== "/";
      if (/^(i|em)$/i.test(tag[2])) italics = on;
      if (/^(b|strong)$/i.test(tag[2])) bold = on;
      continue;
    }
    if (part) out.push(new TextRun({ text: decodeEntities(part), italics, bold }));
  }
  return out;
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

/** A Word document of the manuscript with its reference list. */
export async function toDocx(input: ExportInput) {
  const doc = new Document({
    title: input.title,
    creator: "AcademiaSync",
    styles: { default: { document: { run: { font: "Georgia", size: 24 } } } },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(input.title)] }),
          ...blocks(input.json.content, input),
          ...(input.references.length
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("References")] }),
                ...input.references.map((r) => new Paragraph({ indent: { left: 720, hanging: 720 }, spacing: { after: 120 }, children: htmlToRuns(r.html) })),
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
        return text;
      })
      .join("");

  const block = (node: DocJSON, prefix = ""): string => {
    switch (node.type) {
      case "heading":
        return `${"#".repeat(Math.min(Number(node.attrs?.level) || 1, 6))} ${inline(node.content)}`;
      case "paragraph":
        return prefix + inline(node.content);
      case "bulletList":
      case "orderedList":
        return (node.content ?? [])
          .map((item, i) => (item.content ?? []).map((child, j) => block(child, j === 0 ? (node.type === "orderedList" ? `${i + 1}. ` : "- ") : "   ")).join("\n"))
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
