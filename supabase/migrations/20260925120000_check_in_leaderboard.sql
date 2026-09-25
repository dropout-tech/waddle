-- Publish only anonymous aliases and scores; underlying account RLS stays private.
create or replace function public.get_check_in_leaderboard()
returns table(rank_position bigint, penguin_alias text, total_points bigint, is_current_user boolean, in_top_50 boolean)
language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return query
  with ranked as (
    select a.user_id, a.total_points,
      rank() over (order by a.total_points desc) as standing,
      row_number() over (order by a.total_points desc, a.user_id) as row_index
    from public.points_accounts a where a.total_points > 0
  ), visible as (
    select r.standing, r.user_id, r.total_points, r.row_index <= 50 as listed
    from ranked r where r.row_index <= 50 or r.user_id = viewer
    union all
    select null::bigint, viewer, 0::bigint, false
    where not exists (select 1 from ranked r where r.user_id = viewer)
  )
  select v.standing, substr(md5(v.user_id::text), 1, 12), v.total_points,
    v.user_id = viewer, v.listed
  from visible v order by v.standing nulls last, v.user_id;
end;
$$;
revoke all on function public.get_check_in_leaderboard() from public, anon, service_role;
grant execute on function public.get_check_in_leaderboard() to authenticated;
