#!/usr/bin/env bash
set -euo pipefail
OPS_TEST_DIR=$(mktemp -d /tmp/huddle-operations-pg.XXXXXX)
trap 'pg_ctl -D "$OPS_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$OPS_TEST_DIR"' EXIT
initdb -D "$OPS_TEST_DIR/data" -A trust --no-locale --encoding=UTF8 >/dev/null
pg_ctl -D "$OPS_TEST_DIR/data" -l "$OPS_TEST_DIR/server.log" -o "-k $OPS_TEST_DIR -h '' -p 55439" start >/dev/null
psql -h "$OPS_TEST_DIR" -p 55439 -d postgres -f scripts/tests/operations-database.sql
cat > "$OPS_TEST_DIR/claim.sql" <<'SQL'
\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = :'user_id';
select public.huddle_operations('redeem','{"code":"LASTONE"}');
SQL
psql -h "$OPS_TEST_DIR" -p 55439 -d postgres -v user_id=00000000-0000-4000-8000-000000000007 -f "$OPS_TEST_DIR/claim.sql" > "$OPS_TEST_DIR/a.log" 2>&1 & OPS_PID_A=$!
psql -h "$OPS_TEST_DIR" -p 55439 -d postgres -v user_id=00000000-0000-4000-8000-000000000008 -f "$OPS_TEST_DIR/claim.sql" > "$OPS_TEST_DIR/b.log" 2>&1 & OPS_PID_B=$!
OPS_SUCCESS=0
if wait "$OPS_PID_A"; then OPS_SUCCESS=$((OPS_SUCCESS+1)); fi
if wait "$OPS_PID_B"; then OPS_SUCCESS=$((OPS_SUCCESS+1)); fi
if [ "$OPS_SUCCESS" -ne 1 ]; then cat "$OPS_TEST_DIR/a.log" "$OPS_TEST_DIR/b.log"; exit 1; fi
psql -h "$OPS_TEST_DIR" -p 55439 -d postgres -v ON_ERROR_STOP=1 -c "select public.assert_ok((select count(*)=1 from huddle_ops.redemptions r join huddle_ops.coupons c on c.id=r.coupon_id where c.code='LASTONE'),'concurrent last-slot quota is atomic');"
printf 'Operations database suite passed, including concurrent quota enforcement.\n'
