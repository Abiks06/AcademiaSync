-- Fixes from the Supabase security and performance advisors.

-- Pin the search path on the last function that didn't set one.
alter function public.touch_updated_at() set search_path = '';

-- Postgres lets everyone execute new functions. Trigger functions are never
-- called directly, and the RLS helpers and invite RPC are for signed-in users only.
revoke execute on function
  public.handle_new_user(),
  public.handle_new_project(),
  public.touch_updated_at(),
  public.touch_project_from_document(),
  public.keep_an_owner()
from public, anon, authenticated;

revoke execute on function
  public.project_role_of(uuid),
  public.is_project_member(uuid),
  public.can_edit_project(uuid),
  public.accept_project_invite(text)
from public, anon;

grant execute on function
  public.project_role_of(uuid),
  public.is_project_member(uuid),
  public.can_edit_project(uuid),
  public.accept_project_invite(text)
to authenticated;

-- Evaluate auth.uid() once per query instead of once per row.
alter policy "Read own profile and teammates" on public.profiles
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
alter policy "Update own profile" on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "Members read projects" on public.projects
  using (public.is_project_member(id) or created_by = (select auth.uid()));
alter policy "Signed-in users create projects" on public.projects
  with check (created_by = (select auth.uid()));
alter policy "Owners remove members, members leave" on public.project_members
  using (public.project_role_of(project_id) = 'owner' or user_id = (select auth.uid()));
alter policy "Editors create documents" on public.documents
  with check (public.can_edit_project(project_id) and created_by = (select auth.uid()));
alter policy "Editors save versions" on public.document_versions
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.documents d where d.id = document_id and public.can_edit_project(d.project_id))
  );
alter policy "Owners and authors invite" on public.project_invites
  with check (public.project_role_of(project_id) in ('owner', 'author') and invited_by = (select auth.uid()));

-- Cover the remaining foreign keys so profile deletes don't scan these tables.
create index document_versions_created_by_idx on public.document_versions (created_by);
create index project_invites_invited_by_idx on public.project_invites (invited_by);
