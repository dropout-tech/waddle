#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Migration 20261002110000 (自動 settings): every earlier migration, then
# seed rows → up → re-run (idempotent) → down (rollback) → up, printing the
# rows and asserting after each step.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MIG="$ROOT/supabase/migrations/20261002110000_settings_auto_defaults.sql"
DOWN="$ROOT/supabase/rollback/20261002110000_settings_auto_defaults_down.sql"
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-auto.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p 55481" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p 55481 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  [ "$f" = "$MIG" ] && continue
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; "${PSQL[@]}" -f "$f" 2>&1 | grep ERROR; exit 1; }
done
SHOW="select left(user_id::text,4) as u, default_view as view, week_start_day as wk,
  buffer_time->>'defaultDuration' as buffer_min, lunch_break->>'enabled' as lunch_on, lunch_break->>'startTime' as lunch_at
  from public.user_settings order by user_id"
MINS="select left(user_id::text,4) as u, default_task_minutes from public.user_settings order by user_id"
ok() { "${PSQL[@]}" -tA -c "select case when ($1) then 'PASS: $2' else 'FAIL: $2' end" | tee -a "$T/results"; }

# Old users as they exist today: the trigger creates rows with the DB defaults.
"${PSQL[@]}" -c "insert into auth.users(id,email) values
  ('a0000000-0000-4000-8000-000000000001','a@example.com'),
  ('b0000000-0000-4000-8000-000000000002','b@example.com'),
  ('c0000000-0000-4000-8000-000000000003','c@example.com'),
  ('d0000000-0000-4000-8000-000000000004','d@example.com')"
# b chose 日 + 週日; c chose 月 and typed 60 in the old 預設任務時長 field; d has a custom 午休.
"${PSQL[@]}" -c "update public.user_settings set default_view='day', week_start_day=0 where user_id='b0000000-0000-4000-8000-000000000002';
  update public.user_settings set default_view='month', buffer_time=jsonb_set(buffer_time,'{defaultDuration}','60') where user_id='c0000000-0000-4000-8000-000000000003';
  update public.user_settings set lunch_break='{\"enabled\":false,\"startTime\":\"11:30\",\"endTime\":\"12:30\",\"color\":\"#fbbf24\"}' where user_id='d0000000-0000-4000-8000-000000000004'"
echo '== before (pre-migration schema) =='; "${PSQL[@]}" -c "$SHOW"
"${PSQL[@]}" -c "create table snap as select user_id, buffer_time, lunch_break, calendar_start_hour, notifications from public.user_settings"

echo '== up =='; "${PSQL[@]}" -f "$MIG"; "${PSQL[@]}" -c "$SHOW"; "${PSQL[@]}" -c "$MINS"
ok "(select default_view is null and week_start_day is null from public.user_settings where user_id::text like 'a%')" 'untouched row -> auto (null, null)'
ok "(select default_view='day' and week_start_day=0 from public.user_settings where user_id::text like 'b%')" 'explicit day + Sunday kept'
ok "(select default_view='month' and default_task_minutes=60 from public.user_settings where user_id::text like 'c%')" 'explicit month kept, old 60-min task length copied'
ok "(select count(*)=3 from public.user_settings where default_task_minutes is null)" 'other rows: task length auto'
ok "not exists (select 1 from public.user_settings s join snap using (user_id) where s.buffer_time is distinct from snap.buffer_time or s.lunch_break is distinct from snap.lunch_break or s.calendar_start_hour is distinct from snap.calendar_start_hour or s.notifications is distinct from snap.notifications)" 'buffer_time / lunch_break / other columns unchanged'
"${PSQL[@]}" -c "insert into auth.users(id,email) values ('e0000000-0000-4000-8000-000000000005','e@example.com')"
ok "(select default_view is null and week_start_day is null and default_task_minutes is null from public.user_settings where user_id::text like 'e%')" 'new account starts on auto'
ok "(select count(*)=0 from public.user_settings where default_task_minutes is not null and default_task_minutes not between 15 and 240)" 'minutes within range'

# A user now picks week + Monday explicitly; re-running the migration must not erase it.
"${PSQL[@]}" -c "update public.user_settings set default_view='week', week_start_day=1, default_task_minutes=45 where user_id::text like 'a%'"
echo '== up again (idempotency) =='; "${PSQL[@]}" -f "$MIG"
ok "(select default_view='week' and week_start_day=1 and default_task_minutes=45 from public.user_settings where user_id::text like 'a%')" 're-run keeps week/Monday/45 picked after the migration'
ok "(select count(*) from pg_constraint where conname='user_settings_default_task_minutes_range')=1" 'range check present once'

echo '== down (rollback) =='; "${PSQL[@]}" -f "$DOWN"; "${PSQL[@]}" -c "$SHOW"
ok "(select is_nullable='NO' from information_schema.columns where table_name='user_settings' and column_name='default_view')" 'down: default_view NOT NULL again'
ok "(select count(*)=0 from public.user_settings where default_view is null or week_start_day is null)" 'down: auto rows back to week / 1'
ok "not exists (select 1 from information_schema.columns where table_name='user_settings' and column_name='default_task_minutes')" 'down: default_task_minutes dropped'
"${PSQL[@]}" -f "$DOWN" >/dev/null && ok "true" 'down is idempotent'

echo '== up after down =='; "${PSQL[@]}" -f "$MIG"; "${PSQL[@]}" -c "$SHOW"; "${PSQL[@]}" -c "$MINS"
ok "(select default_view is null and week_start_day is null from public.user_settings where user_id::text like 'e%')" 'up again: untouched rows auto'
ok "(select default_task_minutes=60 from public.user_settings where user_id::text like 'c%')" 'up again: 60 copied from buffer_time again'
ok "not exists (select 1 from public.user_settings s join snap using (user_id) where s.buffer_time is distinct from snap.buffer_time or s.lunch_break is distinct from snap.lunch_break)" 'buffer_time / lunch_break still unchanged after up/down/up'
if grep -q '^FAIL' "$T/results"; then echo 'settings-auto-defaults: FAILED'; exit 1; fi
echo "settings-auto-defaults: $(grep -c '^PASS' "$T/results") checks passed"
