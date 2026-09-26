#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies EVERY migration in filename order to a fresh database, then asserts
# the leaderboard publishes only opted-in nicknames or anonymous codes.
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NICK_TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/huddle-nick.XXXXXX")
trap 'pg_ctl -D "$NICK_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$NICK_TEST_DIR"' EXIT
initdb -D "$NICK_TEST_DIR/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$NICK_TEST_DIR/data" -l "$NICK_TEST_DIR/server.log" -o "-k $NICK_TEST_DIR -h '' -p 55473" start >/dev/null || { cat "$NICK_TEST_DIR/server.log"; exit 1; }
PSQL=(psql -X -q -h "$NICK_TEST_DIR" -p 55473 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1 || { echo "migration failed: $f"; "${PSQL[@]}" -f "$f" 2>&1 | grep ERROR; exit 1; }
done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations to a fresh database."
OUT=$("${PSQL[@]}" -f "$ROOT/scripts/tests/leaderboard-nickname.sql" 2>&1) || { echo "$OUT" | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p'; exit 1; }
echo "$OUT" | sed -n -e 's/.*NOTICE:  //p'
printf 'Leaderboard nickname suite passed (%s checks).\n' "$(echo "$OUT" | grep -c 'NOTICE:  PASS')"
