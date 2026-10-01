#!/usr/bin/env bash
# Google Calendar (read-only) DB checks on a disposable local Postgres ONLY —
# never reads project connection strings. Reuses account-suspension.sh's
# harness: applies EVERY migration in order to a fresh cluster (so this also
# proves the new migration applies on top of the real chain), then runs
# google-calendar-db-verify.sql.
#   bash scripts/test/google-calendar-db-verify.sh   (needs local initdb/pg_ctl; outside the sandbox)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(bash "$ROOT/scripts/tests/account-suspension.sh" "$ROOT/scripts/test/google-calendar-db-verify.sql" 2>&1)
printf '%s\n' "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p' -e '/Applied/p' -e '/migration failed/p'
PASSES=$(printf '%s\n' "$OUT" | grep -c 'NOTICE:  PASS' || true)
FAILS=$(printf '%s\n' "$OUT" | grep -c -e 'NOTICE:  FAIL' -e 'ERROR' -e 'migration failed' || true)
echo "PASS $PASSES / FAIL $FAILS (Google Calendar DB, local disposable cluster)"
[ "$FAILS" -eq 0 ] && [ "$PASSES" -gt 0 ]
