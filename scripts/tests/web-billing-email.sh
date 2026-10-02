#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Website billing module C (20261002230200_web_billing_email):
#   1. applies every migration to a fresh database (Supabase-style default
#      grants on, so the revokes in the migrations are real);
#   2. web-billing-email.sql: reminder enqueueing, claim / finish, privileges,
#      down -> up round trip;
#   3. two real concurrent transactions claim the same queue (SKIP LOCKED);
#   4. the queued payloads are rendered by email.mjs (DB shape == template shape).
# PG_BIN=/opt/homebrew/opt/postgresql@16/bin selects a PostgreSQL major version.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${PG_BIN:+$PG_BIN/}
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-web-email.XXXXXX")
trap '"${BIN}pg_ctl" -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
"${BIN}initdb" -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
PORT=55494
"${BIN}pg_ctl" -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p $PORT" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=("${BIN}psql" -X -q -h "$T" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
report() { { grep -v 'skipping$' || true; } | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; }
echo "PostgreSQL $("${BIN}postgres" --version | awk '{print $3}')"

"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
"${PSQL[@]}" -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;"
n=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; "${PSQL[@]}" -f "$f" 2>&1 | grep ERROR; exit 1; }
  n=$((n+1))
done
echo "Applied $n migrations."

OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/web-billing-email.sql" 2>&1) || { echo "$OUT" | report; echo "FAILED: email suite aborted"; exit 1; }
echo "$OUT" | report
SQL_PASS=$(echo "$OUT" | grep -c 'NOTICE:  PASS' || true)

# ── concurrent claim: two sessions, A holds its transaction open ──────────
"${PSQL[@]}" -c "truncate public.web_email_outbox;
  insert into public.web_email_outbox(kind, dedupe_key, to_email, payload, created_at)
  select 'receipt', 'c' || i, 'c' || i || '@example.invalid', '{}', now() - (20 - i) * interval '1 minute' from generate_series(1, 8) i;"
{
  echo "begin; set local role service_role;"
  echo "\\o $T/a.txt"
  echo "select dedupe_key from huddle_ops.web_claim_outbox(4) order by 1;"
  echo "\\o"
  echo "select pg_sleep(3);"
  echo "commit;"
} > "$T/a.sql"
{
  echo "begin; set local role service_role;"
  echo "\\o $T/b.txt"
  echo "select dedupe_key from huddle_ops.web_claim_outbox(4) order by 1;"
  echo "\\o"
  echo "commit;"
} > "$T/b.sql"
"${PSQL[@]}" -At -f "$T/a.sql" >/dev/null & APID=$!
sleep 1
START=$(date +%s)
"${PSQL[@]}" -At -f "$T/b.sql" >/dev/null
ELAPSED=$(( $(date +%s) - START ))
wait "$APID"
A=$(grep -c . "$T/a.txt" || true); B=$(grep -c . "$T/b.txt" || true)
OVERLAP=$(sort "$T/a.txt" "$T/b.txt" | grep . | uniq -d | wc -l | tr -d ' ')
[ "$A" = 4 ] && [ "$B" = 4 ] && [ "$OVERLAP" = 0 ] || { echo "FAILED: concurrent claim (A=$A B=$B overlap=$OVERLAP)"; exit 1; }
[ "$ELAPSED" -le 2 ] || { echo "FAILED: second claim waited ${ELAPSED}s for the first transaction (should skip locked rows)"; exit 1; }
echo "PASS: two concurrent transactions each claimed 4 different rows (no overlap), second did not wait for the first (${ELAPSED}s)"
LEFT=$("${PSQL[@]}" -At -c "set role service_role; select count(*) from huddle_ops.web_claim_outbox(10);" | tail -1)
[ "$LEFT" = 0 ] || { echo "FAILED: rows claimed in the committed transactions were claimed again ($LEFT)"; exit 1; }
echo "PASS: after both transactions committed, the 8 claimed rows are not handed out again"

# ── DB payloads render through email.mjs ──────────────────────────────────
"${PSQL[@]}" -c "truncate public.web_email_outbox; select huddle_ops.web_enqueue_reminders('2026-10-10 12:00:00+00');" >/dev/null
"${PSQL[@]}" -At -c "select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'payload', payload, 'to', to_email) order by dedupe_key), '[]') from public.web_email_outbox" > "$T/rows.json"
if command -v node >/dev/null; then
  ROWS="$T/rows.json" MOD="$ROOT/supabase/functions/_shared/web-billing/email.mjs" node --input-type=module -e "
    import { readFileSync } from 'node:fs'
    const { renderEmail } = await import(process.env.MOD)
    const rows = JSON.parse(readFileSync(process.env.ROWS, 'utf8'))
    if (rows.length < 3) { console.log('FAILED: expected queued reminder rows, got ' + rows.length); process.exit(1) }
    for (const r of rows) {
      const m = renderEmail(r.kind, r.payload, { siteUrl: 'https://huddle.lazy72.com' })
      if (!m || !/NT[$](150|990)/.test(m.subject) || !m.html.includes('取消')) { console.log('FAILED: ' + r.kind + ' payload from the database does not render'); process.exit(1) }
    }
    console.log('PASS: ' + rows.length + ' reminder payloads produced by the SQL functions render through email.mjs')
  "
  RENDER_PASS=1
else
  echo "SKIPPED: node not found, payload render check not run"; RENDER_PASS=0
fi
printf 'Web billing email database suite passed (SQL PASS=%s, concurrency PASS=2, render PASS=%s, FAIL=0).\n' "$SQL_PASS" "$RENDER_PASS"
