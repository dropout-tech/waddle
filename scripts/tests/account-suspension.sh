#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies EVERY migration in filename order to a fresh database, then asserts
# that suspended accounts are rejected everywhere and active accounts are not.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SUSP_TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/huddle-susp.XXXXXX")
trap 'pg_ctl -D "$SUSP_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$SUSP_TEST_DIR"' EXIT
initdb -D "$SUSP_TEST_DIR/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$SUSP_TEST_DIR/data" -l "$SUSP_TEST_DIR/server.log" -o "-k $SUSP_TEST_DIR -h '' -p 55472" start >/dev/null || { cat "$SUSP_TEST_DIR/server.log"; exit 1; }
PSQL=(psql -X -q -h "$SUSP_TEST_DIR" -p 55472 -U postgres -d postgres -v ON_ERROR_STOP=1)
report() { sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; }
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; "${PSQL[@]}" -f "$f" 2>&1 | grep ERROR; exit 1; }
done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations to a fresh database."
# Optional first argument: run another SQL file against the migrated database
# instead of the suite (used to inspect generated function definitions).
if [ $# -gt 0 ]; then "${PSQL[@]}" -f "$1"; exit 0; fi
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension.sql" 2>&1 | report

# 'self' runs on every page load: it must not wait for the global settings
# lock that promotional writes (coupon quota, admin settings, ...) still take.
"${PSQL[@]}" -c "begin; select 1 from huddle_ops.settings for update; select pg_sleep(4); commit;" >/dev/null &
LOCK_PID=$!
sleep 1
cat > "$SUSP_TEST_DIR/self.sql" <<'SQL'
\set ON_ERROR_STOP on
set statement_timeout = '1500ms';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000d';
select public.t_ok(public.huddle_operations('self') ? 'member','self returns while another session holds the settings lock');
select public.t_ok(public.huddle_operations('self') ? 'member','repeat self also unblocked');
SQL
"${PSQL[@]}" -f "$SUSP_TEST_DIR/self.sql" 2>&1 | report
cat > "$SUSP_TEST_DIR/redeem.sql" <<'SQL'
set lock_timeout = '500ms';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.huddle_operations('redeem','{"code":"REAL30"}');
SQL
if "${PSQL[@]}" -f "$SUSP_TEST_DIR/redeem.sql" >/dev/null 2>&1; then
  echo 'FAILED: redeem should still serialize on the settings lock'; exit 1
fi
echo 'PASS: coupon redemption still serializes on the settings lock (quota safety kept)'
wait "$LOCK_PID"
"${PSQL[@]}" -c "select public.t_ok((select count(*)=1 from huddle_ops.grants where user_id='00000000-0000-4000-8000-00000000000d' and source='trial'),'first-visit trial granted exactly once');" 2>&1 | report
printf 'Account suspension suite passed.\n'
