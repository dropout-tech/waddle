# 每日簽到（2026-09-25）

所有「成長」入口已改名「每日簽到」，提供每日手動簽到與積分、每日輪替鼓勵句與原本 Huddle 的三個動作：踏一步、揮手、坐著休息。移除畫面上的旅程、房間、成就與自動活動同步；既有資料表和歷史資料保留。英文文案同步更新。

簽到由資料庫以台北時間判定當日，每個帳號每天 1 分（目前預設），不接受前端自訂日期、身分或分數。不做連續天數或補簽壓力。帳號或日期變更重新載入；失敗不顯示成功，可重試；不同裝置與分頁由資料庫複合主鍵防止重複。

## 部署狀態

每日簽到與每日 +1 分已透過 PR #64 發布，正式 merge 為 `a2e210dd4ab1319f769a141e3d6a51b5ddbfe3a2`；Zeabur deployment `6656984050` 成功，正式 Supabase 前兩份 migration 與測試帳號簽到已驗證。

排行榜與註冊日期為本次追加功能：需先套用 `20260925120000_check_in_leaderboard.sql`，再發布前端。本機驗證通過；目前正式資料庫管理分頁連線逾時、Supabase connector 無專案權限、本機管理 token 回覆 401，因此追加功能尚未上線。

第二份 migration 會撤銷前端直接新增簽到的權限；舊版前端簽到會失敗，部署時需協調資料庫與前端更新並讓舊頁面重新載入。不將舊自動腳印轉成簽到，也不補發歷史簽到積分；當天舊版簽到可按新按鈕領取一次。

## 純累積分數

- 每天簽到固定 1 分，只累積分數供排行使用，沒有可用餘額、扣分、兌換或退款功能，也不代表金錢或服務權益。
- `points_ledger` 只保存正數的 daily_check_in 記錄：使用者、唯一來源鍵、分數、簽到日期、說明及時間。前端和 service_role 皆沒有直接新增、修改、刪除記錄的權限。
- `points_accounts.total_points` 保存累積總分，與帳本同步更新，並建立排序索引。資料表仍只能直接讀取自己的分數；排行榜透過專用 RPC 提供匿名排行。
- `claim_daily_check_in()` 採用 `auth.uid()` 與資料庫台北日期；簽到、記錄及總分在同一交易完成，唯一鍵防止並行或重試重複加分。
- `get_daily_check_in_status()` 返回自己的簽到狀態、當日分數與累積總分。前端不能指定日期、帳號或金額。
- 未來更改每日給分規則需同步更新兩個 RPC；已記錄分數保留，不以新規則重算。

## 排行榜與註冊日期

- 每日簽到頁顯示分數前 50 位；同分並列名次（例如 1、1、3），同分顯示順序固定。
- 自己不在前 50 位仍可看到自己的名次與分數；0 分不列入名次。
- 對外欄位僅匿名企鵝代碼、名次、分數及自己的標記。暱稱取 UUID 的 MD5 前 12 碼，不回傳 email、UUID、登入名稱或註冊日期。
- `get_check_in_leaderboard()` 只允許已登入者執行，definer 函式固定空 search_path 並檢查 auth.uid；底層 RLS 不变。讀取不改寫任何分數。
- 簽到分數更新與視窗重新聚焦會重新讀取排行；錯誤可重試。帳號／日期切換會卸載舊查詢，防止跨帳號顯示。
- 使用者選單以 Auth `user.created_at` 顯示自己的註冊日期，按台北時區格式化，支援繁體中文與英文；無效日期不顯示。
- 回滾前端不影響既有簽到資料；新 RPC 為獨立唯讀功能，可保留而不被舊前端呼叫。

## 驗證

- `pnpm type-check`。
- `pnpm exec eslint components/growth/growth-journey-dashboard.tsx hooks/use-daily-check-in.ts components/layout/main-layout.tsx components/calendar/calendar-header.tsx lib/i18n/dict/growth.ts lib/supabase/database.types.ts`。
- `node scripts/e2e/daily-check-in-verify.mjs`：本機 3169 dev server（可用 E2E_BASE_URL 覆寫） 與既有測試帳號，資料庫流量全數攔截；檢查自動寫入為零、儲存失敗重試、簽到後鎖定、重新進入、讀取失敗重試、跨日、英文、桌機/手機與深色畫面。另驗證積分顯示、RPC 不帶日期/金額、台北跨日。資料庫 mock 不代表正式行為驗證。
- `scripts/tests/check-in-points.sql`：在空白的本機 `huddle_points_test` 資料庫執行，驗證兩份 migration、首次給分、重複請求、舊紀錄不補分、帳號隔離、偽造寫入拒絕、分數只能為正數、不含可用餘額欄位、帳本寫入失敗整筆回滾與匿名權限。
- `python3 scripts/tests/check-in-points-concurrency.py`：接著在本機 `/tmp` socket、55438 port 執行；12 次同時簽到只加一次分。測試 fixture 僅用一次，重跑需重建空白資料庫。
- 最初 `scripts/tests/daily-check-ins.sql` 僅驗證第一份 migration 的舊權限；最新版本以 points 測試為準。

## 插畫

使用內建 imagegen，以 `public/huddle-mascot.png` 為角色參考；最終素材為 `public/growth/check-in-penguins.png`，透明背景。最初的新企鵝版本已被此版取代。

最終提示詞：

Use case: identity-preserve. Create a wide transparent illustration of THREE poses of the EXACT Huddle mascot in the supplied reference. This is the user's existing character. Preserve its distinctive identity exactly: rounded dark warm-grey body, two round ear-like bumps on top, thick uneven dark olive-brown outline, very large round cream eye rings with dark circular pupils, tiny horizontal oval dark nose/beak, irregular cream belly patch, stubby dark grey feet, short flippers, chalky hand-painted paper texture. Do NOT redesign as a conventional penguin. NO yellow or orange beak or feet, NO scarves, NO clothing, NO heart-shaped white face, NO new facial features. Three full-body Huddles side by side in a wide layout: left gently taking one small step, middle raising one short flipper in greeting, right sitting comfortably resting. Keep original large round eyes and proportions on all three. All on same baseline with ample separation and margins. Truly transparent background, no scenery, no text, no watermark. These must look like three poses drawn by the original illustrator of the reference, not different animals.

- `scripts/tests/check-in-leaderboard.sql`：全新本機資料庫執行；涵蓋前 50 名、並列、榜外自己的排名、0 分、匿名代碼、RLS 與未登入拒絕。
- UI 測試追加：註冊日期比對 Auth 原始日期、簽到後排名更新、自身標記、排行載入錯誤重試、英文無殘留中文。

## 本次結果

TypeScript、UI 測試與本機 PostgreSQL 測試通過。整合 main 前 production build 通過；整合最新 main 後重跑 build 遭 Google Fonts 下載連線失敗，需待網路恢復後再次確認。ESLint 無錯誤；user-menu 原有 mounted effect 有一則警告。設計 detector 無 finding，桌機與 390px 手機排行榜截圖已檢視。追加功能的正式 migration、部署與正式站驗證尚待管理連線恢復。
