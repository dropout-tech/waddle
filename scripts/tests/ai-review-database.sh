#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies EVERY migration, seeds pre-draft fixtures, applies the AI review
# drafts (supabase/migrations-draft/), then runs:
#   1. AI consent / AI review ledger checks (supabase/tests/ai_review_checks.sql)
#   2. tasks.source checks incl. backfill and "clients cannot write it"
#   3. the tasks.source rollback script, then re-applying the migration
PORT=55472
PRE_DRAFT_SQL="$(cd "$(dirname "$0")/../.." && pwd)/supabase/tests/ai_review_task_source_seed.sql"
source "$(dirname "$0")/ai-review-harness.sh"
DRAFT="$ROOT/supabase/migrations-draft"
Q=00000000-0000-4000-8000-0000000000a8
OUT=$(
  "${PSQL[@]}" -f "$ROOT/supabase/tests/ai_review_checks.sql" 2>&1 || true
  "${PSQL[@]}" -f "$ROOT/supabase/tests/ai_review_task_source_checks.sql" 2>&1 || true
  "${PSQL[@]}" -f "$DRAFT/rollback/20261003030000_task_source.down.sql" 2>&1 || echo "FAILED: rollback script errored"
  "${PSQL[@]}" -c "select public.t_ok(not exists(select 1 from pg_attribute where attrelid='public.tasks'::regclass and attname='source' and not attisdropped)
      and not exists(select 1 from pg_trigger where tgname in ('tasks_source_guard','meeting_task_assignments_task_source','meeting_imports_task_source'))
      and not exists(select 1 from pg_proc where proname in ('tasks_source_guard','task_source_from_import','task_source_from_assignment')),
      'rollback removes the column, the three triggers and their functions')" 2>&1 || true
  "${PSQL[@]}" -c "set role authenticated; set request.jwt.claim.sub='$Q';
    insert into public.tasks(user_id,workspace_id,category_id,title) values('$Q','10000000-0000-4000-8000-0000000000a8','20000000-0000-4000-8000-0000000000a8','after rollback');
    select public.t_ok(true,'after rollback a client task insert still works');" 2>&1 || true
  "${PSQL[@]}" -f "$DRAFT/20261003030000_task_source.sql" 2>&1 || echo "FAILED: re-applying the task source migration errored"
  "${PSQL[@]}" -c "select public.t_ok(
      (select source from public.tasks where id='30000000-0000-4000-8000-000000000002')='meeting_import'
      and (select source from public.tasks where id='30000000-0000-4000-8000-000000000003')='self',
      're-applied migration backfills again from the remaining links (rows whose link is gone return as self)')" 2>&1 || true
)
echo "$OUT" | grep -E 'ERROR|FAILED' || true
PASS=$(echo "$OUT" | grep -c 'NOTICE:  PASS' || true)
FAIL=$(echo "$OUT" | grep -cE 'FAILED|ERROR' || true)
printf 'PASS=%s FAIL=%s\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
