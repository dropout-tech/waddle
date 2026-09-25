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
assert sql("select available_points || ',' || ranking_points from points_accounts where user_id='00000000-0000-0000-0000-000000000004'").stdout.strip() == '1,1'
def redeem(n):
    return sql("set role service_role; insert into points_ledger(user_id,kind,source_key,points_delta,description) values('00000000-0000-0000-0000-000000000004','redemption','concurrent-%s',-1,'test');" % n, check=False)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(redeem, range(2)))
assert sum(r.returncode == 0 for r in results) == 1
assert sql("select available_points || ',' || ranking_points from points_accounts where user_id='00000000-0000-0000-0000-000000000004'").stdout.strip() == '0,1'
print('PASS: 12 concurrent claims award once; concurrent redemptions cannot overspend; ranking preserved.')
