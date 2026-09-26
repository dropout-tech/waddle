-- Existing members before the serial migration. Insert order deliberately
-- differs from sign-up time so the backfill must sort by auth.users.created_at.
\set ON_ERROR_STOP on
insert into auth.users(id,email,created_at,raw_user_meta_data) values
 ('00000000-0000-4000-8000-00000000000c','real.person@example.invalid','2026-03-01','{"full_name":"王小明 Real Name"}'),
 ('00000000-0000-4000-8000-00000000000a','lazy@dreamcube.tw','2026-01-01','{}'),
 ('00000000-0000-4000-8000-00000000000d','fresh@example.invalid','2026-04-01','{}'),
 ('00000000-0000-4000-8000-00000000000b','suspended@example.invalid','2026-02-01','{}');
-- A nickname set while the feature existed must never be published again.
update public.profiles set leaderboard_nickname='舊暱稱' where id='00000000-0000-4000-8000-00000000000c';
insert into public.points_accounts(user_id,total_points) values
 ('00000000-0000-4000-8000-00000000000a',5),
 ('00000000-0000-4000-8000-00000000000b',4),
 ('00000000-0000-4000-8000-00000000000c',3);
