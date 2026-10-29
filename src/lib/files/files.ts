/** What a project's Files shelf accepts. The Storage bucket enforces the same list and size. */
export const FILE_LIMITS = {
  /** 50 MB a file. */
  maxBytes: 50 * 1024 * 1024,
  /** 1 GB a project. */
  projectBytes: 1024 * 1024 * 1024,
};

export const FILES_BUCKET = "project-files";

/** By extension, because browsers often send no type for .md or .csv. */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const ACCEPT = Object.keys(TYPES).map((ext) => `.${ext}`).join(",");

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** The content type to upload a file as, or null when the shelf doesn't take it. */
export function contentTypeFor(name: string) {
  return TYPES[extensionOf(name)] ?? null;
}

export type FileKind = "pdf" | "word" | "sheet" | "slides" | "image" | "text";

export function fileKind(mime: string): FileKind {
  if (mime === "application/pdf") return "pdf";
  if (mime === TYPES.docx) return "word";
  if (mime === TYPES.xlsx) return "sheet";
  if (mime === TYPES.pptx) return "slides";
  if (mime.startsWith("image/")) return "image";
  return "text";
}

export const KIND_NAME: Record<FileKind, string> = { pdf: "PDF", word: "Word", sheet: "Spreadsheet", slides: "Slides", image: "Image", text: "Text" };

/** Whether the reader can show the file, or only offer it as a download. */
export const canPreview = (kind: FileKind) => kind !== "sheet" && kind !== "slides";

/**
 * A name Storage accepts as a key: letters, digits, dots, dashes and underscores. The real
 * name is kept in the database and used when downloading.
 */
export function storageName(name: string) {
  const ext = extensionOf(name);
  const stem = name
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return `${stem || "file"}${ext ? `.${ext}` : ""}`;
}

export const storagePath = (projectId: string, fileId: string, name: string) => `${projectId}/${fileId}/${storageName(name)}`;

/** "1.2 MB", "340 KB", "12 bytes". */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export type ProjectFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  source_id: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export const FILE_COLUMNS = "id, name, mime_type, size_bytes, source_id, uploaded_by, created_at";
