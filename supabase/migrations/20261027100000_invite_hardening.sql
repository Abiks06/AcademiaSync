-- An invite only works while the person who sent it may still invite (owner or author).
-- Otherwise a removed author could invite a second address of their own and walk back in.
-- Open invites are also withdrawn as soon as their sender loses that role.

create or replace function public.accept_project_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.project_invites;
  user_email text;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    raise exception 'Sign in with the email address the invite was sent to.';
  end if;
  -- Lock the invite so a concurrent revoke can't race the acceptance.
  select * into inv from public.project_invites
    where token = p_token and accepted_at is null and expires_at > now()
    for update;
  if inv.id is null then
    raise exception 'This invite link is invalid or has expired.';
  end if;
  if inv.email <> lower(user_email) then
    raise exception 'This invite was sent to a different email address.';
  end if;
  if not exists (
    select 1 from public.project_members
    where project_id = inv.project_id and user_id = inv.invited_by and role in ('owner', 'author')
  ) then
    raise exception 'This invite is no longer valid. Ask a project owner for a new one.';
  end if;
  insert into public.project_members (project_id, user_id, role)
    values (inv.project_id, auth.uid(), inv.role)
    on conflict (project_id, user_id) do nothing;
  update public.project_invites set accepted_at = now() where id = inv.id;
  return inv.project_id;
end;
$$;

create or replace function public.withdraw_invites_of_former_inviter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.role not in ('owner', 'author') then
    delete from public.project_invites
    where project_id = old.project_id and invited_by = old.user_id and accepted_at is null;
  end if;
  return null;
end;
$$;
revoke execute on function public.withdraw_invites_of_former_inviter() from public, anon, authenticated;

drop trigger if exists withdraw_invites_of_former_inviter on public.project_members;
create trigger withdraw_invites_of_former_inviter
  after delete or update of role on public.project_members
  for each row execute function public.withdraw_invites_of_former_inviter();
