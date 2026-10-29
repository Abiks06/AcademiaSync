-- Project files: papers, drafts, data sheets and reviewer letters that every member can open.
-- Each file lives in the private "project-files" Storage bucket at {project_id}/{file_id}/{name},
-- and has a row here. Uploads and downloads go straight between the browser and Storage with
-- the member's own session or a short-lived signed link, never through the app server.

-- 50 MB a file. Office formats with macros (.docm and the like) are not on the list.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files', 'project-files', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/markdown',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The project a Storage path belongs to: its first folder, or null when that isn't an id.
create or replace function public.storage_project(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy "Members read project files" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.is_project_member(public.storage_project(name)));

-- Only into {project}/{file id}/{name}, and never over an existing file (there is no update policy).
create policy "Editors upload project files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]{1,255}$'
    and public.can_edit_project(public.storage_project(name))
  );

create policy "Owners, authors and the uploader delete project files" on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (
      public.project_role_of(public.storage_project(name)) in ('owner', 'author')
      or (owner_id = (select auth.uid())::text and public.can_edit_project(public.storage_project(name)))
    )
  );

create table public.project_files (
  -- Chosen by the uploader's browser, because it is also the file's folder in Storage.
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  -- Both read from Storage when the row is added, not taken from the client.
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes between 0 and 52428800),
  storage_path text not null unique check (
    split_part(storage_path, '/', 1) = project_id::text and split_part(storage_path, '/', 2) = id::text
  ),
  -- A paper can be attached to its entry in the library, so citations can open it.
  source_id uuid references public.sources (id) on delete set null,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_files_project_idx on public.project_files (project_id, created_at desc);
create index project_files_source_idx on public.project_files (source_id) where source_id is not null;
create index project_files_uploaded_by_idx on public.project_files (uploaded_by);

create trigger project_files_touch before update on public.project_files
  for each row execute function public.touch_updated_at();

-- A row can only describe a file that was really uploaded: its size and type come from Storage,
-- and each project keeps to 1 GB.
create or replace function public.project_files_from_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb;
  used bigint;
begin
  select o.metadata into meta from storage.objects o
   where o.bucket_id = 'project-files' and o.name = new.storage_path;
  if not found then
    raise exception 'That file hasn''t finished uploading.' using errcode = '23514';
  end if;
  new.size_bytes := coalesce((meta ->> 'size')::bigint, 0);
  new.mime_type := coalesce(meta ->> 'mimetype', '');
  select coalesce(sum(size_bytes), 0) into used from public.project_files where project_id = new.project_id;
  if used + new.size_bytes > 1073741824 then
    raise exception 'This project''s files would go over 1 GB. Delete some to make room.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.project_files_from_storage() from public, anon, authenticated;

create trigger project_files_from_storage before insert on public.project_files
  for each row execute function public.project_files_from_storage();

-- Attached sources must be in the same project.
create or replace function public.project_files_same_project_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_id is not null and not exists (
    select 1 from public.sources s where s.id = new.source_id and s.project_id = new.project_id
  ) then
    raise exception 'That source isn''t in this project.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.project_files_same_project_source() from public, anon, authenticated;

create trigger project_files_same_project_source before insert or update of source_id on public.project_files
  for each row execute function public.project_files_same_project_source();

-- Clients choose the name, place and attached source; the database fills in the rest.
revoke insert, update on public.project_files from anon, authenticated;
grant insert (id, project_id, name, storage_path, source_id, uploaded_by) on public.project_files to authenticated;
grant update (name, source_id) on public.project_files to authenticated;

alter table public.project_files enable row level security;

create policy "Members read project files" on public.project_files for select to authenticated
  using (public.is_project_member(project_id));
create policy "Editors add project files" on public.project_files for insert to authenticated
  with check (public.can_edit_project(project_id) and uploaded_by = (select auth.uid()));
create policy "Editors rename and attach project files" on public.project_files for update to authenticated
  using (public.can_edit_project(project_id));
create policy "Owners, authors and the uploader delete project files" on public.project_files for delete to authenticated
  using (
    public.project_role_of(project_id) in ('owner', 'author')
    or (uploaded_by = (select auth.uid()) and public.can_edit_project(project_id))
  );

-- Open file shelves hear about new and removed files as they happen.
alter publication supabase_realtime add table public.project_files;
