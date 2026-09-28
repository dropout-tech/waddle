#!/usr/bin/env bash
# Disposable local cluster only; never reads project connection strings.
# Applies EVERY migration to a fresh database (via account-suspension.sh's
# harness) and runs the notebook_image_references() checks.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
bash "$ROOT/scripts/tests/account-suspension.sh" "$ROOT/supabase/tests/image_references_checks.sql" 2>&1 \
  | sed -n -e 's/.*NOTICE:  //p' -e '/ERROR/p' -e '/Applied/p' -e '/migration failed/p'
echo 'Image references suite finished (any FAILED line above = failure).'
