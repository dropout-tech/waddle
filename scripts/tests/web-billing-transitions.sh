#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Website billing P2 (20261003020300_web_billing_transitions):
#   1. applies EVERY migration to a fresh database with Supabase-style default
#      grants on (so the migration's revokes are real);
#   2. web-billing-transitions.sql: the whole state machine with explicit
#      clocks, money guards, refunds, dates, privileges, down → up;
#   3. a real two-session race: session A claims and holds its transaction
#      open, session B claims the same due subscription meanwhile → B must get
#      nothing (SKIP LOCKED), and afterwards exactly one pending attempt exists.
# Run with another PostgreSQL by putting its bin/ first in PATH, e.g.
#   PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH bash scripts/tests/web-billing-transitions.sh
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-web-transitions.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p 55494" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p 55494 -U postgres -d postgres -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -f "$1" >/dev/null 2>&1 || { echo "migration failed: $1"; "${PSQL[@]}" -f "$1" 2>&1 | grep ERROR; exit 1; }; }
report() { { grep -v 'skipping$' || true; } | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; }
echo "PostgreSQL: $(postgres --version)"

"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
"${PSQL[@]}" -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;"
n=0
for f in "$ROOT"/supabase/migrations/*.sql; do apply "$f"; n=$((n+1)); done
echo "Applied $n migrations."

OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/web-billing-transitions.sql" 2>&1) || { echo "$OUT" | report; echo "FAILED: transitions suite aborted"; exit 1; }
echo "$OUT" | report
PASS=$(echo "$OUT" | grep -c 'NOTICE:  PASS' || true)

# ── Two-session claim race (design §4.3 layer 2) ─────────────────────────────
PNOW=$("${PSQL[@]}" -At -c "select (trial_end + interval '1 minute')::text from public.web_subscriptions
  where user_id = public.t_u(24) and status = 'trialing'")
cat > "$T/a.sql" <<'SQL'
begin;
select 'A=' || jsonb_array_length(huddle_ops.web_claim_due('hs', 10, :'pnow'));
select pg_sleep(4);
commit;
SQL
cat > "$T/b.sql" <<'SQL'
select 'B=' || jsonb_array_length(huddle_ops.web_claim_due('hs', 10, :'pnow'));
SQL
"${PSQL[@]}" -At -v pnow="$PNOW" -f "$T/a.sql" > "$T/a.out" 2>&1 &
APID=$!
sleep 1.5
START=$(date +%s)
B=$("${PSQL[@]}" -At -v pnow="$PNOW" -f "$T/b.sql")
ELAPSED=$(( $(date +%s) - START ))
wait "$APID"
A=$(grep '^A=' "$T/a.out" || true)
C=$("${PSQL[@]}" -At -v pnow="$PNOW" -f "$T/b.sql")
PENDING=$("${PSQL[@]}" -At -c "select count(*) from public.web_payment_attempts a join public.web_subscriptions s on s.id = a.subscription_id
  where s.user_id = public.t_u(24) and a.kind = 'recurring' and a.status = 'pending'")
if [ "$A" = "A=1" ] && [ "$B" = "B=0" ] && [ "$ELAPSED" -le 2 ] && [ "$C" = "B=0" ] && [ "$PENDING" = "1" ]; then
  echo "PASS: two sessions claim the same due subscription at once: A gets it, B skips it without waiting (SKIP LOCKED), a later claim gets nothing, exactly 1 pending"
  PASS=$((PASS+1))
else
  echo "FAILED: claim race (A='$A' B='$B' waited=${ELAPSED}s later='$C' pending=$PENDING)"; cat "$T/a.out"; exit 1
fi
printf 'Web billing transitions suite passed (PASS=%s, FAIL=0).\n' "$PASS"
