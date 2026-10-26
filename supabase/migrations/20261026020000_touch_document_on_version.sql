-- Saving a snapshot counts as editing the manuscript, so "Updated 3 minutes ago"
-- on the project page reflects real writing activity, not just renames.
create or replace function public.touch_document_from_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents set updated_at = now() where id = new.document_id;
  return new;
end;
$$;

create trigger document_versions_touch_document
  after insert on public.document_versions
  for each row execute function public.touch_document_from_version();

revoke execute on function public.touch_document_from_version() from public, anon, authenticated;
