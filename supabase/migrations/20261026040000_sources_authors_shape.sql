-- Authors must be a list of {family, given?} objects. The app assumes that shape when
-- it formats references, so a malformed row written straight through the API would
-- otherwise break the library page for the whole project.
create function public.is_valid_source_authors(a jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(a) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(a) e
      where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'family') is distinct from 'string'
        or char_length(e ->> 'family') not between 1 and 100
        or (e ? 'given' and (jsonb_typeof(e -> 'given') <> 'string' or char_length(e ->> 'given') > 100))
    );
$$;

alter table public.sources
  add constraint sources_authors_shape check (public.is_valid_source_authors(authors));
