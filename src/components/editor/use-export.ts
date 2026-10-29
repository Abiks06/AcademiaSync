"use client";

import { useToast } from "@/components/ui/toast";
import type { CitationStyle } from "@/lib/library/styles";

/**
 * Downloads an export without leaving the editor; a failure is a toast, never a raw error page.
 * It asks for the style the person is looking at, so the file always matches the editor. If
 * some citations point to sources no longer in the library, the toast says so and offers to
 * export anyway (those print as "(?)").
 */
export function useExport(documentId: string, title: string, style: CitationStyle) {
  const toast = useToast();
  const download = async (format: "docx" | "md", allowMissing = false) => {
    try {
      const params = new URLSearchParams({ format, style, ...(allowMissing && { allowMissing: "1" }) });
      const res = await fetch(`/api/documents/${documentId}/export?${params}`);
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409) {
          toast({
            tone: "info",
            title: "Some citations have no source",
            description: `${error ?? "Some citations point to deleted sources."} Fix them in the editor, or export as it is.`,
            action: { label: "Export anyway", onClick: () => void download(format, true) },
            duration: 12_000,
          });
          return;
        }
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
  return (format: "docx" | "md") => download(format);
}
