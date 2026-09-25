# 會議轉任務

## 使用方式

登入後從右上角使用者選單選「會議轉任務」，或開啟 `/meetings`。
填寫會議名稱、日期並貼上逐字稿，亦可匯入 UTF-8 TXT / MD / SRT / VTT（160 KB 上限）。每份 20–40,000 字元，不接收音訊或 PDF。

AI 整理摘要、決議、待確認事項與最多 20 項任務草稿。使用者勾選、編輯名稱／負責人備註／期限，選擇自己的工作區分類後才正式建立任務。
現有任務沒有成員指派欄位，負責人明確作為文字備註保存。來源原文與會議名稱、日期寫入任務描述。
結果自動儲存；不建立任務也能留下紀錄。最近紀錄列出最新 50 份，跨裝置共用。文字資料持續保存在帳號內，帳號刪除時一併刪除。本版本尚無單份紀錄刪除或全文編輯介面。

## 額度與一致性

- 每位非匿名登入使用者，每個台北日曆月最多 **20 次成功整理**；不依裝置或工作區分開計算。
- 處理中先保留額度；成功扣次，失敗釋放。每月 1 日 00:00 Asia/Taipei 自動使用新月份。
- PostgreSQL advisory transaction lock 保護最後一次額度，無法由客戶端修改。
- UUID 請求鍵在網路重送時共用，已完成結果不再呼叫模型。相同 UUID 搭配不同內容會拒絕。
- 5 分鐘未完成的工作視為失敗；舊工作不能事後覆寫。模型請求 90 秒 timeout。
- 每位使用者每小時最多 30 個新請求（含失敗），避免失敗重試耗盡 API 預算。
- 任務匯入與 source-index 對應在同一資料庫交易內完成；重送、跨装置勾選相同草稿不會重複建立。已刪除的任務也不會因重播匯入而悄悄復活。
- 任務草稿的手動修改保留在當前頁面；切換歷史紀錄或離開會放棄尚未建立的修改。

## 安全與服務

Supabase Edge Function `meeting-import` 驗證使用者 JWT (`auth.getUser`)，不接受客戶端指定 user_id。三個寫入 RPC 都是 SECURITY INVOKER 且只授權 service_role；資料表僅允許 authenticated SELECT 自己的資料。

AI 金鑰只放 Edge Function secrets。輸入最多 200,000 bytes，模型输出經 Zod 驗證，每個任務 source 必須是逐字稿的連續原文。提示詞將逐字稿視為不可信資料。模型不會直接建立任務或執行工具。

使用 `gpt-4.1-mini` structured outputs，一次產生紀錄和草稿，`store:false`，最多 6,000 output tokens。沒有紀錄或金鑰輸出的 log。Huddle 資料保留與 AI 供應商資料保留政策是兩件事。

## 上線設定（本次尚未部署）

1. 將 `20260925081959_meeting_imports.sql` 套用到目標 Supabase 專案；先確認 migration 歷史。不要對這個有其他未上線 migration 的工作區直接無差別 db push。
2. 在 Supabase Edge Function secrets 設定 `OPENAI_API_KEY`（不要填入 NEXT_PUBLIC_* 或版本控制）。平台自動提供 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY。
3. 部署 `meeting-import`。保留平台預設 JWT 驗證；handler 也獨立驗證 JWT。確認目前專案 JWT 簽章與平台 gateway 相容。
4. 發布包含 `/meetings` 與選單入口的網頁。Capacitor 為靜態頁，直接呼叫相同 Edge Function，無 Next.js server route 依賴；原生 App 需重新建置安裝才能取得入口。
5. 用測試帳號、非敏感逐字稿跑一次真實 AI 整理，驗證用量增加一次、任務實際存在、重新匯入不增加任務。此驗證会產生實際 API 費。

如果尚無金鑰，會議清單仍可查詢，生成控制停用並顯示「AI 整理尚未啟用」。

## 可重跑驗證

- `pnpm type-check`
- `pnpm build`、`pnpm build:cap`
- `npx deno check --node-modules-dir=none supabase/functions/meeting-import/index.ts`
- `npx deno test --node-modules-dir=none supabase/functions/meeting-import/contract.test.ts`
- `python3 scripts/tests/meeting-imports.py`：本機暫存 PostgreSQL，無真實資料；可用 PG_BIN 指定 PostgreSQL binary 目錄。驗證併發額度、RLS、RPC 權限、月份、重送、失敗與任務防重複。
- 先 `pnpm build`，再 `node scripts/e2e/meeting-import-verify.mjs`：測試帳號登入、所有資料及 AI 回應模擬；需要 `.env.e2e.local` 的 E2E_EMAIL / E2E_PASSWORD。測試自己啟動 3172 埠的 production server，截圖存 `/tmp/huddle-meeting-shots`。

模擬 UI 與本機 SQL 測試不等於真實 AI 或正式環境部署驗證。

## 本次驗證結果（2026-09-25）

- 通過：TypeScript、新增前端檔案 ESLint、網頁 production build、Capacitor static build。
- 通過：Deno Edge Function type check 與 4 項 contract tests。
- 通過：獨立 PostgreSQL 整合測試（包含 8 個並行請求搶最後 1 次額度）。
- 通過：桌面及 390px 瀏覽器操作驗證（資料／AI 為 mock）。
- 未驗證：真實模型回應品質、正式 Supabase migration／Edge Function 部署、實機 App 行為。尚無 OPENAI_API_KEY 本機設定，沒有呼叫付費 AI。
