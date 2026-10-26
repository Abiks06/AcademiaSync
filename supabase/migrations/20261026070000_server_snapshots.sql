-- The server keeps the manuscript. Liveblocks holds the live text; every change is copied
-- here by the server (from a Liveblocks webhook or an editor's idle ping), so Supabase
-- always has the latest text, which sources it cites, and a history only the server writes.

-- The latest Yjs document of every manuscript, as one binary update. Only the server reads
-- or writes it (with the secret key); browsers never see this table.
create table public.document_state (
  document_id uuid primary key references public.documents (id) on delete cascade,
  ydoc bytea not null,
  plain_text text not null default '' check (char_length(plain_text) <= 2000000),
  updated_at timestamptz not null default now()
);
alter table public.document_state enable row level security;
revoke all on public.document_state from anon, authenticated;

-- Which sources each manuscript cites, and how often, so the library can say
-- "cited 40 times in 3 manuscripts" before anything is deleted.
create table public.document_citations (
  document_id uuid not null references public.documents (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  citations integer not null check (citations > 0),
  primary key (document_id, source_id)
);
create index document_citations_source_idx on public.document_citations (source_id);
alter table public.document_citations enable row level security;
revoke all on public.document_citations from anon, authenticated;
grant select on public.document_citations to authenticated;
create policy "Members read citations" on public.document_citations for select to authenticated
  using (exists (
    select 1 from public.documents d where d.id = document_id and (select public.is_project_member(d.project_id))
  ));

-- History is written by the server from the live document, never by browsers.
revoke insert on public.document_versions from anon, authenticated;
drop policy "Editors save versions" on public.document_versions;

-- Stores the latest state, refreshes the citation index and, when asked, adds a version.
-- One transaction per document at a time, so two webhook deliveries can't both add an
-- automatic version. p_min_gap set means "automatic": skip the version if nothing changed
-- or the last one is newer than the gap. Returns the new version's id, or null.
create or replace function public.save_document_state(
  p_document uuid,
  p_ydoc bytea,
  p_plain_text text,
  p_citations jsonb,
  p_version_content jsonb default null,
  p_label text default null,
  p_created_by uuid default null,
  p_min_gap interval default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  last_version record;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_document::text, 0));

  insert into public.document_state (document_id, ydoc, plain_text, updated_at)
  values (p_document, p_ydoc, p_plain_text, now())
  on conflict (document_id) do update set ydoc = excluded.ydoc, plain_text = excluded.plain_text, updated_at = now();

  -- Only sources of the manuscript's own project are indexed; a citation pasted from
  -- another project is left out.
  delete from public.document_citations where document_id = p_document;
  insert into public.document_citations (document_id, source_id, citations)
  select p_document, s.id, (c ->> 'count')::integer
  from jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c
  join public.sources s on s.id = (c ->> 'sourceId')::uuid
  join public.documents d on d.id = p_document and d.project_id = s.project_id
  where (c ->> 'count')::integer > 0;

  if p_version_content is null then
    return null;
  end if;

  if p_min_gap is not null then
    select plain_text, created_at into last_version
    from public.document_versions where document_id = p_document
    order by created_at desc limit 1;
    if found and (last_version.plain_text = p_plain_text or last_version.created_at > now() - p_min_gap) then
      return null;
    end if;
  end if;

  insert into public.document_versions (document_id, label, content, plain_text, created_by)
  values (p_document, nullif(left(p_label, 120), ''), p_version_content, p_plain_text, p_created_by)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.save_document_state(uuid, bytea, text, jsonb, jsonb, text, uuid, interval) from public, anon, authenticated;
grant execute on function public.save_document_state(uuid, bytea, text, jsonb, jsonb, text, uuid, interval) to service_role;
