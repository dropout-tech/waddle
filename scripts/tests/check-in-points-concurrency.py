"""Run after check-in-points.sql in a disposable local DB; no production access."""
import concurrent.futures
import subprocess

PSQL = ['psql', '-X', '-h', '/tmp', '-p', '55438', '-d', 'huddle_points_test', '-v', 'ON_ERROR_STOP=1', '-At']
def sql(query, check=True):
    return subprocess.run(PSQL + ['-c', query], text=True, capture_output=True, check=check)
claim = "set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004'; select * from public.claim_daily_check_in();"
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    list(pool.map(sql, [claim] * 12))
assert sql("select count(*) from points_ledger where user_id='00000000-0000-0000-0000-000000000004'").stdout.strip() == '1'
assert sql("select total_points from points_accounts where user_id='00000000-0000-0000-0000-000000000004'").stdout.strip() == '1'
print('PASS: 12 concurrent claims award exactly one score event and one cumulative point.')
