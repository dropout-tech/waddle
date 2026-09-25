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
- 通過：Deno Edge Function type check 與 7 項 contract tests。
- 通過：獨立 PostgreSQL 整合測試（包含 8 個並行請求搶最後 1 次額度）。
- 通過：桌面及 390px 瀏覽器操作驗證（資料／AI 為 mock）。
- 未驗證：真實模型回應品質、正式 Supabase migration／Edge Function 部署、實機 App 行為。尚無 OPENAI_API_KEY 本機設定，沒有呼叫付費 AI。

## 與會者與任務指派（後續版本，尚未部署）

此節取代前述「負責人僅為備註」的限制。會議基本資料新增時間（台北）、與會者姓名、團隊、人工確認的轉寫別名，以及自己／既有共享夥伴的帳號對應。不查詢陌生人信箱、不把團隊或相近姓名自動合併成個人。

- AI 輸出 `ownerParticipantId`、`ownerEvidence`、`assignmentConfidence`、`assignmentReason`。實際 prompt 在 `supabase/functions/meeting-import/prompt.ts`。
- 檢查 ownerEvidence 是任務 source 中的原文，且有唯一對應的姓名／已確認別名；缺少依據、未知說話者、別名重複時，降為未確認。
- 使用者可勾選「明確指派給我時自動建立」（預設開啟）。模型結果保存、20 次額度扣用與自己的任務建立在同一交易內完成。
- 人工 checklist 可分別選自己／共享夥伴／不指派。未指派保存草稿，不建立任務；指派自己直接建立；對夥伴只建立待接受邀請。
- AI 不會自行送出他人指派。只有使用者確認 checklist 才送出，且伺服器重新驗證共享關係。
- 指派收件匣出現在桌面任務「總覽」、手機重點頁，另有使用者選單「待接受指派」與 `/assignments`。
- 收件者看到指派人、任務、日期與該項原文，選擇自己的分類並接受後才建立任務。拒絕不建立。對方無完整逐字稿讀取權限。
- 接受／拒絕為不可逆終態；重送不新增，已拒絕項目保留歷史，本版不支援改派或撤回。
- 收件匣最多載入最早 100 筆待接受項目及最近 20 筆已回覆項目；回覆後刷新會繼續帶入其餘待接受項目。每 30 秒及視窗取得焦點時更新。
- 舊版紀錄沒有與會資料，不會推定為自己；可人工指派。

### 部署順序

先套用 `20260925081959_meeting_imports.sql`，再套用 `20260925083539_meeting_assignments.sql`。第二份依賴已存在的 `0016_calendar_sharing.sql`。更新 Edge Function 與前端後，跑兩個測試帳號的實際接受／拒絕流程。不要套用本工作區其他未發佈 migration。

### 逐字稿語意驗收

本次使用提供的真實逐字稿做對話模型初步整理，另以程式驗證 12 項人工審閱候選的原文引用與「缺名單時零自動指派」規則。真實內容與輸出僅存於忽略版控的 `.codex/artifacts/meeting-evaluation/`，不提交私人會議內容。

這不是實際部署模型端到端測試：會議日期、名單／別名與上傳者身份尚待使用者確認，且未設定 AI 金鑰。真實模型品質仍待上述資訊與金鑰就緒後驗證。

額外驗證：`npx deno run --node-modules-dir=none --allow-read scripts/tests/meeting-transcript-eval.mts <逐字稿檔案> <審閱後預期JSON>`。此工具檢查輸入長度、原文引用、未知身份禁止自動指派，不會呼叫模型。

本版追加驗證已通過：與會者／時間輸入、自動建立本人任務的顯示、他人指派、未指派清單保存後再派給自己、20 次額度阻擋、接受／拒絕與失敗重試、重開紀錄及手機版。SQL 驗證另包含 5 個並行接受只建立 1 個任務、非收件者禁止回覆、錯誤分類禁止接受及未確認歸屬不自動建立。網頁與 Capacitor build 皆通過；以上仍是本機資料庫與模擬 API 測試。
