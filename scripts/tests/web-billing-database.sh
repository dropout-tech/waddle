#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Website billing P1 (20261002230100_web_billing_foundation):
#   1. applies every migration BEFORE it to a fresh database, with
#      Supabase-style default grants on (new public tables/functions are
#      granted to anon/authenticated), so the migration's revokes are real;
#   2. web-billing-equivalence.sql: fixture members, then in ONE transaction
#      snapshot every existing reader → apply the migration → snapshot again
#      and require identical results (web tables empty);
#   3. applies any later migrations;
#   4. web-billing-database.sql: up → down → up round trip, unified paid_until,
#      state machine / money guards, gift deferral, back office, RLS.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WEB_MIGRATION=20261002230100_web_billing_foundation.sql
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-web-billing.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p 55493" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p 55493 -U postgres -d postgres -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -f "$1" >/dev/null 2>&1 || { echo "migration failed: $1"; "${PSQL[@]}" -f "$1" 2>&1 | grep ERROR; exit 1; }; }
report() { { grep -v 'skipping$' || true; } | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; }

"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
"${PSQL[@]}" -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;"
before=0; after=0; found=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  b=$(basename "$f")
  if [ "$b" = "$WEB_MIGRATION" ]; then found=1; continue; fi
  if [ "$found" = 0 ]; then apply "$f"; before=$((before+1)); fi
done
[ "$found" = 1 ] || { echo "web billing migration not found"; exit 1; }
echo "Applied $before migrations before $WEB_MIGRATION."

OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/web-billing-equivalence.sql" 2>&1) || { echo "$OUT" | report; echo "FAILED: equivalence suite aborted"; exit 1; }
echo "$OUT" | report
EQ_PASS=$(echo "$OUT" | grep -c 'NOTICE:  PASS' || true)

found=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  b=$(basename "$f")
  if [ "$found" = 1 ]; then apply "$f"; after=$((after+1)); fi
  if [ "$b" = "$WEB_MIGRATION" ]; then found=1; fi
done
echo "Applied $after migrations after $WEB_MIGRATION."

OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/web-billing-database.sql" 2>&1) || { echo "$OUT" | report; echo "FAILED: behaviour suite aborted"; exit 1; }
echo "$OUT" | report
BEH_PASS=$(echo "$OUT" | grep -c 'NOTICE:  PASS' || true)
printf 'Web billing database suite passed (equivalence PASS=%s, behaviour PASS=%s, FAIL=0).\n' "$EQ_PASS" "$BEH_PASS"
