#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies every migration, then checks E1 (App Review sandbox purchases) in
# scripts/tests/billing-review-sandbox.sql.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-review-sandbox.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p 55482" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p 55482 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; "${PSQL[@]}" -f "$f" 2>&1 | grep ERROR; exit 1; }
done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations."
OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/billing-review-sandbox.sql" 2>&1) || { echo "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; echo "FAILED: suite aborted"; exit 1; }
echo "$OUT" | sed -n -e 's/.*NOTICE:  //p'
printf 'Review sandbox suite passed (PASS=%s).\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')"
