#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies EVERY migration to a fresh database (via account-suspension.sh's
# harness) and runs the 20260928120000 security hardening checks.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(bash "$ROOT/scripts/tests/account-suspension.sh" "$ROOT/supabase/tests/security_hardening_checks.sql" 2>&1) || { echo "$OUT" | grep -E 'ERROR|FAILED|migration failed'; exit 1; }
echo "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p' -e '/Applied/p' -e '/migration failed/p' -e '/all assertions passed/p'
printf 'PASS=%s FAIL=%s\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')" "$(echo "$OUT" | grep -c 'FAILED')"
