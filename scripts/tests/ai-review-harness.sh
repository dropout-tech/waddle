# Sourced by scripts/tests/ai-review-*.sh. Disposable local cluster only;
# never reads project connection strings.
# Order: platform stubs → every supabase/migrations/*.sql (what production
# has) → optional pre-draft seed → every supabase/migrations-draft/*.sql
# (the unapplied AI review drafts, in filename order).
# Caller sets PORT (and optionally PRE_MIGRATIONS_SQL, PRE_DRAFT_SQL).
set -euo pipefail
export LC_ALL=C
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
D=$(mktemp -d "${TMPDIR:-/tmp}/huddle-ai.XXXXXX")
trap 'pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
initdb -D "$D/data" -A trust --no-locale --encoding=UTF8 -U postgres >/dev/null
pg_ctl -D "$D/data" -l "$D/server.log" -o "-k $D -h '' -p $PORT" start >/dev/null || { cat "$D/server.log"; exit 1; }
PSQL=(psql -X -q -h "$D" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -f "$1" >/dev/null 2>&1 || { echo "migration failed: $1"; "${PSQL[@]}" -f "$1" 2>&1 | grep ERROR | head -3; exit 1; }; }
"${PSQL[@]}" -f "$ROOT/scripts/tests/account-suspension-bootstrap.sql"
if [ -n "${PRE_MIGRATIONS_SQL:-}" ]; then "${PSQL[@]}" -c "$PRE_MIGRATIONS_SQL"; fi
for f in "$ROOT"/supabase/migrations/*.sql; do apply "$f"; done
if [ -n "${PRE_DRAFT_SQL:-}" ]; then "${PSQL[@]}" -f "$PRE_DRAFT_SQL" >/dev/null; fi
for f in "$ROOT"/supabase/migrations-draft/*.sql; do apply "$f"; done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations + $(ls "$ROOT"/supabase/migrations-draft/*.sql | wc -l | tr -d ' ') drafts."
