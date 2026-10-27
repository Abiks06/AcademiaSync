// Hand-written to match supabase/migrations. Regenerate with
// `npx supabase gen types typescript --linked > src/lib/supabase/types.ts`
// once the project is linked.

export type ProjectRole = "owner" | "author" | "contributor" | "commenter" | "reviewer";
export type DocumentStatus = "draft" | "in_review" | "final";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  institution: string | null;
  orcid: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  field: string | null;
  accent: string;
  created_by: string | null;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
};

export type DocumentRow = {
  id: string;
  project_id: string;
  title: string;
  status: DocumentStatus;
  created_by: string | null;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentVersion = {
  id: string;
  document_id: string;
  label: string | null;
  content: unknown;
  plain_text: string;
  created_by: string | null;
  created_at: string;
};

export type SourceRow = {
  id: string;
  project_id: string;
  kind: "article" | "book" | "chapter" | "conference" | "thesis" | "report" | "web" | "dataset" | "other";
  title: string;
  authors: { family: string; given: string }[];
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
  created_by: string | null;
  client_request_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DocumentState = {
  document_id: string;
  /** bytea, sent and received as a "\\x…" hex string. */
  ydoc: string;
  plain_text: string;
  revision: number;
  updated_at: string;
};

export type DocumentCitation = { document_id: string; source_id: string; citations: number };

export type ProjectInvite = {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Pick<Profile, "id"> & Partial<Profile>>;
      projects: Table<
        Project,
        Pick<Project, "name"> & Partial<Omit<Project, "id" | "created_at" | "updated_at">>
      >;
      project_members: Table<ProjectMember, Pick<ProjectMember, "project_id" | "user_id"> & Partial<ProjectMember>>;
      documents: Table<DocumentRow, Pick<DocumentRow, "project_id"> & Partial<DocumentRow>>;
      document_versions: Table<
        DocumentVersion,
        Pick<DocumentVersion, "document_id" | "content"> & Partial<DocumentVersion>
      >;
      sources: Table<
        SourceRow,
        Pick<SourceRow, "project_id" | "title"> & Partial<Omit<SourceRow, "id" | "created_at" | "updated_at" | "deleted_at">>,
        Partial<Omit<SourceRow, "id" | "project_id" | "created_by" | "client_request_id" | "created_at" | "updated_at" | "deleted_at">>
      >;
      project_invites: Table<ProjectInvite, Pick<ProjectInvite, "project_id" | "email"> & Partial<ProjectInvite>>;
      document_state: Table<DocumentState, DocumentState>;
      document_citations: Table<DocumentCitation, DocumentCitation>;
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_project_invite: { Args: { p_token: string }; Returns: string };
      is_project_member: { Args: { p_project: string }; Returns: boolean };
      project_role_of: { Args: { p_project: string }; Returns: ProjectRole };
      can_edit_project: { Args: { p_project: string }; Returns: boolean };
      set_source_deleted: { Args: { p_source: string; p_deleted: boolean }; Returns: string | null };
      invite_preview: {
        Args: { p_token: string };
        Returns: { project_name: string; inviter_name: string; role: ProjectRole; email_hint: string; state: "open" | "used" | "expired" }[];
      };
      save_document_state: {
        Args: {
          p_document: string;
          p_ydoc: string;
          p_plain_text: string;
          p_citations: { sourceId: string; count: number }[];
          p_version_content?: unknown;
          p_label?: string | null;
          p_created_by?: string | null;
          p_min_gap?: string | null;
          p_base_revision?: number | null;
        };
        Returns: string | null;
      };
      member_save_document_state: {
        Args: Omit<Database["public"]["Functions"]["save_document_state"]["Args"], "p_created_by">;
        Returns: string | null;
      };
      member_document_state: { Args: { p_document: string }; Returns: { ydoc: string; revision: number }[] };
    };
    Enums: { project_role: ProjectRole; document_status: DocumentStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
