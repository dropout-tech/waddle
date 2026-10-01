-- 搶先送 Pro 給現有用戶（老闆 2026-10-01 決定；送到哪天由老闆另定）
--
-- ⚠️ 這支檔「只寫不跑」。執行前必須：
--   1. 老闆在對話中明確同意「這次」執行，以及到期日（p_until）。
--   2. 前提：migration 20261001200000_pro_limits.sql 已套用到目標資料庫
--      （否則 huddle_ops.grant_early_pro 不存在）。
--   3. 先確認連到的是正式專案 jnikcndiexjojgvicohf，而不是測試副本：
--        - SQL Editor：看網址 / 專案選單是否為 jnikcndiexjojgvicohf；
--        - psql：先跑下面的「身分檢查」，確認 host 含 jnikcndiexjojgvicohf
--          （pooler 連線則看使用者名稱 postgres.jnikcndiexjojgvicohf）。
--      不符就停手。
--   4. 用 service_role 或 postgres 身分執行（函式只授權給 service_role）。
--
-- 行為（細節見 migration §12）：
--   對所有已註冊、非匿名、未停權的帳號，若其 Pro 到期（付費與贈送兩個來源
--   取最晚）早於 p_until，就送整數天數（無條件進位）讓 Pro 延到 p_until。
--   已經更長的人（例如付費年訂閱）完全不動，不會被縮短。
--   冪等：同一個日期重跑不會重複送；之後若要延長，用更晚的日期再跑一次即可。
--   回傳值 = 這次實際送了幾個人。
--   之後打開上鎖總開關（enable_pro_limits）時，所有舊用戶 Pro 至少保證到
--   「打開當下 + 60 天」，早送的 Pro 若很快到期會自動補足。
--
-- 回滾：送出的天數記在 huddle_ops.grants（source='manual'，
--   source_key 以 'early-pro:' 開頭），必要時可設 revoked_at 收回。

-- ── 身分檢查（先跑這段，確認是 jnikcndiexjojgvicohf）──────────────────────
select current_database() as db, current_user as role_name,
       inet_server_addr() as server_addr, session_user as session_user_name;
select count(*) as members_to_consider
  from auth.users au
 where not coalesce(au.is_anonymous, false)
   and not exists (select 1 from huddle_ops.members m where m.user_id = au.id and m.suspended);

-- ── 執行（老闆同意後，把日期換成老闆指定的那天，台北時間）──────────────────
-- select huddle_ops.grant_early_pro('2026-12-31 23:59:59+08');

-- ── 執行後核對 ──────────────────────────────────────────────────────────────
-- select count(*) as grants, min(expires_at), max(expires_at)
--   from huddle_ops.grants where source_key like 'early-pro:%' and revoked_at is null;
