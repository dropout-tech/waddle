#!/usr/bin/env bash
set -euo pipefail
# Disposable local cluster only; never reads project connection strings.
BILLING_TEST_DIR=$(mktemp -d /tmp/huddle-billing-pg.XXXXXX)
trap 'pg_ctl -D "$BILLING_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$BILLING_TEST_DIR"' EXIT
initdb -D "$BILLING_TEST_DIR/data" -A trust --no-locale >/dev/null
pg_ctl -D "$BILLING_TEST_DIR/data" -l "$BILLING_TEST_DIR/server.log" -o "-k $BILLING_TEST_DIR -h ''" start >/dev/null
psql -h "$BILLING_TEST_DIR" -d postgres -f "$(dirname "$0")/deletion-database.sql" >/dev/null
printf 'Deletion guard database checks passed.\n'
