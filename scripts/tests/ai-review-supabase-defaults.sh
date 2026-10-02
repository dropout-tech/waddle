#!/usr/bin/env bash
# Disposable local cluster only. Same checks, but with Supabase-like default
# privileges (every API role gets ALL on new public tables / EXECUTE on new
# public functions), to prove the drafts' own REVOKEs are what closes access.
# Migrations from supabase/migrations/ first, then supabase/migrations-draft/.
PORT=55474
PRE_MIGRATIONS_SQL="alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;"
PRE_DRAFT_SQL="$(cd "$(dirname "$0")/../.." && pwd)/supabase/tests/ai_review_task_source_seed.sql"
source "$(dirname "$0")/ai-review-harness.sh"
"${PSQL[@]}" -f "$ROOT/supabase/tests/ai_review_checks.sql" > "$D/out" 2>&1 || true
"${PSQL[@]}" -f "$ROOT/supabase/tests/ai_review_task_source_checks.sql" >> "$D/out" 2>&1 || true
PASS=$(grep -c 'PASS:' "$D/out" || true)
FAILED=$(grep -cE 'FAILED|ERROR' "$D/out" || true)
echo "PASS=$PASS FAILED=$FAILED"
grep -n "FAILED\|ERROR" "$D/out" | head -5 || true
[ "$FAILED" = 0 ]
