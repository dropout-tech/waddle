#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies every migration (with Supabase-like default privileges, so a missing
# revoke on a new function would show up), then runs the AI meeting summary
# attempt-quota checks (scripts/tests/meeting-import-quota.sql).
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT=${PORT:-55432}
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-miq.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p $PORT" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -f "$1" >/dev/null 2>&1 || { echo "migration failed: $1"; "${PSQL[@]}" -f "$1" 2>&1 | grep ERROR; exit 1; }; }
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
# Supabase grants API roles everything new in public by default.
"${PSQL[@]}" -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do apply "$f"; done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations to a fresh database."
OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/meeting-import-quota.sql" 2>&1) || { echo "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; echo "FAILED: suite aborted"; exit 1; }
echo "$OUT" | sed -n -e 's/.*NOTICE:  //p'
printf 'Meeting import quota suite passed (PASS=%s FAIL=%s).\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')" "$(echo "$OUT" | grep -c 'FAILED' || true)"
