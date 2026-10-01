#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies EVERY migration to a fresh database (via account-suspension.sh's
# harness) and runs the 20261001120000 AI consent / AI review ledger checks.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(bash "$ROOT/scripts/tests/account-suspension.sh" "$ROOT/supabase/tests/ai_review_checks.sql" 2>&1) || { echo "$OUT" | grep -E 'ERROR|FAILED|migration failed'; exit 1; }
echo "$OUT" | sed -n -e '/ERROR/p' -e '/Applied/p' -e '/migration failed/p'
printf 'PASS=%s FAIL=%s\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')" "$(echo "$OUT" | grep -c 'FAILED')"
