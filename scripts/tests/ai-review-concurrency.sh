#!/usr/bin/env bash
# Disposable local cluster only. Applies every migration and then the drafts
# in supabase/migrations-draft/, then fires parallel reservations to prove
# "one in-flight per account" and the withdraw/reserve serialization hold
# under real concurrency.
PORT=55473
source "$(dirname "$0")/ai-review-harness.sh"
PSQL+=(-At)
U=00000000-0000-4000-8000-0000000000a1
"${PSQL[@]}" -c "insert into auth.users(id,email) values('$U','a@example.invalid');
  select public.record_ai_consent('$U','ai_review','granted','v1','zh-TW',1,'{}','OpenAI','US','web',null);" >/dev/null
# 8 simultaneous requests, each holding its transaction open briefly.
for i in 1 2 3 4 5 6 7 8; do
  ( "${PSQL[@]}" -c "set role service_role; select public.reserve_ai_review('$U',gen_random_uuid(),1);" >"$D/out.$i" 2>&1 || true ) &
done
wait
OK=$(grep -l usage_id "$D"/out.* | wc -l | tr -d ' ')
BUSY=$(grep -l IN_PROGRESS "$D"/out.* | wc -l | tr -d ' ')
ROWS=$("${PSQL[@]}" -c "select count(*) from public.ai_review_usage where user_id='$U'")
echo "parallel reserve: succeeded=$OK in_progress=$BUSY ledger_rows=$ROWS (expect 1 / 7 / 1)"
# Withdraw racing against a reserve for a second account: whichever order wins,
# no pending row may survive a recorded withdrawal.
V=00000000-0000-4000-8000-0000000000b1
"${PSQL[@]}" -c "insert into auth.users(id,email) values('$V','b@example.invalid');
  select public.record_ai_consent('$V','ai_review','granted','v1','zh-TW',1,'{}','OpenAI','US','web',null);" >/dev/null
for i in 1 2 3 4 5 6; do
  ( "${PSQL[@]}" -c "set role service_role; select public.reserve_ai_review('$V',gen_random_uuid(),1);" >/dev/null 2>&1 || true ) &
  ( "${PSQL[@]}" -c "set role service_role; select public.record_ai_consent('$V','ai_review','withdrawn','v1','zh-TW',1,'{}','OpenAI','US','web',null);" >/dev/null 2>&1 || true ) &
done
wait
"${PSQL[@]}" -c "select 'after withdraw race: pending='||count(*) filter (where status='pending')||' rows='||count(*)||' (expect pending=0)' from public.ai_review_usage where user_id='$V'"
"${PSQL[@]}" -c "select 'latest consent action='||action from public.ai_consents where user_id='$V' order by id desc limit 1"
# Existing definitions are untouched by the new migration.
"${PSQL[@]}" -c "select 'v2 security definer='||prosecdef||' (expect false: unchanged invoker function)' from pg_proc where proname='reserve_meeting_import_v2'"
