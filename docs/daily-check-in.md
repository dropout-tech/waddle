# 每日簽到（2026-09-25）

成長入口現在只提供每日手動簽到、每日輪替鼓勵句與原本 Huddle 的三個動作：踏一步、揮手、坐著休息。移除畫面上的旅程、房間、成就與自動活動同步；既有資料表和歷史資料保留。英文文案同步更新。

簽到依使用者裝置的本地日期，每個帳號每天一筆，不做連續天數或補簽壓力。帳號或日期變更重新載入；失敗不顯示成功，可重試；不同裝置與分頁由資料庫複合主鍵防止重複。

## 上線前

先套用 `supabase/migrations/20260925090000_daily_check_ins.sql`，再發布前端。此次未套用正式 migration、未推送、未部署。新表只開放登入者讀取與新增自己的紀錄，不提供更新或刪除權限。不將舊自動腳印轉成簽到。

## 驗證

- `pnpm type-check`。
- `pnpm exec eslint components/growth/growth-journey-dashboard.tsx hooks/use-daily-check-in.ts components/layout/main-layout.tsx components/calendar/calendar-header.tsx lib/i18n/dict/growth.ts lib/supabase/database.types.ts`。
- `node scripts/e2e/daily-check-in-verify.mjs`：本機 3168 dev server 與既有測試帳號，資料庫流量全數攔截；檢查自動寫入為零、儲存失敗重試、簽到後鎖定、重新進入、讀取失敗重試、跨日、英文、桌機/手機與深色畫面。這不代表正式資料库已驗證。
- `scripts/tests/daily-check-ins.sql`：僅對可丟棄的本機 PostgreSQL 執行，驗證 migration、每日唯一值、帳號隔離、匿名拒絕及權限。測試會建立模擬 auth schema 和角色。

## 插畫

使用內建 imagegen，以 `public/huddle-mascot.png` 為角色參考；最終素材為 `public/growth/check-in-penguins.png`，透明背景。最初的新企鵝版本已被此版取代。

最終提示詞：

Use case: identity-preserve. Create a wide transparent illustration of THREE poses of the EXACT Huddle mascot in the supplied reference. This is the user's existing character. Preserve its distinctive identity exactly: rounded dark warm-grey body, two round ear-like bumps on top, thick uneven dark olive-brown outline, very large round cream eye rings with dark circular pupils, tiny horizontal oval dark nose/beak, irregular cream belly patch, stubby dark grey feet, short flippers, chalky hand-painted paper texture. Do NOT redesign as a conventional penguin. NO yellow or orange beak or feet, NO scarves, NO clothing, NO heart-shaped white face, NO new facial features. Three full-body Huddles side by side in a wide layout: left gently taking one small step, middle raising one short flipper in greeting, right sitting comfortably resting. Keep original large round eyes and proportions on all three. All on same baseline with ample separation and margins. Truly transparent background, no scenery, no text, no watermark. These must look like three poses drawn by the original illustrator of the reference, not different animals.

## 本次結果

TypeScript 通過；上述 UI 測試與本機 PostgreSQL 測試全部通過。ESLint 無錯誤，僅 main-layout 原有未使用 onClose 參數警告；設計 detector 無 finding。桌機、390px 手機及深色截圖留在 `docs/reports/daily-check-in-shots/`。正式 Supabase REST 與正式站行為仍需發布時驗證。
