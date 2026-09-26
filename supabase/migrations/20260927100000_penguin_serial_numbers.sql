-- Leaderboard shows a permanent serial number ("小企鵝 N") instead of any
-- member-chosen text. Custom nicknames are switched off (no moderation needed);
-- profiles.leaderboard_nickname stays in place but is no longer read or written.
begin;

-- 1. Permanent, never-reused serial per profile.
create sequence if not exists public.profiles_penguin_number_seq as bigint;
alter table public.profiles add column if not exists penguin_number bigint;

-- Backfill existing members 1..N in sign-up order (auth.users.created_at first,
-- profile creation time as fallback, id as a stable tie-breaker).
with ordered as (
  select p.id,
    row_number() over (order by coalesce(u.created_at, p.created_at), p.created_at, p.id) as n
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.penguin_number is null
)
update public.profiles p set penguin_number = o.n
from ordered o where o.id = p.id;

-- Next sign-up continues after the highest number handed out.
select setval('public.profiles_penguin_number_seq',
  greatest(coalesce((select max(penguin_number) from public.profiles), 0), 1),
  coalesce((select max(penguin_number) from public.profiles), 0) > 0);

alter sequence public.profiles_penguin_number_seq owned by public.profiles.penguin_number;
-- No column default: the trigger below is the single assigner, so no number is skipped.
alter table public.profiles alter column penguin_number set not null;
alter table public.profiles add constraint profiles_penguin_number_key unique (penguin_number);
revoke all on sequence public.profiles_penguin_number_seq from public, anon, authenticated;

-- The server assigns the number on insert and it can never change afterwards
-- (members may still update their own profile row through RLS).
create or replace function public.assign_penguin_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.penguin_number := nextval('public.profiles_penguin_number_seq');
  elsif new.penguin_number is distinct from old.penguin_number then
    raise exception 'PENGUIN_NUMBER_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.assign_penguin_number() from public, anon, authenticated, service_role;
drop trigger if exists assign_penguin_number on public.profiles;
create trigger assign_penguin_number before insert or update of penguin_number on public.profiles
  for each row execute function public.assign_penguin_number();
comment on column public.profiles.penguin_number is
  'Permanent public leaderboard serial ("小企鵝 N"). Assigned by trigger, never reused or changed.';
comment on column public.profiles.leaderboard_nickname is
  'Deprecated 2026-09-27: custom nicknames switched off; no longer read or writable via RPC.';

-- 2. Nicknames can no longer be set.
revoke execute on function public.set_leaderboard_nickname(text) from public, anon, authenticated, service_role;

-- 3. Leaderboard returns the serial number. Legacy columns are kept so the app
-- version already deployed keeps rendering: leaderboard_name becomes
-- '小企鵝 N' and has_nickname is true so that version prints it verbatim.
drop function if exists public.get_check_in_leaderboard();
create function public.get_check_in_leaderboard()
returns table(
  rank_position bigint, penguin_alias text, total_points bigint,
  is_current_user boolean, in_top_50 boolean,
  leaderboard_name text, has_nickname boolean, penguin_number bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode = '42501'; end if;
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
  -- Only the serial leaves this function; never display_name/email/id/nickname.
  select v.standing, substr(md5(v.user_id::text), 1, 12), v.total_points,
    v.user_id = viewer, v.listed,
    case when p.penguin_number is null then '小企鵝 #' || substr(md5(v.user_id::text), 1, 4)
         else '小企鵝 ' || p.penguin_number::text end,
    p.penguin_number is not null,
    p.penguin_number
  from visible v
  left join public.profiles p on p.id = v.user_id
  order by v.standing nulls last, v.user_id;
end;
$$;
revoke all on function public.get_check_in_leaderboard() from public, anon, service_role;
grant execute on function public.get_check_in_leaderboard() to authenticated;

commit;
