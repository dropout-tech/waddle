#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies every migration up to (not including) the pro-limits migration,
# seeds a member who already linked Google Calendar, applies the rest, then
# runs the Pro gating / free usage cap checks (scripts/tests/pro-limits.sql).
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
LIMITS_MIGRATION=20261001200000_pro_limits.sql
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-pro-limits.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p 55481" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p 55481 -U postgres -d postgres -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -f "$1" >/dev/null 2>&1 || { echo "migration failed: $1"; "${PSQL[@]}" -f "$1" 2>&1 | grep ERROR; exit 1; }; }
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
seeded=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [ "$seeded" = 0 ] && [ "$(basename "$f")" \> "$LIMITS_MIGRATION" -o "$(basename "$f")" = "$LIMITS_MIGRATION" ]; then
    "${PSQL[@]}" -c "insert into auth.users(id,email,created_at) values ('00000000-0000-4000-8000-0000000000c0','linked-before@example.invalid','2026-08-01');
      insert into public.google_calendar_connections(user_id,refresh_cipher,scope) values ('00000000-0000-4000-8000-0000000000c0','sealed','calendar.readonly');" >/dev/null
    seeded=1
  fi
  apply "$f"
done
[ "$seeded" = 1 ] || { echo "pro limits migration not found"; exit 1; }
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations (Google Calendar link seeded before $LIMITS_MIGRATION)."
OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/pro-limits.sql" 2>&1) || { echo "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; echo "FAILED: suite aborted"; exit 1; }
echo "$OUT" | sed -n -e 's/.*NOTICE:  //p'
printf 'Pro limits suite passed (PASS=%s FAIL=%s).\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')" "$(echo "$OUT" | grep -c 'FAILED' || true)"
