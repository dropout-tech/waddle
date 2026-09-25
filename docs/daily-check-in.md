# 每日簽到（2026-09-25）

所有「成長」入口已改名「每日簽到」，提供每日手動簽到與積分、每日輪替鼓勵句與原本 Huddle 的三個動作：踏一步、揮手、坐著休息。移除畫面上的旅程、房間、成就與自動活動同步；既有資料表和歷史資料保留。英文文案同步更新。

簽到由資料庫以台北時間判定當日，每個帳號每天 1 分（目前預設），不接受前端自訂日期、身分或分數。不做連續天數或補簽壓力。帳號或日期變更重新載入；失敗不顯示成功，可重試；不同裝置與分頁由資料庫複合主鍵防止重複。

## 上線前

依序套用 `supabase/migrations/20260925090000_daily_check_ins.sql` 和 `supabase/migrations/20260925100000_check_in_points.sql`，再發布前端。此次只在可丟棄的本機資料庫驗證，未套用正式 migration、未推送、未部署。

第二份 migration 會撤銷前端直接新增簽到的權限；舊版前端簽到會失敗，部署時需協調資料庫與前端更新並讓舊頁面重新載入。不將舊自動腳印轉成簽到，也不補發歷史簽到積分；當天舊版簽到可按新按鈕領取一次。

## 純累積分數

- 每天簽到固定 1 分，只累積分數供未來排行使用，沒有可用餘額、扣分、兌換或退款功能，也不代表金錢或服務權益。
- `points_ledger` 只保存正數的 daily_check_in 記錄：使用者、唯一來源鍵、分數、簽到日期、說明及時間。前端和 service_role 皆沒有直接新增、修改、刪除記錄的權限。
- `points_accounts.total_points` 保存累積總分，與帳本同步更新，並建立排序索引供未來排行使用。僅能讀取自己的分數；尚未公開排行榜或其他使用者資料。
- `claim_daily_check_in()` 採用 `auth.uid()` 與資料庫台北日期；簽到、記錄及總分在同一交易完成，唯一鍵防止並行或重試重複加分。
- `get_daily_check_in_status()` 返回自己的簽到狀態、當日分數與累積總分。前端不能指定日期、帳號或金額。
- 此版直接修訂尚未部署的第二份 migration；若曾在本機套用舊版，需重建可丟棄測試資料庫。不能將重跑 migration 當成已部署資料庫的升級方法。
- 未來更改每日給分規則需同步更新兩個 RPC；已記錄分數保留，不以新規則重算。

## 驗證

- `pnpm type-check`。
- `pnpm exec eslint components/growth/growth-journey-dashboard.tsx hooks/use-daily-check-in.ts components/layout/main-layout.tsx components/calendar/calendar-header.tsx lib/i18n/dict/growth.ts lib/supabase/database.types.ts`。
- `node scripts/e2e/daily-check-in-verify.mjs`：本機 3168 dev server 與既有測試帳號，資料庫流量全數攔截；檢查自動寫入為零、儲存失敗重試、簽到後鎖定、重新進入、讀取失敗重試、跨日、英文、桌機/手機與深色畫面。另驗證積分顯示、RPC 不帶日期/金額、台北跨日。這不代表正式資料庫已驗證。
- `scripts/tests/check-in-points.sql`：在空白的本機 `huddle_points_test` 資料庫執行，驗證兩份 migration、首次給分、重複請求、舊紀錄不補分、帳號隔離、偽造寫入拒絕、分數只能為正數、不含可用餘額欄位、帳本寫入失敗整筆回滾與匿名權限。
- `python3 scripts/tests/check-in-points-concurrency.py`：接著在本機 `/tmp` socket、55438 port 執行；12 次同時簽到只加一次分。測試 fixture 僅用一次，重跑需重建空白資料庫。
- 最初 `scripts/tests/daily-check-ins.sql` 僅驗證第一份 migration 的舊權限；最新版本以 points 測試為準。

## 插畫

使用內建 imagegen，以 `public/huddle-mascot.png` 為角色參考；最終素材為 `public/growth/check-in-penguins.png`，透明背景。最初的新企鵝版本已被此版取代。

最終提示詞：

Use case: identity-preserve. Create a wide transparent illustration of THREE poses of the EXACT Huddle mascot in the supplied reference. This is the user's existing character. Preserve its distinctive identity exactly: rounded dark warm-grey body, two round ear-like bumps on top, thick uneven dark olive-brown outline, very large round cream eye rings with dark circular pupils, tiny horizontal oval dark nose/beak, irregular cream belly patch, stubby dark grey feet, short flippers, chalky hand-painted paper texture. Do NOT redesign as a conventional penguin. NO yellow or orange beak or feet, NO scarves, NO clothing, NO heart-shaped white face, NO new facial features. Three full-body Huddles side by side in a wide layout: left gently taking one small step, middle raising one short flipper in greeting, right sitting comfortably resting. Keep original large round eyes and proportions on all three. All on same baseline with ample separation and margins. Truly transparent background, no scenery, no text, no watermark. These must look like three poses drawn by the original illustrator of the reference, not different animals.

## 本次結果

TypeScript 通過；上述 UI 測試與本機 PostgreSQL 測試全部通過。本次異動檔案 ESLint 無錯誤或警告；設計 detector 無 finding。桌機、390px 手機及深色截圖留在 `docs/reports/daily-check-in-shots/`。正式 Supabase REST 與正式站行為仍需發布時驗證。
