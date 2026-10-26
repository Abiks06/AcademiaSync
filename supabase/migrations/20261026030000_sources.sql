-- Reference library: the papers, books and datasets a project cites.
-- Citations in a manuscript point at a row here by id.

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'article'
    check (kind in ('article', 'book', 'chapter', 'conference', 'thesis', 'report', 'web', 'dataset', 'other')),
  title text not null check (char_length(title) between 1 and 500),
  -- [{"family": "Hidalgo-Ruz", "given": "Valeria"}, ...] in citation order.
  authors jsonb not null default '[]' check (jsonb_typeof(authors) = 'array' and jsonb_array_length(authors) <= 100),
  year integer check (year between 1000 and 2200),
  container text check (char_length(container) <= 300),
  volume text check (char_length(volume) <= 40),
  issue text check (char_length(issue) <= 40),
  pages text check (char_length(pages) <= 40),
  publisher text check (char_length(publisher) <= 300),
  doi text check (doi ~ '^10\.\d{4,9}/\S+$' and char_length(doi) <= 200),
  url text check (url ~ '^https?://' and char_length(url) <= 2000),
  abstract text check (char_length(abstract) <= 10000),
  notes text check (char_length(notes) <= 5000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Lets a resubmitted form find the source it already created.
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, client_request_id)
);

create index sources_project_idx on public.sources (project_id, created_at desc);
create index sources_created_by_idx on public.sources (created_by);
-- A DOI appears once per project, whatever its letter case.
create unique index sources_project_doi_idx on public.sources (project_id, lower(doi)) where doi is not null;

create trigger sources_touch before update on public.sources
  for each row execute function public.touch_updated_at();

-- Clients choose the content, the database chooses ownership and timestamps.
revoke update on public.sources from anon, authenticated;
grant update (kind, title, authors, year, container, volume, issue, pages, publisher, doi, url, abstract, notes)
  on public.sources to authenticated;

alter table public.sources enable row level security;

create policy "Members read sources" on public.sources for select to authenticated
  using (public.is_project_member(project_id));
create policy "Editors add sources" on public.sources for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = (select auth.uid()));
create policy "Editors update sources" on public.sources for update to authenticated
  using (public.can_edit_project(project_id));
create policy "Owners, authors and the adder delete sources" on public.sources for delete to authenticated
  using (
    public.project_role_of(project_id) in ('owner', 'author')
    or (created_by = (select auth.uid()) and public.can_edit_project(project_id))
  );
