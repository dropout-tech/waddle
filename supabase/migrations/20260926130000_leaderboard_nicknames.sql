-- Opt-in leaderboard nickname. profiles.display_name can be a real name from
-- Google sign-in, so the leaderboard never reads it: a member is shown by the
-- nickname they chose here, or by a short anonymous code when they chose none.
begin;

alter table public.profiles add column if not exists leaderboard_nickname text;

-- Stored already trimmed: 1-16 characters, no leading/trailing (full-width)
-- whitespace, no control characters. NULL means "stay anonymous".
alter table public.profiles drop constraint if exists profiles_leaderboard_nickname_check;
alter table public.profiles add constraint profiles_leaderboard_nickname_check check (
  leaderboard_nickname is null or (
    char_length(leaderboard_nickname) between 1 and 16
    and leaderboard_nickname !~ '^[[:space:]　]'
    and leaderboard_nickname !~ '[[:space:]　]$'
    and leaderboard_nickname !~ '[[:cntrl:]]'
  )
);
comment on column public.profiles.leaderboard_nickname is
  'Member-chosen public leaderboard name (opt-in, default NULL). The only profile field the leaderboard may publish.';

-- Writes go through RLS (profiles_update_own + operations_account_active), so a
-- member can only ever change their own row and suspended accounts cannot.
create or replace function public.set_leaderboard_nickname(p_nickname text)
returns text
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text := regexp_replace(coalesce(p_nickname, ''), '^[[:space:]　]+|[[:space:]　]+$', '', 'g');
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not huddle_ops.access_allowed() then raise exception '帳號已停用，請聯絡客服' using errcode = '42501'; end if;
  -- NULL clears the nickname; a non-NULL value must contain something visible.
  if p_nickname is not null and v_name = '' then
    raise exception 'NICKNAME_BLANK' using errcode = '22023';
  end if;
  if char_length(v_name) > 16 then raise exception 'NICKNAME_TOO_LONG' using errcode = '22023'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'NICKNAME_INVALID' using errcode = '22023'; end if;
  update public.profiles set leaderboard_nickname = nullif(v_name, '') where id = v_user;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return nullif(v_name, '');
end;
$$;
revoke all on function public.set_leaderboard_nickname(text) from public, anon, service_role;
grant execute on function public.set_leaderboard_nickname(text) to authenticated;

-- The OUT columns change, which CREATE OR REPLACE cannot do, so the function is
-- dropped and recreated inside this transaction. penguin_alias is kept (same
-- 12-char md5 as before) so already-installed clients keep rendering.
drop function if exists public.get_check_in_leaderboard();
create function public.get_check_in_leaderboard()
returns table(
  rank_position bigint, penguin_alias text, total_points bigint,
  is_current_user boolean, in_top_50 boolean,
  leaderboard_name text, has_nickname boolean
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
  -- Only the opted-in nickname leaves this function; never display_name/email/id.
  select v.standing, substr(md5(v.user_id::text), 1, 12), v.total_points,
    v.user_id = viewer, v.listed,
    coalesce(p.leaderboard_nickname, '小企鵝 #' || substr(md5(v.user_id::text), 1, 4)),
    p.leaderboard_nickname is not null
  from visible v
  left join public.profiles p on p.id = v.user_id
  order by v.standing nulls last, v.user_id;
end;
$$;
revoke all on function public.get_check_in_leaderboard() from public, anon, service_role;
grant execute on function public.get_check_in_leaderboard() to authenticated;

commit;
