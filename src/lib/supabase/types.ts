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
  created_by: string;
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
      project_invites: Table<ProjectInvite, Pick<ProjectInvite, "project_id" | "email"> & Partial<ProjectInvite>>;
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_project_invite: { Args: { p_token: string }; Returns: string };
      is_project_member: { Args: { p_project: string }; Returns: boolean };
      project_role_of: { Args: { p_project: string }; Returns: ProjectRole };
      can_edit_project: { Args: { p_project: string }; Returns: boolean };
    };
    Enums: { project_role: ProjectRole; document_status: DocumentStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
