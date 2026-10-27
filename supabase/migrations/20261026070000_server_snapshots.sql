-- The server keeps the manuscript. Liveblocks holds the live text; every change is copied
-- here by the server (from a Liveblocks webhook or an editor's idle ping), so Supabase
-- always has the latest text, which sources it cites, and a history only the server writes.

-- The latest Yjs document of every manuscript, as one binary update. Only the server reads
-- or writes it (with the secret key); browsers never see this table.
create table public.document_state (
  document_id uuid primary key references public.documents (id) on delete cascade,
  ydoc bytea not null,
  plain_text text not null default '' check (char_length(plain_text) <= 2000000),
  -- Goes up by one on every save. A save names the revision it merged with, so an older
  -- snapshot can never be written over a newer one.
  revision bigint not null default 1,
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

-- History is written by the server from the live document, never by browsers. Browser
-- inserts are switched off in 20261027110000, after the code that no longer needs them is
-- live, so the site keeps saving versions during the deploy.

-- Stores the latest state, refreshes the citation index and, when asked, adds a version.
-- One transaction per document at a time, so two webhook deliveries can't both add an
-- automatic version. p_base_revision is the revision the caller read and merged with (null
-- when there was none); if someone saved since, this raises 40001 and the caller merges again. p_min_gap set means "automatic": skip the version if nothing changed
-- or the last one is newer than the gap. Returns the new version's id, or null.
create or replace function public.save_document_state(
  p_document uuid,
  p_ydoc bytea,
  p_plain_text text,
  p_citations jsonb,
  p_version_content jsonb default null,
  p_label text default null,
  p_created_by uuid default null,
  p_min_gap interval default null,
  p_base_revision bigint default null
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

  if p_base_revision is distinct from (select revision from public.document_state where document_id = p_document) then
    raise exception 'The manuscript was saved by someone else meanwhile.' using errcode = '40001';
  end if;

  insert into public.document_state (document_id, ydoc, plain_text, updated_at)
  values (p_document, p_ydoc, p_plain_text, now())
  on conflict (document_id) do update
    set ydoc = excluded.ydoc, plain_text = excluded.plain_text, revision = document_state.revision + 1, updated_at = now();

  -- Only sources of the manuscript's own project are indexed; a citation pasted from
  -- another project is left out.
  delete from public.document_citations where document_id = p_document;
  -- Ids and counts come from the shared document, which any editor can write, so anything
  -- malformed is skipped rather than allowed to make every save fail.
  insert into public.document_citations (document_id, source_id, citations)
  select p_document, s.id, least(sum(c.citations), 1000000)::integer
  from (
    select
      case when e ->> 'sourceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (e ->> 'sourceId')::uuid end as source_id,
      case when jsonb_typeof(e -> 'count') = 'number' and (e ->> 'count') ~ '^[0-9]{1,6}$'
        then (e ->> 'count')::integer end as citations
    from jsonb_array_elements(case when jsonb_typeof(p_citations) = 'array' then p_citations else '[]'::jsonb end) e
  ) c
  join public.sources s on s.id = c.source_id
  join public.documents d on d.id = p_document and d.project_id = s.project_id
  where c.citations > 0
  group by s.id;

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

revoke execute on function public.save_document_state(uuid, bytea, text, jsonb, jsonb, text, uuid, interval, bigint) from public, anon, authenticated;
grant execute on function public.save_document_state(uuid, bytea, text, jsonb, jsonb, text, uuid, interval, bigint) to service_role;
