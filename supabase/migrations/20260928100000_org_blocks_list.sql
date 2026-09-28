-- Read-only list of members removed from an organization (organization_blocks),
-- for the owner/admin "已移出的成員" panel. organization_blocks itself stays
-- RPC-only (no client privileges); this function exposes a fixed column
-- whitelist to owners/admins of THAT organization only. Lifting a block is the
-- existing unblock_org_member (20260927120000).
-- Rollback: drop function public.get_org_blocks(uuid).

create or replace function public.get_org_blocks(p_org uuid)
returns table (user_id uuid, display_name text, avatar_url text, blocked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not huddle_ops.access_allowed() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(huddle_ops.org_role(p_org, v_uid), '') not in ('owner','admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select b.user_id, p.display_name, p.avatar_url, b.blocked_at
    from public.organization_blocks b
    left join public.profiles p on p.id = b.user_id
   where b.org_id = p_org
   order by b.blocked_at desc
   limit 200;
end;
$$;

revoke all on function public.get_org_blocks(uuid) from public, anon;
grant execute on function public.get_org_blocks(uuid) to authenticated;
