#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies migrations up to (not including) the serial-number migration, seeds
# existing members, applies the rest, then asserts the leaderboard publishes
# only permanent serial numbers ("小企鵝 N") and nicknames can no longer be set.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SERIAL_MIGRATION=20260927100000_penguin_serial_numbers.sql
T=$(mktemp -d "${TMPDIR:-/tmp}/huddle-serial.XXXXXX")
trap 'pg_ctl -D "$T/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
initdb -D "$T/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$T/data" -l "$T/server.log" -o "-k $T -h '' -p 55474" start >/dev/null || { cat "$T/server.log"; exit 1; }
PSQL=(psql -X -q -h "$T" -p 55474 -U postgres -d postgres -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -f "$1" >/dev/null 2>&1 || { echo "migration failed: $1"; "${PSQL[@]}" -f "$1" 2>&1 | grep ERROR; exit 1; }; }
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
seeded=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  if [ "$seeded" = 0 ] && [ "$(basename "$f")" \> "$SERIAL_MIGRATION" -o "$(basename "$f")" = "$SERIAL_MIGRATION" ]; then
    "${PSQL[@]}" -f "$ROOT/scripts/tests/leaderboard-serial-seed.sql"; seeded=1
  fi
  apply "$f"
done
[ "$seeded" = 1 ] || { echo "serial migration not found"; exit 1; }
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations (members seeded before $SERIAL_MIGRATION)."
OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/leaderboard-serial.sql" 2>&1) || { echo "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; exit 1; }
echo "$OUT" | sed -n -e 's/.*NOTICE:  //p'
printf 'Leaderboard serial suite passed (%s checks).\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')"
