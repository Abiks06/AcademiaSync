-- Reference library hardening, from the round 2 review.

-- Clients choose a source's content. The database chooses its id and timestamps,
-- so nobody can backdate "Added …" or the library's order.
revoke insert on public.sources from anon, authenticated;
grant insert (project_id, kind, title, authors, year, container, volume, issue, pages, publisher,
              doi, url, abstract, notes, created_by, client_request_id)
  on public.sources to authenticated;

-- "HTTPS://example.org" is a fine link; the form accepts any letter case, so the database does too.
alter table public.sources drop constraint sources_url_check;
alter table public.sources add constraint sources_url_check check (url ~* '^https?://' and char_length(url) <= 2000);

-- Deleting a source hides it instead of erasing it. Citations of it keep their reference,
-- show a warning, and the source can be put back.
alter table public.sources add column deleted_at timestamptz;

-- A deleted source doesn't block adding the same DOI again.
drop index public.sources_project_doi_idx;
create unique index sources_project_doi_idx on public.sources (project_id, lower(doi))
  where doi is not null and deleted_at is null;

-- Same rule as before for who may delete: owners and authors, or the person who added it.
create or replace function public.set_source_deleted(p_source uuid, p_deleted boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  result timestamptz;
begin
  update public.sources
     set deleted_at = case when p_deleted then now() else null end
   where id = p_source
     and (public.project_role_of(project_id) in ('owner', 'author')
          or (created_by = auth.uid() and public.can_edit_project(project_id)))
  returning deleted_at into result;
  if not found then
    raise exception 'You can''t delete this source, or it no longer exists.' using errcode = '42501';
  end if;
  return result;
end;
$$;

revoke execute on function public.set_source_deleted(uuid, boolean) from public, anon;
grant execute on function public.set_source_deleted(uuid, boolean) to authenticated;

-- Rows are never erased by clients now; deleting goes through set_source_deleted.
drop policy "Owners, authors and the adder delete sources" on public.sources;
revoke delete on public.sources from anon, authenticated;

-- Open editors hear about library changes as they happen.
alter publication supabase_realtime add table public.sources;
