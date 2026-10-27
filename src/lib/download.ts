/** Saves text as a file. The object URL is released after the browser has started the download. */
export function downloadText(filename: string, text: string, type: string) {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "My Thesis: Draft 2" -> "my-thesis-draft-2". */
export function fileSlug(name: string, fallback: string) {
  return name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;
}
