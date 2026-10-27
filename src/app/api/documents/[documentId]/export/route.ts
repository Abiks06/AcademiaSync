import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSignedOutError } from "@/lib/supabase/auth-errors";
import { readManuscript } from "@/lib/documents/live-document";
import { toDocx, toMarkdown } from "@/lib/documents/export";
import { formatBibliography } from "@/lib/library/bibliography";
import { citationItems, citationMode } from "@/lib/library/citations";
import { citationCounts } from "@/lib/editor/ydoc";
import { citeContext, formatCitation, isCitationStyle } from "@/lib/library/styles";
import { sanitizeAuthors } from "@/lib/library/authors";
import type { Source } from "@/lib/library/types";
import { fileSlug } from "@/lib/download";

const SOURCE_COLUMNS = "id, project_id, kind, title, authors, year, container, volume, issue, pages, publisher, doi, url, notes, created_at, updated_at, deleted_at";

/** Downloads the manuscript as Word (.docx) or Markdown, with citations and references in its style. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/documents/[documentId]/export">) {
  const { documentId } = await params;
  if (!z.string().uuid().safeParse(documentId).success) return NextResponse.json({ error: "Unknown document." }, { status: 404 });
  const format = request.nextUrl.searchParams.get("format") === "md" ? "md" : "docx";

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: "Sign in to export." }, { status: authError && !isSignedOutError(authError) ? 503 : 401 });
  }

  // Row-level security decides: a document outside your projects isn't found.
  const { data: document } = await supabase.from("documents").select("id, project_id, title").eq("id", documentId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const manuscript = await readManuscript(documentId, supabase).catch(() => null);
  if (!manuscript) return NextResponse.json({ error: "Couldn't read the manuscript right now. Try again in a moment." }, { status: 503 });
  const style = isCitationStyle(manuscript.style) ? manuscript.style : "apa";

  // In order of first citation, which numeric styles number by.
  const ids = [...citationCounts(manuscript.json).keys()];
  const { data: rows, error: sourcesError } = ids.length
    ? await supabase.from("sources").select(SOURCE_COLUMNS).eq("project_id", document.project_id).in("id", ids)
    : { data: [], error: null };
  // Better no file than one that quietly lacks its references.
  if (sourcesError) return NextResponse.json({ error: "Couldn't read the references right now. Try again in a moment." }, { status: 503 });
  const byId = new Map((rows ?? []).map((r) => [r.id, { ...r, abstract: null, authors: sanitizeAuthors(r.authors) } as Source]));
  const ctx = citeContext(style, ids, (id) => byId.get(id));
  const cited = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));

  const input = {
    title: document.title,
    json: manuscript.json,
    citationLabel: (attrs: Record<string, unknown>) => formatCitation(citationItems(attrs), citationMode(attrs), ctx),
    references: formatBibliography(cited, style),
  };
  const name = fileSlug(document.title, "manuscript");

  if (format === "md") {
    return new NextResponse(toMarkdown(input), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.md"`, "Cache-Control": "no-store" },
    });
  }
  const buffer = await toDocx(input);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
