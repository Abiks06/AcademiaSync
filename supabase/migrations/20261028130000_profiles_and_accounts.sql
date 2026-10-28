-- Profiles people can shape, a picture of their own, and an account they can leave.

-- Profiles ---------------------------------------------------------------------

-- How a researcher is introduced to co-authors: "PhD candidate", "Associate Professor",
-- and the field they work in. onboarded_at marks the first-run welcome as done.
alter table public.profiles
  add column if not exists position text,
  add column if not exists field text,
  add column if not exists onboarded_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_position_length,
  drop constraint if exists profiles_field_length,
  add constraint profiles_position_length check (char_length(position) <= 80),
  add constraint profiles_field_length check (char_length(field) <= 80);

-- Everyone who already had an account and a real name has, in effect, been welcomed.
-- Only names that were filled in from the email address get the welcome screen.
update public.profiles p
set onboarded_at = coalesce(p.onboarded_at, now())
from auth.users u
where u.id = p.id
  and p.full_name is not null
  and p.full_name <> split_part(u.email, '@', 1);

revoke update on public.profiles from anon, authenticated;
grant update (full_name, institution, position, field, onboarded_at) on public.profiles to authenticated;

-- Pictures -------------------------------------------------------------------------

-- Public, because a picture is shown wherever a collaborator appears. 2 MB, still images only.
-- Each person writes only inside their own folder: avatars/{user id}/{file}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "People upload their own picture" on storage.objects;
create policy "People upload their own picture" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/[a-z0-9-]{1,64}\.(png|jpg|webp)$')
  );

drop policy if exists "People see their own pictures" on storage.objects;
create policy "People see their own pictures" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);

drop policy if exists "People remove their own pictures" on storage.objects;
create policy "People remove their own pictures" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);

-- avatar_url stays closed to clients: a link typed there would be loaded by every
-- teammate's browser, from any server. An uploaded picture is recorded by its path in the
-- avatars bucket instead, and the app builds the link. Sign-up still copies a Google
-- picture into avatar_url (see handle_new_user); a picture of one's own takes precedence.
alter table public.profiles
  add column if not exists avatar_path text;
alter table public.profiles
  drop constraint if exists profiles_avatar_path_format,
  add constraint profiles_avatar_path_format
    check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[a-z0-9-]{1,64}\.(png|jpg|webp)$');

-- Points the profile at a picture this person uploaded, or clears both pictures with null.
create or replace function public.set_my_avatar(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in to change your picture.' using errcode = '42501';
  end if;
  if p_path is null then
    update public.profiles set avatar_path = null, avatar_url = null where id = me;
    return;
  end if;
  if split_part(p_path, '/', 1) <> me::text
     or not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
    raise exception 'That picture isn''t one of your uploads.' using errcode = '22023';
  end if;
  update public.profiles set avatar_path = p_path where id = me;
end;
$$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

-- Leaving --------------------------------------------------------------------------

-- What deleting this account would do: projects that would be deleted with it (nobody
-- else is in them) and projects that block it (others are in them and this person is the
-- only owner, so they must hand over ownership first).
create or replace function public.account_deletion_preview()
returns table (project_id uuid, project_name text, outcome text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name,
    case
      when not exists (select 1 from public.project_members o where o.project_id = p.id and o.user_id <> m.user_id) then 'deleted'
      when m.role = 'owner' and not exists (
        select 1 from public.project_members o where o.project_id = p.id and o.user_id <> m.user_id and o.role = 'owner'
      ) then 'blocks'
      else 'leaves'
    end
  from public.project_members m
  join public.projects p on p.id = m.project_id
  where m.user_id = (select auth.uid())
  order by p.name;
$$;
revoke execute on function public.account_deletion_preview() from public, anon;
grant execute on function public.account_deletion_preview() to authenticated;

-- Deletes the caller's account for good. Projects only they belong to go with it; in
-- shared projects their writing stays and is no longer attributed to them.
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_email text;
begin
  if me is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;
  select email into my_email from auth.users where id = me;
  if lower(trim(coalesce(p_confirm, ''))) <> lower(coalesce(my_email, '')) then
    raise exception 'Type your email address exactly to confirm.' using errcode = '22023';
  end if;
  if exists (select 1 from public.account_deletion_preview() where outcome = 'blocks') then
    raise exception 'Make someone else an owner of your shared projects first.' using errcode = 'P0001';
  end if;

  delete from public.projects p
  where exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = me)
    and not exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id <> me);

  -- The profile, memberships and pending invites cascade from here.
  delete from auth.users where id = me;
end;
$$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
