-- Server-side saving without the Supabase secret key. The server reads the live manuscript
-- from Liveblocks itself and saves it as the signed-in person, through two functions that
-- check that person's role first:
--   people who can edit (owner, author, contributor) may save the state and add versions,
--   always in their own name; any member may read the saved state back (they can read the
--   live text anyway).
-- Someone who can edit could call these directly, but could only store what they could
-- already type into the manuscript, and history is always attributed to them.
-- With the secret key set, the server keeps using save_document_state directly (needed for
-- the Liveblocks webhook, which has no signed-in person).

create or replace function public.member_save_document_state(
  p_document uuid,
  p_ydoc bytea,
  p_plain_text text,
  p_citations jsonb,
  p_version_content jsonb default null,
  p_label text default null,
  p_min_gap interval default null,
  p_base_revision bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.documents where id = p_document;
  if v_project is null or not public.can_edit_project(v_project) then
    raise exception 'You can''t change this manuscript.' using errcode = '42501';
  end if;
  if octet_length(p_ydoc) > 8 * 1024 * 1024 then
    raise exception 'This manuscript is too large to save.' using errcode = '54000';
  end if;
  return public.save_document_state(
    p_document, p_ydoc, left(p_plain_text, 2000000), p_citations, p_version_content, p_label, (select auth.uid()), p_min_gap, p_base_revision
  );
end;
$$;

create or replace function public.member_document_state(p_document uuid)
returns table (ydoc bytea, revision bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.documents where id = p_document;
  if v_project is null or not public.is_project_member(v_project) then
    raise exception 'You can''t read this manuscript.' using errcode = '42501';
  end if;
  return query select s.ydoc, s.revision from public.document_state s where s.document_id = p_document;
end;
$$;

revoke execute on function public.member_save_document_state(uuid, bytea, text, jsonb, jsonb, text, interval, bigint) from public, anon;
revoke execute on function public.member_document_state(uuid) from public, anon;
grant execute on function public.member_save_document_state(uuid, bytea, text, jsonb, jsonb, text, interval, bigint) to authenticated;
grant execute on function public.member_document_state(uuid) to authenticated;

-- Whether every manuscript in a project has been saved by the server at least once, so the
-- library can tell "cited nowhere" from "not counted yet".
create or replace function public.citation_index_complete(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_project_member(p_project) and not exists (
    select 1 from public.documents d
    where d.project_id = p_project
      and not exists (select 1 from public.document_state s where s.document_id = d.id)
  );
$$;
revoke execute on function public.citation_index_complete(uuid) from public, anon;
grant execute on function public.citation_index_complete(uuid) to authenticated;
