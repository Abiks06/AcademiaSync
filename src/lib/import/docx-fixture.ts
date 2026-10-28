import JSZip from "jszip";

/** Builds small .docx files for tests, from body XML and optional extra parts. */
export async function makeDocx(bodyXml: string, parts: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${bodyXml}</w:body></w:document>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
<w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/></w:style>
</w:styles>`,
  );
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/paper" TargetMode="External"/>
<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
</Relationships>`,
  );
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  return zip.generateAsync({ type: "uint8array" });
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const p = (inner: string, style?: string, num?: { id: number; level?: number }) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${num ? `<w:numPr><w:ilvl w:val="${num.level ?? 0}"/><w:numId w:val="${num.id}"/></w:numPr>` : ""}</w:pPr>${inner}</w:p>`;
export const r = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;

/** A complex field split over several runs, as Word writes them. */
export const field = (instr: string, result: string, data?: string) =>
  `<w:r><w:fldChar w:fldCharType="begin">${data ? `<w:fldData xml:space="preserve">${data}</w:fldData>` : ""}</w:fldChar></w:r>` +
  `<w:r><w:instrText xml:space="preserve">${escape(instr.slice(0, 40))}</w:instrText></w:r>` +
  `<w:r><w:instrText xml:space="preserve">${escape(instr.slice(40))}</w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(result)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
