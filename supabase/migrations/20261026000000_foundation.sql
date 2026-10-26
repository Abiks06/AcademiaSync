-- AcademiaSync v2 foundation schema.
-- Every table has row-level security; the database itself refuses access
-- to projects a user is not a member of.

create extension if not exists pgcrypto;

create type public.project_role as enum ('owner', 'author', 'contributor', 'commenter', 'reviewer');
create type public.document_status as enum ('draft', 'in_review', 'final');

-- Profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  institution text,
  orcid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this migration get a profile too.
insert into public.profiles (id, full_name, avatar_url)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- Projects and membership ----------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 600),
  field text check (char_length(field) <= 80),
  accent text not null default 'iris' check (accent in ('iris', 'teal', 'amber', 'rose')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Set by the form that created the row, so a resubmitted form finds its
  -- first project instead of making a second one.
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_request_id)
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_role not null default 'author',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_idx on public.project_members (user_id);

-- Security-definer helpers avoid recursive RLS lookups on project_members.
create or replace function public.project_role_of(p_project uuid)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.project_members
  where project_id = p_project and user_id = auth.uid();
$$;

create or replace function public.is_project_member(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.project_role_of(p_project) in ('owner', 'author', 'contributor'), false);
$$;

-- The creator becomes the owner automatically.
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- Documents ------------------------------------------------------------------
-- Live text is held by the collaboration room (Yjs). This table holds
-- metadata; document_versions holds snapshots for history, search and export.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default 'Untitled manuscript' check (char_length(title) between 1 and 200),
  status public.document_status not null default 'draft',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_request_id)
);

create index documents_project_idx on public.documents (project_id);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  label text,
  content jsonb not null,
  plain_text text not null default '',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_versions_document_idx on public.document_versions (document_id, created_at desc);

-- Invites --------------------------------------------------------------------

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (position('@' in email) > 1 and email = lower(email)),
  role public.project_role not null default 'author' check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);

-- Only one open invite per address; accepted invites don't block a re-invite.
create unique index project_invites_open_idx on public.project_invites (project_id, email)
  where accepted_at is null;

-- Accepting an invite checks the token and the signed-in user's email.
create or replace function public.accept_project_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.project_invites;
  user_email text;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    raise exception 'Sign in with the email address the invite was sent to.';
  end if;
  -- Lock the invite so a concurrent revoke can't race the acceptance.
  select * into inv from public.project_invites
    where token = p_token and accepted_at is null and expires_at > now()
    for update;
  if inv.id is null then
    raise exception 'This invite link is invalid or has expired.';
  end if;
  if inv.email <> lower(user_email) then
    raise exception 'This invite was sent to a different email address.';
  end if;
  insert into public.project_members (project_id, user_id, role)
    values (inv.project_id, auth.uid(), inv.role)
    on conflict (project_id, user_id) do nothing;
  update public.project_invites set accepted_at = now() where id = inv.id;
  return inv.project_id;
end;
$$;

-- updated_at bookkeeping -----------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function public.touch_updated_at();

create or replace function public.touch_project_from_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end;
$$;

create trigger documents_touch_project
  after insert or update on public.documents
  for each row execute function public.touch_project_from_document();

-- Every project keeps at least one owner. Deleting the project, or the owner's
-- whole account, is still allowed.
create or replace function public.keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.projects where id = old.project_id)
     and exists (select 1 from public.profiles where id = old.user_id)
     and not exists (
       select 1 from public.project_members
       where project_id = old.project_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'A project needs at least one owner. Make someone else an owner first.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger project_members_keep_owner
  before update or delete on public.project_members
  for each row execute function public.keep_an_owner();

-- Column-level privileges: clients can only change what the UI edits.
-- Authorship, ownership and timestamps are set by the database.
revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, institution, orcid) on public.profiles to authenticated;

revoke update on public.projects from anon, authenticated;
grant update (name, description, field, accent) on public.projects to authenticated;

revoke insert, update on public.project_members from anon, authenticated;
grant update (role) on public.project_members to authenticated;

revoke update on public.documents from anon, authenticated;
grant update (title, status) on public.documents to authenticated;

revoke insert, update on public.document_versions from anon, authenticated;
grant insert (document_id, label, content, plain_text) on public.document_versions to authenticated;

revoke update on public.project_invites from anon, authenticated;

-- Row-level security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.project_invites enable row level security;

create policy "Read own profile and teammates" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy "Update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- created_by is immutable (see grants), so the creator clause only matters for
-- the row returned by the insert, before the owner membership is visible.
create policy "Members read projects" on public.projects for select to authenticated
  using (public.is_project_member(id) or created_by = auth.uid());
create policy "Signed-in users create projects" on public.projects for insert to authenticated
  with check (created_by = auth.uid());
create policy "Owners and authors update projects" on public.projects for update to authenticated
  using (public.project_role_of(id) in ('owner', 'author'));
create policy "Owners delete projects" on public.projects for delete to authenticated
  using (public.project_role_of(id) = 'owner');

create policy "Members read membership" on public.project_members for select to authenticated
  using (public.is_project_member(project_id));
create policy "Owners change roles" on public.project_members for update to authenticated
  using (public.project_role_of(project_id) = 'owner');
create policy "Owners remove members, members leave" on public.project_members for delete to authenticated
  using (public.project_role_of(project_id) = 'owner' or user_id = auth.uid());

create policy "Members read documents" on public.documents for select to authenticated
  using (public.is_project_member(project_id));
create policy "Editors create documents" on public.documents for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = auth.uid());
create policy "Editors update documents" on public.documents for update to authenticated
  using (public.can_edit_project(project_id));
create policy "Owners and authors delete documents" on public.documents for delete to authenticated
  using (public.project_role_of(project_id) in ('owner', 'author'));

create policy "Members read versions" on public.document_versions for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and public.is_project_member(d.project_id)));
create policy "Editors save versions" on public.document_versions for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and public.can_edit_project(d.project_id))
  );

create policy "Owners and authors see invites" on public.project_invites for select to authenticated
  using (public.project_role_of(project_id) in ('owner', 'author'));
create policy "Owners and authors invite" on public.project_invites for insert to authenticated
  with check (public.project_role_of(project_id) in ('owner', 'author') and invited_by = auth.uid());
create policy "Owners and authors revoke invites" on public.project_invites for delete to authenticated
  using (public.project_role_of(project_id) in ('owner', 'author'));
