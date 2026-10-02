#!/usr/bin/env bash
# Disposable local cluster only. Same checks, but with Supabase-like default
# privileges (every API role gets ALL on new public tables / EXECUTE on new
# public functions), to prove the migration's own REVOKEs are what closes access.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CHECKS="$ROOT/supabase/tests/ai_review_checks.sql"
D=$(mktemp -d "${TMPDIR:-/tmp}/huddle-aid.XXXXXX")
trap 'pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
initdb -D "$D/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$D/data" -l "$D/server.log" -o "-k $D -h '' -p 55474" start >/dev/null
PSQL=(psql -X -q -h "$D" -p 55474 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
"${PSQL[@]}" -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; exit 1; }; done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations with Supabase-like default privileges."
"${PSQL[@]}" -f "$CHECKS" > "$D/out" 2>&1 || true
echo "PASS=$(grep -c 'PASS:' "$D/out") FAILED=$(grep -c 'FAILED' "$D/out" || true)"
grep -n "FAILED\|ERROR" "$D/out" | head -5 || true
