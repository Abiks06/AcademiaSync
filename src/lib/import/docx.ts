import "server-only";
import JSZip from "jszip";
import { DOMParser, type Element as XElement, type Node as XNode } from "@xmldom/xmldom";
import type { DocJSON } from "@/lib/editor/ydoc";
import { CITATION_NODE } from "@/lib/library/citations";
import { safeHref } from "@/lib/documents/export";
import { cslToSource, endnoteToSources, wordSourcesToSources, type FieldItem } from "./field-citations";
import type { SourceFields } from "@/lib/library/types";

/**
 * Reads a Word (.docx) manuscript into the editor's document format.
 *
 * A .docx is a zip of XML parts. This walks word/document.xml in order and keeps what the
 * editor can hold: paragraphs, headings, lists, quotes, links, bold, italic, underline and
 * strike. Citations made with Zotero, Mendeley, EndNote or Word's own tool are fields that
 * carry the full reference data, so each one becomes a pending citation with its sources.
 * The reference list those tools write is dropped (the app writes its own). Tables, figures,
 * equations and footnotes, which the editor can't hold yet, become clearly marked notes that
 * point to the original file.
 */

export const DOCX_LIMITS = {
  /** The upload itself. */
  bytes: 25 * 1024 * 1024,
  /** Everything unzipped, against zip bombs. */
  unzippedBytes: 150 * 1024 * 1024,
  entries: 3000,
  blocks: 20_000,
  citations: 5000,
};

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";

export class DocxError extends Error {}

/** One citation found in the file, waiting to be linked to library sources. */
export type PendingCitation = {
  key: number;
  /** "zotero" | "mendeley" | "endnote" | "word": from field data; "typed": found in the text. */
  origin: "zotero" | "mendeley" | "endnote" | "word" | "typed";
  items: FieldItem[];
  mode: "parenthetical" | "narrative";
  /** The text the citation had in the file, e.g. "(Smith, 2020, p. 4)". */
  text: string;
};

export type ParsedDocx = {
  title: string | null;
  /** The manuscript, with citations as `citation` nodes whose attrs are `{ pending: key }`. */
  doc: DocJSON;
  citations: PendingCitation[];
  /** Typed reference-list entries, when the citations weren't made with a reference manager. */
  referenceList: string[];
  kept: { tables: number; figures: number; equations: number; footnotes: number };
};

type Marks = NonNullable<DocJSON["marks"]>;

const isW = (node: XNode | null | undefined, name: string): boolean =>
  !!node && node.nodeType === 1 && (node as XElement).namespaceURI === W && (node as XElement).localName === name;

function children(node: XNode | null | undefined): XElement[] {
  const out: XElement[] = [];
  for (let c = node?.firstChild ?? null; c; c = c.nextSibling) if (c.nodeType === 1) out.push(c as XElement);
  return out;
}

const child = (node: XNode | null | undefined, name: string): XElement | undefined => children(node).find((c) => isW(c, name));
const attr = (node: XElement | undefined, name: string) => node?.getAttributeNS(W, name) || node?.getAttribute(`w:${name}`) || "";

/** On/off properties like <w:b/>, <w:b w:val="0"/> or <w:b w:val="false"/>. */
function isOn(rPr: XElement | undefined, name: string) {
  const el = child(rPr, name);
  if (!el) return false;
  const val = attr(el, "val");
  return val === "" || !["0", "false", "off", "none"].includes(val);
}

function parseXml(xml: string) {
  // No DTDs: a file that declares one is refused before parsing, so entities can't expand.
  if (/<!DOCTYPE/i.test(xml.slice(0, 2000))) throw new DocxError("This file contains something Word files don't, so it wasn't opened.");
  let failed = false;
  const doc = new DOMParser({ onError: (level) => void (level === "fatalError" && (failed = true)) }).parseFromString(xml, "application/xml");
  if (failed || !doc.documentElement) throw new DocxError("This Word file seems damaged. Open it in Word, save it again, and retry.");
  return doc;
}

async function unzip(data: ArrayBuffer | Uint8Array) {
  if (data.byteLength > DOCX_LIMITS.bytes) throw new DocxError("That file is over 25 MB. Save a copy without large images and try again.");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new DocxError("That isn't a Word (.docx) file. In Word, use Save As and choose Word Document (.docx).");
  }
  const files = Object.values(zip.files);
  if (files.length > DOCX_LIMITS.entries) throw new DocxError("This Word file has an unusual structure, so it wasn't opened.");
  if (zip.file("word/vbaProject.bin")) throw new DocxError("This file contains macros. Save it as a normal Word Document (.docx) and try again.");
  let total = 0;
  const read = async (path: string) => {
    const file = zip.file(path);
    if (!file) return null;
    const text = await file.async("string");
    total += text.length;
    if (total > DOCX_LIMITS.unzippedBytes) throw new DocxError("This Word file is too large to import.");
    return text;
  };
  return { zip, read };
}

/** Field instructions that make a citation, and those that make a reference list. */
function fieldKind(instr: string) {
  const t = instr.trim();
  if (/^ADDIN\s+ZOTERO_ITEM\b/i.test(t)) return "zotero" as const;
  if (/^ADDIN\s+(?:Mendeley\s+Citation|CSL_CITATION)\b/i.test(t)) return "mendeley" as const;
  if (/^ADDIN\s+EN\.CITE\b/i.test(t)) return "endnote" as const;
  if (/^CITATION\s/i.test(t)) return "word" as const;
  if (/^ADDIN\s+(?:ZOTERO_BIBL|Mendeley\s+Bibliography|EN\.REFLIST)\b|^BIBLIOGRAPHY\b/i.test(t)) return "bibliography" as const;
  if (/^HYPERLINK\b/i.test(t)) return "hyperlink" as const;
  return "other" as const;
}

/** The JSON object in a Zotero or Mendeley field, after "CSL_CITATION". */
function cslJson(instr: string): unknown {
  const start = instr.indexOf("{");
  const end = instr.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(instr.slice(start, end + 1));
  } catch {
    return null;
  }
}

type Field = { instr: string; data: string; kind: ReturnType<typeof fieldKind> | null; result: string; separated: boolean };

type Context = {
  rels: Map<string, string>;
  numbering: Map<string, Map<number, "bullet" | "ordered">>;
  styles: Map<string, { name: string; basedOn: string; outline: number | null }>;
  wordSources: Map<string, SourceFields>;
  citations: PendingCitation[];
  /** Open fields, innermost last. Complex fields can run across runs and paragraphs. */
  fields: Field[];
  kept: ParsedDocx["kept"];
  footnotes: Map<string, XElement>;
  footnoteOrder: string[];
};

function citationFromField(field: Field, ctx: Context): DocJSON | null {
  if (ctx.citations.length >= DOCX_LIMITS.citations) return null;
  let items: FieldItem[] = [];
  let origin: PendingCitation["origin"] = "zotero";
  if (field.kind === "zotero" || field.kind === "mendeley") {
    origin = field.kind;
    const json = cslJson(field.instr) as { citationItems?: unknown[] } | null;
    items = (json?.citationItems ?? []).flatMap((ci) => {
      const c = ci as Record<string, unknown>;
      const source = cslToSource(c.itemData);
      if (!source) return [];
      return [{ source, locator: locatorText(c.locator, c.label), prefix: str(c.prefix), suffix: str(c.suffix), suppressAuthor: c["suppress-author"] === true }];
    });
  } else if (field.kind === "endnote") {
    origin = "endnote";
    let xml = field.instr.replace(/^\s*ADDIN\s+EN\.CITE(?:\.DATA)?\s*/i, "").replace(/ADDIN\s+EN\.CITE\.DATA\s*$/i, "");
    if (!xml.includes("<EndNote") && field.data) {
      try {
        xml = Buffer.from(field.data.replace(/\s+/g, ""), "base64").toString("utf8");
      } catch {
        xml = "";
      }
    }
    items = xml.includes("<EndNote") ? endnoteToSources(xml) : [];
  } else if (field.kind === "word") {
    origin = "word";
    // CITATION Smi20 \p 45 \m Lee19 \l 1033
    const tags = [...field.instr.matchAll(/(?:^\s*CITATION|\\m)\s+(\S+)/gi)].map((m) => m[1]);
    const page = /\\p\s+"?([^"\\]+?)"?\s*(?:\\|$)/i.exec(field.instr)?.[1]?.trim();
    items = tags.flatMap((tag, i) => {
      const source = ctx.wordSources.get(tag);
      return source ? [{ source, locator: i === 0 ? page : undefined }] : [];
    });
  }
  const text = field.result.trim();
  if (items.length === 0) return text ? { type: "text", text } : null;
  const key = ctx.citations.length;
  // Zotero's suppressed-author citations become narrative once the typed name before them is
  // taken out (see narrativeNames); until then they stay parenthetical, which is never wrong.
  const mode = items[0].authorYear ? "narrative" : "parenthetical";
  ctx.citations.push({ key, origin, items, mode, text });
  return { type: CITATION_NODE, attrs: { pending: key } };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Zotero's locator with its label: page 4 → "4", chapter 3 → "ch. 3". */
function locatorText(locator: unknown, label: unknown) {
  const l = typeof locator === "number" ? String(locator) : str(locator);
  if (!l) return undefined;
  const short: Record<string, string> = { chapter: "ch.", section: "sec.", figure: "fig.", table: "table", paragraph: "para.", volume: "vol.", line: "line", note: "n." };
  const name = str(label);
  return name && name !== "page" && short[name] ? `${short[name]} ${l}` : l;
}

function runMarks(rPr: XElement | undefined): Marks {
  const marks: Marks = [];
  if (isOn(rPr, "b")) marks.push({ type: "bold" });
  if (isOn(rPr, "i")) marks.push({ type: "italic" });
  const u = child(rPr, "u");
  if (u && !["none", "0"].includes(attr(u, "val"))) marks.push({ type: "underline" });
  if (isOn(rPr, "strike") || isOn(rPr, "dstrike")) marks.push({ type: "strike" });
  return marks;
}

const withLink = (marks: Marks, href: string | null) => (href ? [...marks, { type: "link", attrs: { href } }] : marks);

/**
 * The inline content of a paragraph (runs, links, fields), in order. While a citation or
 * reference-list field is open, its displayed result is not output.
 */
function inlines(node: XElement, ctx: Context, href: string | null = null): DocJSON[] {
  const out: DocJSON[] = [];
  const emitText = (text: string, marks: Marks) => {
    const field = ctx.fields.at(-1);
    if (field?.separated) field.result += text;
    // Inside a citation or bibliography field, the shown text is replaced.
    if (ctx.fields.some((f) => f.kind && f.kind !== "other" && f.kind !== "hyperlink")) return;
    const linked = ctx.fields.find((f) => f.kind === "hyperlink");
    const fieldHref = linked ? safeHref(/HYPERLINK\s+"([^"]+)"/i.exec(linked.instr)?.[1]) : null;
    const m = withLink(marks, href ?? fieldHref);
    if (text) out.push(m.length ? { type: "text", text, marks: m } : { type: "text", text });
  };

  for (const el of children(node)) {
    if (isW(el, "r")) {
      const marks = runMarks(child(el, "rPr"));
      for (const part of children(el)) {
        if (isW(part, "fldChar")) {
          const type = attr(part, "fldCharType");
          if (type === "begin") {
            const data = child(part, "fldData")?.textContent ?? "";
            ctx.fields.push({ instr: "", data, kind: null, result: "", separated: false });
          } else if (type === "separate") {
            const field = ctx.fields.at(-1);
            if (field) {
              field.kind = fieldKind(field.instr);
              field.separated = true;
            }
          } else if (type === "end") {
            const field = ctx.fields.pop();
            if (!field) continue;
            field.kind ??= fieldKind(field.instr);
            if (["zotero", "mendeley", "endnote", "word"].includes(field.kind)) {
              const cite = citationFromField(field, ctx);
              if (cite) {
                // A citation inside another open field (rare) is still kept.
                out.push(cite);
              }
            }
            const parent = ctx.fields.at(-1);
            if (parent?.separated) parent.result += field.result;
          }
        } else if (isW(part, "instrText")) {
          const field = ctx.fields.at(-1);
          if (field && !field.separated) field.instr += part.textContent ?? "";
        } else if (isW(part, "t")) emitText(part.textContent ?? "", marks);
        else if (isW(part, "tab")) emitText("\t", marks);
        else if (isW(part, "br") || isW(part, "cr")) {
          if (attr(part, "type") === "page") continue;
          if (!ctx.fields.some((f) => f.kind && f.kind !== "other" && f.kind !== "hyperlink")) out.push({ type: "hardBreak" });
        } else if (isW(part, "noBreakHyphen")) emitText("\u2011", marks);
        else if (isW(part, "softHyphen")) continue;
        else if (isW(part, "sym")) {
          const code = parseInt(attr(part, "char"), 16);
          if (Number.isFinite(code) && code >= 0x20 && code < 0xf000) emitText(String.fromCodePoint(code), marks);
        } else if (isW(part, "footnoteReference") || isW(part, "endnoteReference")) {
          const id = attr(part, "id");
          if (isW(part, "footnoteReference") && ctx.footnotes.has(id)) {
            if (!ctx.footnoteOrder.includes(id)) ctx.footnoteOrder.push(id);
            emitText(`[${ctx.footnoteOrder.indexOf(id) + 1}]`, marks);
          }
        } else if (isW(part, "drawing") || isW(part, "pict") || isW(part, "object") || part.localName === "AlternateContent") {
          ctx.kept.figures += 1;
          emitText(`[Figure ${ctx.kept.figures}: in the original file]`, [{ type: "italic" }]);
        }
      }
    } else if (isW(el, "hyperlink")) {
      const id = el.getAttributeNS(R, "id") || el.getAttribute("r:id") || "";
      out.push(...inlines(el, ctx, safeHref(ctx.rels.get(id)) ?? href));
    } else if (isW(el, "fldSimple")) {
      const instr = attr(el, "instr");
      const kind = fieldKind(instr);
      if (["zotero", "mendeley", "endnote", "word"].includes(kind)) {
        const field: Field = { instr, data: "", kind, result: "", separated: true };
        ctx.fields.push(field);
        inlines(el, ctx);
        ctx.fields.pop();
        const cite = citationFromField(field, ctx);
        if (cite) out.push(cite);
      } else if (kind !== "bibliography") {
        out.push(...inlines(el, ctx, kind === "hyperlink" ? safeHref(/HYPERLINK\s+"([^"]+)"/i.exec(instr)?.[1]) : href));
      }
    } else if (isW(el, "sdt")) {
      out.push(...sdtInlines(el, ctx, href));
    } else if (isW(el, "ins") || isW(el, "smartTag") || isW(el, "customXml") || isW(el, "moveTo")) {
      out.push(...inlines(el, ctx, href));
    } else if (el.namespaceURI === M && (el.localName === "oMath" || el.localName === "oMathPara")) {
      ctx.kept.equations += 1;
      emitText(`[Equation ${ctx.kept.equations}: in the original file]`, [{ type: "italic" }]);
    }
    // w:del, w:moveFrom, bookmarks, comments and proofing marks are left out.
  }
  return out;
}

/**
 * Content controls. Mendeley Cite (the current plug-in) keeps each citation in one, tagged
 * MENDELEY_CITATION_v3_ with the citation's CSL-JSON in base64.
 */
function sdtInlines(el: XElement, ctx: Context, href: string | null): DocJSON[] {
  const tag = attr(child(child(el, "sdtPr"), "tag"), "val");
  const content = child(el, "sdtContent");
  if (/^MENDELEY_CITATION_v3_/.test(tag)) {
    let json = "";
    try {
      json = Buffer.from(tag.slice("MENDELEY_CITATION_v3_".length), "base64").toString("utf8");
    } catch {
      json = "";
    }
    const field: Field = { instr: `ADDIN CSL_CITATION ${json}`, data: "", kind: "mendeley", result: "", separated: true };
    ctx.fields.push(field);
    if (content) inlines(content, ctx);
    ctx.fields.pop();
    const cite = citationFromField(field, ctx);
    return cite ? [cite] : [];
  }
  if (/^MENDELEY_BIBLIOGRAPHY/.test(tag)) return [];
  return content ? inlines(content, ctx, href) : [];
}

function styleChain(styleId: string, ctx: Context) {
  const chain: { name: string; outline: number | null }[] = [];
  let id = styleId;
  for (let i = 0; id && i < 10; i++) {
    const style = ctx.styles.get(id);
    if (!style) break;
    chain.push(style);
    id = style.basedOn;
  }
  return chain;
}

type Block =
  | { kind: "paragraph"; node: DocJSON; list?: { type: "bullet" | "ordered"; level: number } }
  | { kind: "heading"; node: DocJSON; level: number }
  | { kind: "title"; text: string }
  | { kind: "skip" };

function paragraph(p: XElement, ctx: Context): Block {
  const pPr = child(p, "pPr");
  const chain = styleChain(attr(child(pPr, "pStyle"), "val"), ctx);
  const names = chain.map((s) => s.name.toLowerCase());
  const fieldsBefore = ctx.fields.some((f) => f.kind === "bibliography");
  const content = inlines(p, ctx);
  const inBibliography = fieldsBefore || ctx.fields.some((f) => f.kind === "bibliography");
  // Paragraphs a reference manager's reference list wrote are left out; the app writes its own.
  if (inBibliography && !content.some((n) => n.type === CITATION_NODE)) return { kind: "skip" };
  if (names.includes("bibliography")) return { kind: "skip" };

  if (names[0] === "title") return { kind: "title", text: content.map((n) => n.text ?? "").join("").trim() };
  const outline = attr(child(pPr, "outlineLvl"), "val") || chain.find((s) => s.outline !== null)?.outline?.toString();
  const heading = names.map((n) => /^heading\s*([1-9])$/.exec(n)?.[1]).find(Boolean) ?? (outline && Number(outline) < 6 ? String(Number(outline) + 1) : undefined);
  if (heading) return { kind: "heading", level: Math.min(Number(heading), 6), node: { type: "heading", attrs: { level: Math.min(Number(heading), 6) }, content: merge(content) } };

  const quote = names.some((n) => n === "quote" || n === "intense quote" || n === "block text");
  const node: DocJSON = { type: "paragraph", ...(content.length && { content: merge(content) }) };
  const numPr = child(pPr, "numPr");
  const numId = attr(child(numPr, "numId"), "val");
  if (numId && numId !== "0") {
    const level = Number(attr(child(numPr, "ilvl"), "val")) || 0;
    const type = ctx.numbering.get(numId)?.get(level) ?? "bullet";
    return { kind: "paragraph", node, list: { type, level: Math.min(level, 8) } };
  }
  return { kind: "paragraph", node: quote ? { type: "blockquote", content: [node] } : node };
}

/** Joins neighbouring text with the same marks, and drops empty text. */
function merge(nodes: DocJSON[]): DocJSON[] {
  const out: DocJSON[] = [];
  for (const n of nodes) {
    const last = out.at(-1);
    if (n.type === "text" && !n.text) continue;
    if (n.type === "text" && last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      last.text = (last.text ?? "") + n.text;
    } else out.push({ ...n });
  }
  return out;
}

/** Turns runs of list paragraphs into nested bullet and numbered lists. */
function buildLists(blocks: Block[]): DocJSON[] {
  const out: DocJSON[] = [];
  let i = 0;
  const listAt = (level: number, type: "bullet" | "ordered"): DocJSON => {
    const list: DocJSON = { type: type === "bullet" ? "bulletList" : "orderedList", content: [] };
    while (i < blocks.length) {
      const b = blocks[i];
      if (b.kind !== "paragraph" || !b.list || b.list.level < level) break;
      if (b.list.level > level) {
        const items = list.content!;
        const nested = listAt(level + 1, b.list.type);
        if (items.length) items.at(-1)!.content!.push(nested);
        else items.push({ type: "listItem", content: [{ type: "paragraph" }, nested] });
        continue;
      }
      if (b.list.type !== type && list.content!.length) break;
      list.content!.push({ type: "listItem", content: [b.node] });
      i++;
    }
    return list;
  };
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === "paragraph" && b.list) out.push(listAt(b.list.level, b.list.type));
    else {
      if (b.kind === "paragraph" || b.kind === "heading") out.push(b.node);
      i++;
    }
  }
  return out;
}

/**
 * "As Smith (2020) showed", written in Zotero with the author suppressed: the text holds
 * "As Smith " and the citation shows "(2020)". The editor writes narrative citations whole,
 * so the typed name is taken out and the citation becomes narrative.
 */
function narrativeNames(node: DocJSON, citations: PendingCitation[]): DocJSON {
  if (!node.content) return node;
  const content = node.content.map((c) => narrativeNames(c, citations));
  for (let i = 1; i < content.length; i++) {
    const cite = content[i];
    const before = content[i - 1];
    if (cite.type !== CITATION_NODE || before.type !== "text") continue;
    const pending = citations[Number(cite.attrs?.pending)];
    const authors = pending?.items[0]?.suppressAuthor ? pending.items[0].source.authors : null;
    if (!authors?.length) continue;
    const family = authors[0].family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const others = authors.length === 2 ? `(?:\\s+(?:and|&)\\s+${authors[1].family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})?` : "(?:\\s+et\\s+al\\.?)?";
    const match = new RegExp(`${family}${others}(?:['’]s)?\\s*$`).exec(before.text ?? "");
    if (!match || match[0].includes("'") || match[0].includes("’")) continue;
    const kept = (before.text ?? "").slice(0, match.index);
    content[i - 1] = { ...before, text: kept };
    pending.mode = "narrative";
  }
  return { ...node, content: content.filter((c) => c.type !== "text" || c.text) };
}

const placeholder = (text: string): DocJSON => ({ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "italic" }] }] });

function body(nodes: XElement[], ctx: Context, out: Block[], titles: string[]) {
  for (const el of nodes) {
    if (out.length > DOCX_LIMITS.blocks) throw new DocxError("This document is too long to import in one go. Split it into chapters.");
    if (isW(el, "p")) {
      const block = paragraph(el, ctx);
      if (block.kind === "title") {
        if (block.text) titles.push(block.text);
      } else if (block.kind !== "skip") out.push(block);
    } else if (isW(el, "tbl")) {
      ctx.kept.tables += 1;
      // Fields can run into a table (a reference list laid out as one); keep their state right.
      const before = ctx.fields.length;
      for (const p of el.getElementsByTagNameNS(W, "p")) inlines(p as XElement, ctx);
      ctx.fields.length = Math.min(ctx.fields.length, before);
      out.push({ kind: "paragraph", node: placeholder(`[Table ${ctx.kept.tables}: in the original file]`) });
    } else if (isW(el, "sdt")) {
      body(children(child(el, "sdtContent")), ctx, out, titles);
    } else if (isW(el, "customXml") || isW(el, "ins")) {
      body(children(el), ctx, out, titles);
    }
  }
}

/** Reads the parts the body refers to: links, list formats, styles, Word's own sources, footnotes. */
async function context(read: (path: string) => Promise<string | null>): Promise<Context> {
  const rels = new Map<string, string>();
  const relsXml = await read("word/_rels/document.xml.rels");
  if (relsXml) {
    for (const rel of parseXml(relsXml).getElementsByTagName("Relationship")) {
      if (rel.getAttribute("TargetMode") === "External") rels.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
    }
  }

  const numbering = new Map<string, Map<number, "bullet" | "ordered">>();
  const numXml = await read("word/numbering.xml");
  if (numXml) {
    const doc = parseXml(numXml);
    const abstracts = new Map<string, Map<number, "bullet" | "ordered">>();
    for (const a of doc.getElementsByTagNameNS(W, "abstractNum")) {
      const levels = new Map<number, "bullet" | "ordered">();
      for (const lvl of children(a).filter((c) => isW(c, "lvl"))) {
        const fmt = attr(child(lvl, "numFmt"), "val");
        levels.set(Number(attr(lvl, "ilvl")) || 0, fmt === "bullet" || fmt === "none" || fmt === "" ? "bullet" : "ordered");
      }
      abstracts.set(attr(a, "abstractNumId"), levels);
    }
    for (const n of doc.getElementsByTagNameNS(W, "num")) {
      const levels = abstracts.get(attr(child(n, "abstractNumId"), "val"));
      if (levels) numbering.set(attr(n, "numId"), levels);
    }
  }

  const styles = new Map<string, { name: string; basedOn: string; outline: number | null }>();
  const stylesXml = await read("word/styles.xml");
  if (stylesXml) {
    for (const s of parseXml(stylesXml).getElementsByTagNameNS(W, "style")) {
      const outline = attr(child(child(s, "pPr"), "outlineLvl"), "val");
      styles.set(attr(s, "styleId"), {
        name: attr(child(s, "name"), "val"),
        basedOn: attr(child(s, "basedOn"), "val"),
        outline: outline ? Number(outline) : null,
      });
    }
  }

  // Word's own citation tool keeps its sources in a custom XML part.
  const wordSources = new Map<string, SourceFields>();
  for (let i = 1; i <= 20; i++) {
    const xml = await read(`customXml/item${i}.xml`);
    if (xml === null) break;
    if (!xml.includes("bibliography")) continue;
    for (const [tag, source] of wordSourcesToSources(parseXml(xml))) wordSources.set(tag, source);
  }

  const footnotes = new Map<string, XElement>();
  const notesXml = await read("word/footnotes.xml");
  if (notesXml) {
    for (const f of parseXml(notesXml).getElementsByTagNameNS(W, "footnote")) {
      const type = attr(f, "type");
      if (!type || type === "normal") footnotes.set(attr(f, "id"), f);
    }
  }

  return {
    rels,
    numbering,
    styles,
    wordSources,
    citations: [],
    fields: [],
    kept: { tables: 0, figures: 0, equations: 0, footnotes: 0 },
    footnotes,
    footnoteOrder: [],
  };
}

const REFERENCE_HEADING = /^\s*(?:\d+(?:\.\d+)*\.?\s+)?(references?|reference list|bibliography|works cited|literature cited|sources cited|cited works)\s*:?\s*$/i;

const textOf = (node: DocJSON): string => node.text ?? (node.content ?? []).map(textOf).join(node.type === "listItem" ? " " : "");

/**
 * Takes a typed reference list out of the manuscript: the paragraphs under a "References"
 * heading (or a last paragraph saying so), up to the next heading of the same or a higher level.
 */
function takeReferenceList(blocks: DocJSON[]) {
  const start = blocks.findLastIndex(
    (b) => (b.type === "heading" || (b.type === "paragraph" && (b.content ?? []).every((c) => c.marks?.some((m) => m.type === "bold")))) && REFERENCE_HEADING.test(textOf(b)),
  );
  if (start < 0) return { blocks, entries: [] as string[] };
  const level = blocks[start].type === "heading" ? Number(blocks[start].attrs?.level) || 1 : 7;
  let end = start + 1;
  while (end < blocks.length && !(blocks[end].type === "heading" && (Number(blocks[end].attrs?.level) || 1) <= level)) end++;
  const entries = blocks
    .slice(start + 1, end)
    .flatMap((b) => (b.type === "bulletList" || b.type === "orderedList" ? (b.content ?? []).map(textOf) : [textOf(b)]))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 8);
  return { blocks: [...blocks.slice(0, start), ...blocks.slice(end)], entries };
}

/** Reads a .docx file. Throws DocxError with a message a person can act on. */
export async function parseDocx(data: ArrayBuffer | Uint8Array): Promise<ParsedDocx> {
  const { read } = await unzip(data);
  const documentXml = await read("word/document.xml");
  if (!documentXml) throw new DocxError("That isn't a Word (.docx) file. In Word, use Save As and choose Word Document (.docx).");
  const ctx = await context(read);
  const root = parseXml(documentXml).documentElement;
  const out: Block[] = [];
  const titles: string[] = [];
  body(children(child(root, "body")), ctx, out, titles);

  // Footnotes become a numbered "Notes" section at the end, so their text and citations survive.
  const notes: Block[] = [];
  for (const id of ctx.footnoteOrder) {
    const paras = children(ctx.footnotes.get(id)).filter((c) => isW(c, "p"));
    const content = merge(paras.flatMap((p, i) => [...(i > 0 ? [{ type: "hardBreak" }] : []), ...inlines(p, ctx)])).filter(
      (n, i) => !(i === 0 && n.type === "text" && !n.text?.trim()),
    );
    notes.push({ kind: "paragraph", node: { type: "paragraph", ...(content.length && { content }) }, list: { type: "ordered", level: 0 } });
  }
  ctx.kept.footnotes = notes.length;

  let blocks = buildLists(out).map((b) => narrativeNames(b, ctx.citations));
  let referenceList: string[] = [];
  if (ctx.citations.length === 0) {
    const taken = takeReferenceList(blocks);
    blocks = taken.blocks;
    referenceList = taken.entries;
  } else {
    // The heading over a reference manager's (now removed) list is left with nothing under it.
    const last = blocks.at(-1);
    if (last && REFERENCE_HEADING.test(textOf(last))) blocks = blocks.slice(0, -1);
  }
  if (notes.length) blocks.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] }, ...buildLists(notes));

  const coreXml = await read("docProps/core.xml");
  const coreTitle = coreXml ? parseXml(coreXml).getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "title")[0]?.textContent?.trim() : undefined;
  return {
    title: titles[0] || coreTitle || null,
    doc: { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] },
    citations: ctx.citations,
    referenceList,
    kept: ctx.kept,
  };
}
