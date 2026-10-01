# AI 回顧報告：交接說明

- 日期：2026-10-01
- 分支：`feat/ai-review`（從 main `490601d` 分出）
- 給誰：接手實作的工程師

## 1. 現在的狀態

規格、技術設計、資料庫變更草稿都完成了。**功能程式一行都還沒寫**：沒有 Edge Function、沒有前端。正式資料庫沒有動過，沒有部署過任何東西。

| 項目 | 狀態 | 檔案 |
|---|---|---|
| 規格書 v4（12 項功能、30 條驗收標準） | 老闆已簽認 | `spec-ai-review.md` |
| 技術設計（資料表、函式、API 合約、素材白名單、測試計畫） | 完成 | `docs/features/ai-review-design.md` |
| 資料庫變更草稿（三張新表、9 支函式） | 已在本機拋棄式資料庫驗過，**未套用到任何 Supabase 專案** | `supabase/migrations/20261001120000_ai_reviews.sql` |
| 資料庫測試 | 可重跑，全過（見第 5 節） | `supabase/tests/ai_review_checks.sql`、`scripts/tests/ai-review-*.sh` |
| 同意畫面與政策文案 | 初稿，**老闆尚未審** | `docs/legal/2026-10-01-ai-consent-copy-draft.md` |
| 假設帳本（13 條） | 持續更新 | `docs/assumptions.md` |
| Edge Function `ai-review` | 未開始 | — |
| 前端 | 未開始 | — |

## 2. 建議的閱讀順序

1. `spec-ai-review.md` 第 1～5 節：要做什麼、不做什麼、30 條驗收標準。
2. `spec-ai-review.md` 第 6.3 節：設計約束。這是資安第二意見的結論，逐條都是硬性要求。
3. `docs/features/ai-review-design.md` 第 0、1 節：三件要先知道的事，以及七處不能照抄 `meeting-import` 的地方。
4. 設計文件第 4 節（API 合約）與第 6 節（素材與欄位白名單）。
5. 設計文件第 9 節：既有的 AI 會議整理怎麼接上同意機制，以及上線順序。
6. 設計文件第 12 節：17 項技術取捨與 14 項未決事項。

## 3. 這個功能在做什麼

使用者在回顧頁按「產生報告」，伺服器讀他本人的任務、便條紙、專注白板、時間區塊（開關打開時再加會議重點），把文字整理好後呼叫 OpenAI gpt-4.1-mini，寫成五段的回顧報告並存檔。數字由程式先算，AI 只寫文字。

三個容易做錯的地方：

- **個資送第三方 AI**。沒有伺服器端的同意紀錄就不能呼叫 OpenAI。同意紀錄只能由伺服器寫入。
- **只送白名單欄位**。任務上的會議連結、地點、與會者、他人指派的任務內容都不能送。白板的 `content` 欄可能是整張圖的 base64，正式庫實測最大一筆 262,990 字。
- **額度帳本與報告分表**。使用者可以刪報告，但刪了不退額度。

## 4. 還沒做的工作

| 編號 | 工作 | 依據 | 備註 |
|---|---|---|---|
| A | Edge Function `ai-review`：`index.ts`、`contract.ts`、`period.ts`、`material.ts`、`richtext.ts`、`prompt.ts`，加單元測試 | 設計第 4～8 節 | 素材模組只收使用者身分的 client，原始碼不得出現 `Deno.env`、`createClient`、`SERVICE_ROLE` |
| B | `supabase/functions/_shared/ai-consent.ts`，以及 `meeting-import/index.ts` 的同意檢查 | 設計第 9 節 | 由環境變數 `MEETING_IMPORT_CONSENT_ENFORCED` 控制，預設關；關閉時行為必須與現在相同 |
| C | 前端 AI 回顧：回顧頁入口、同意畫面（做成兩個功能可共用）、報告檢視、歷史列表、設定頁撤回、i18n | 規格 F1～F8、設計第 4 節 | 報告只能用純文字顯示，不得用 `renderNotesWithLinks` 或 `dangerouslySetInnerHTML`；入口受 `status` 回應的 `enabled` 控制 |
| D | 前端 AI 會議整理的同意畫面 | 規格 F12、設計第 9.4 節 | 與 AI 回顧的同意分開，各按各的 |
| E | 隱私說明與服務條款改稿（中、英），法務頁日期改成各頁自帶 | 規格第 6.4 節、文案初稿 C、D 節 | **等老闆審過文案才動**。`docs/legal/2026-10-01-pro-launch-copy-draft.md` 是另一條工作線的草稿，改隱私頁前先確認沒有互相覆蓋 |
| F | 新手導覽補一步 | 規格 F10 | 專案慣例：功能有變動就同步導覽 |
| G | 30 條驗收標準逐條驗 | 設計第 11 節 | 前端用 Playwright；手機寬 390px 也要驗 |
| H | 上線：套 migration、部署函式、上前端、打開開關 | 設計第 9.3 節 | 每一步都要先問老闆 |

專案慣例提醒：

- 同一份前端也包成 iOS app（Capacitor），不能用 server actions、route handlers、middleware。
- 新文案一律繁中加英文，走 `lib/i18n/dict/` 的 `t()`。
- 手機要驗 390px、可點區域不小於 44pt、safe-area。
- 對外文案不寫「Notion 式」。

## 5. 已經驗證的事，以及怎麼重跑

2026-10-01 在本機的拋棄式 PostgreSQL 上實跑（43 支 migration 依序套用）：

```bash
bash scripts/tests/ai-review-database.sh
```

結果：`PASS=93 FAIL=0`

```bash
bash scripts/tests/ai-review-supabase-defaults.sh
```

結果：`PASS=93 FAILED=0`。這支先模擬 Supabase 的「預設全開授權」再跑同一批檢查，用來證明是 migration 自己的 revoke 擋住了存取。

```bash
bash scripts/tests/ai-review-concurrency.sh
```

結果：8 個同時預約 → `succeeded=1 in_progress=7 ledger_rows=1`；撤回與預約並行後 `pending=0`。

三支都需要本機有 `initdb`、`pg_ctl`、`psql`。它們只開暫存的本機資料庫，不讀任何連線字串。

**還沒驗的**：

- Supabase 平台上的實際行為（函式擁有者角色、PostgREST 回傳的錯誤格式）。
- Edge Function、前端、任何端到端流程（都還沒實作）。
- 每份報告的實際 token 數。目前只有字數實測：正式庫最忙的帳號單月 159 筆、2,213 字，換算每份約 0.006 美元。第一份真報告產出後看 `usage` 欄位確認。

## 6. 地雷

- **不要在這個分支上跑 `supabase db push`**，除非老闆已同意套用。草稿 migration 就放在 `supabase/migrations/`，push 會把它套到正式庫。
- 宣稱「對正式庫做了某事」之前，先印出連線的專案代號核對。正式專案是 `jnikcndiexjojgvicohf`。
- 回顧頁的「本週」是最近 7 天的滾動視窗，不是日曆週（`components/reports/report-dashboard.tsx:47-55`）。AI 回顧照同樣算法，數字才對得上。回顧頁用瀏覽器時區，伺服器固定台北時區，邊界日可能差一天。
- AI 會議整理是已上線功能。同意畫面的前端沒上線前，不能打開伺服器的同意檢查，否則使用者會被擋卻看不到同意畫面。
- `huddle_ops.has_pro` 的執行權已全部收回（`supabase/migrations/20260927120000_task_assignments_orgs.sql:44`），新函式靠 security definer 呼叫它。
- OpenAI 的 `store: false` 不代表不留存，濫用監控紀錄最長留 30 天。對外文案不能把兩者畫上等號。現行隱私說明第 9 行就寫錯了。
- 接受他人會議指派的任務辨識有一個殘餘漏洞：指派人刪除帳號、且本人又改掉說明開頭時，系統認不出該任務來自他人（設計文件 U5）。現有欄位無法根治。
- 既有問題、與本功能無關：`sticky_note_folders` 沒有停權限制 policy，`scripts/tests/account-suspension.sh` 與 `task-assignment.sh` 各有一條斷言因此失敗。已另開工作處理。
- 任務讀取沒有分頁（`hooks/use-waddle-data.ts:375`），這是舊地雷，本功能不碰；Edge Function 自己的查詢要分頁並設筆數上限。

## 7. 等老闆決定或處理的事

**文案（擋 E）**

1. 營運者名稱與一個可收信的私人聯絡管道。文案裡留了兩個空格，法規顧問把這項列為紅燈。
2. 同意畫面要不要加「我已滿 18 歲，或已取得法定代理人同意」。
3. 會議整理的紀錄目前不能單獨刪除，文案只能寫「存到刪除帳號為止」。要不要另外加刪除功能。
4. 報告最後「一兩句觀察」的語氣規則。目前的預設是：只寫一到兩句；不催促、不打分數、不下指令（設計文件第 7 節的系統提示）。

**上線前提（擋 H）**

1. OpenAI 後台：開一把這個功能專用的金鑰（環境變數 `OPENAI_API_KEY_AI_REVIEW`）、設每月預算、確認沒有開啟「分享資料給 OpenAI」。
2. App Store Connect 的隱私標示同步更新。
3. 建議先問律師的六個問題，列在規格第 8 節。影響最大的是「個人開發者是否適用數位經濟相關產業個資辦法」。
4. 何時打開會議整理的伺服器同意檢查（設計文件 U7）。

**已由老闆定案，不用再問**

- 只給本人看、自己按按鈕產生、事實為主加一兩句觀察。
- 免費每月 4 份、Pro 每月 30 份。
- 報告留存，可回看、可刪。
- 第一版讀任務、便條紙、專注白板、時間區塊；會議重點是獨立開關，預設關。
- 接受他人會議指派的任務只送標題。
- AI 會議整理這一版一起納入同意機制。

## 8. 第二意見的來源

- 資安顧問：8 項發現，全部回寫在規格第 6.3 節。
- 法規顧問：1 紅 3 黃 1 綠，回寫在規格第 6.2、6.4 節與第 8 節。法規部分是風險盤點，不是法律意見。
