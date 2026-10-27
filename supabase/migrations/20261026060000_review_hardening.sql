-- Hardening from the round 1 review that the library work didn't cover.

-- Invites: the database picks the token, the expiry and who sent it. An author can't
-- choose a guessable token or an invite that never expires.
revoke insert on public.project_invites from anon, authenticated;
grant insert (project_id, email, role) on public.project_invites to authenticated;

-- Projects and documents: clients can't backdate rows or pick ids.
revoke insert on public.projects from anon, authenticated;
grant insert (name, description, field, accent, created_by, client_request_id) on public.projects to authenticated;
revoke insert on public.documents from anon, authenticated;
grant insert (project_id, title, created_by, client_request_id) on public.documents to authenticated;

-- A creator who has been removed from their project stops seeing it. The creator clause
-- only exists so the insert can return the new row before the owner membership is visible,
-- and in that transaction created_at equals now().
alter policy "Members read projects" on public.projects
  using (public.is_project_member(id) or (created_by = (select auth.uid()) and created_at = now()));

-- Profiles: sensible lengths, and an ORCID iD can't be claimed by typing it in.
-- It will be set by a verified "Link ORCID" sign-in instead.
alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) <= 120),
  add constraint profiles_institution_length check (char_length(institution) <= 200),
  add constraint profiles_avatar_url_check check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 1000)),
  add constraint profiles_orcid_format check (orcid is null or orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$');
revoke update on public.profiles from anon, authenticated;
grant update (full_name, institution) on public.profiles to authenticated;

alter table public.document_versions
  add constraint document_versions_label_length check (char_length(label) <= 120),
  add constraint document_versions_plain_text_size check (char_length(plain_text) <= 2000000);

-- Sign-up metadata is chosen by the person signing up, so keep only a sane name and a
-- web avatar link; anything else is dropped rather than failing the sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 120);
  avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  if avatar is not null and (avatar !~* '^https://' or char_length(avatar) > 1000) then
    avatar := null;
  end if;
  insert into public.profiles (id, full_name, avatar_url) values (new.id, name, avatar);
  return new;
end;
$$;
