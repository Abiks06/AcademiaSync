-- What the invite page shows before the person signs in: the project, who invited them,
-- the role, and a hint of the address it was sent to. The token itself is the secret, so
-- nothing is returned for a wrong one, and the full address is never shown.
create or replace function public.invite_preview(p_token text)
returns table (project_name text, inviter_name text, role public.project_role, email_hint text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.name,
    coalesce(pr.full_name, 'A colleague'),
    i.role,
    left(i.email, 1) || '•••' || substr(i.email, position('@' in i.email)),
    case when i.accepted_at is not null then 'used' when i.expires_at <= now() then 'expired' else 'open' end
  from public.project_invites i
  join public.projects p on p.id = i.project_id
  left join public.profiles pr on pr.id = i.invited_by
  where i.token = p_token and char_length(p_token) between 32 and 128;
$$;

revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
