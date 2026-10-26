export const SOURCE_KINDS = ["article", "book", "chapter", "conference", "thesis", "report", "web", "dataset", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const KIND_LABEL: Record<SourceKind, string> = {
  article: "Journal article",
  book: "Book",
  chapter: "Book chapter",
  conference: "Conference paper",
  thesis: "Thesis",
  report: "Report",
  web: "Web page",
  dataset: "Dataset",
  other: "Other",
};

export type Author = { family: string; given: string };

/** The fields a person edits. A saved source adds an id and timestamps on top. */
export type SourceFields = {
  kind: SourceKind;
  title: string;
  authors: Author[];
  year: number | null;
  container: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  notes: string | null;
};

export type Source = SourceFields & { id: string; project_id: string; created_at: string };
