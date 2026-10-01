# Pro 上鎖＋免費用量門檻：實作設計（E2）

日期：2026-10-01。分支：`feat/pro-limits`（DB 子分支 `feat/pro-limits-db`、前端子分支 `feat/pro-limits-ui`，最後合回本分支）。

## 0. 老闆已拍板（2026-10-01，不再問）

- **總開關**：全部上鎖行為由 `huddle_ops.settings.limits_enforced` 控制，**預設 false**。關著時所有人行為與今天完全相同（免費用戶照常用）。內購上線那天才打開。
- 用量門檻＝積極版：免費「進行中任務 150、記事本筆記 100、圖片 200MB」；Pro 任務／筆記無上限、圖片 20GB。
- AI 會議整理：開關打開後免費每月 5 次、Pro 每月 20 次；**開關關著時維持現在的每月 20 次**。
- Google 日曆串接改 Pro；**開關打開前已連結過的帳號永久保留**（grandfather）。
- 建立組織併進總開關：開關關著時免費也能建；打開後才要 Pro。
- 舊用戶（開關打開前註冊）送 Pro 60 天，在「打開開關」那一步由伺服器自動發。
- Apple Watch 第一版不帶；新企鵝造型／音樂包是「之後新增的內容」，現在沒有東西要鎖 → 本次不做。
- 超量只擋「新增」；檢視、編輯、完成、刪除、匯出照常，不刪不藏資料。

## 1. 名詞定義

- **進行中任務**：`tasks` 中 `is_completed = false and is_archived = false` 的列（同 `lib/focus.ts`）。重複任務算 1 列。
- **記事本筆記**：`notebook_notes` 的列（若有軟刪除／封存欄位，排除已刪除的）。便條紙 `sticky_notes`、白板 `scratchpad_items` 不算。
- **圖片用量**：storage bucket `notebook-images` 中路徑前綴 `{user_id}/` 的物件 `metadata->>'size'` 總和。白板 base64 圖（存在 `scratchpad_items.content`）**本次不計**（已知缺口，寫進 HANDOFF）。
- **Pro**：`huddle_ops.has_pro(uid)`（付費 entitlement 或 grants，不改它）。

## 2. 資料庫合約（`feat/pro-limits-db` 負責）

一支新 migration `supabase/migrations/2026100120xxxx_pro_limits.sql`，**只寫檔、只在本機拋棄式 Postgres 驗證，絕不 `supabase db push`、絕不連正式庫**。

1. `huddle_ops.settings` 加 `limits_enforced boolean not null default false`、`limits_enforced_at timestamptz`。
2. `huddle_ops.limits_enforced() returns boolean`（stable、security definer、search_path=''）。
3. `huddle_ops.plan_allows(p_user uuid) returns boolean` ＝ `not limits_enforced() or has_pro(p_user)`。
4. 常數集中在一個函式 `huddle_ops.plan_limits(p_user uuid) returns jsonb`：`{active_tasks, notes, image_bytes, meeting_imports}`；Pro 時任務／筆記為 null（無上限）、image_bytes=21474836480、meeting_imports=20；免費 150／100／209715200／5；開關關著時全部 null 但 meeting_imports=20。
5. **任務**：`tasks` BEFORE INSERT trigger。只在 `current_user = 'authenticated'`（使用者直接寫入；security definer 流程如接受會議指派、service role 的會議匯入不受影響）、新列本身是進行中、開關開、非 Pro、且已有進行中 ≥ 150 時 `raise exception 'TASK_LIMIT'`。若能辨識「重複任務拆分」產生的列，豁免它（不擋編輯既有資料）；辨識不了就在報告寫明。
6. **筆記**：`notebook_notes` BEFORE INSERT trigger，同上規則，≥ 100 時 `raise exception 'NOTE_LIMIT'`。
7. **圖片**：`storage.objects` 對 bucket `notebook-images` 加一條 RESTRICTIVE insert policy：開關開且非 Pro 時，該使用者「既有」物件總大小 ≥ 200MB 就拒絕（不需要知道新檔大小；最多超出單檔 5MB 可接受）。Pro 上限 20GB 同理。
8. **AI 會議整理**：`reserve_meeting_import` 的寫死 20 改讀 `plan_limits(p_user)->>'meeting_imports'`；Edge Function `supabase/functions/meeting-import/index.ts` 的 `list` 回傳的 `limit` 改成同一個值。
9. **Google 日曆**：新表 `huddle_ops.feature_grandfathers(user_id uuid, feature text, granted_at timestamptz, primary key(user_id, feature))`；migration 內把現有 `google_calendar_connections` 的使用者回填為 `feature='google_calendar'`；開關關著時每次成功連結也寫一筆（Edge Function 或 trigger 皆可，選可靠的那個）。`supabase/functions/google-calendar/index.ts` 的 `start`：開關開、非 Pro、且無 grandfather → 回 403 `{error:'PRO_REQUIRED'}`。已連結者的 `events`／`busy` 不擋。
10. **建立組織**：`create_organization` 與 `get_my_organizations.can_create` 的 `has_pro(uid)` 改為 `plan_allows(uid)`。
11. **用量查詢 RPC**：`public.my_plan_usage() returns jsonb`（security definer，grant authenticated）：`{enforced, pro, limits:{...plan_limits}, used:{active_tasks, notes, image_bytes, meeting_imports_this_month}, grandfathered:{google_calendar:bool}}`。
12. **打開開關的程序**：`huddle_ops.enable_pro_limits(p_gift_days integer default 60)`，只給 service_role：(a) 回填 grandfather；(b) 對 `launched_at` 起、開關打開前註冊、且目前無 Pro 的每個使用者用 `huddle_ops.give_days(..., 'manual', 'pro-limits-launch-gift:'||user_id, ...)` 送 60 天（source_key 冪等）；(c) 設 `limits_enforced=true, limits_enforced_at=now()`。**migration 不呼叫它**；要不要跑由老闆決定。另附 `huddle_ops.disable_pro_limits()` 回滾開關（不收回已送天數）。
13. 權限：新函式一律 `revoke all from public, anon, authenticated`，再明確 grant 需要的；照既有 migration 風格。
14. 測試：仿 main 上 `scripts/tests/*.sh` 的本機拋棄式 Postgres 做法，新增 `scripts/tests/pro-limits.sh`，涵蓋：開關關→全部照舊（含會議 20 次、免費可建組織）；開關開→免費第 151 個進行中任務 TASK_LIMIT、完成一個後可再建、Pro 無上限、已完成任務不受限、definer 流程不受限；筆記 101 NOTE_LIMIT；圖片 policy；會議 5/20；grandfather 回填；enable_pro_limits 冪等、送天數冪等；disable 回滾。

## 3. 前端合約（`feat/pro-limits-ui` 負責）

錯誤碼：`TASK_LIMIT`、`NOTE_LIMIT`、`IMAGE_LIMIT`（前端預檢用）、`PRO_REQUIRED`、既有 `MONTHLY_LIMIT`。DB trigger 以 P0001 + message 傳回，比照 `lib/assignments.ts` 的 `raw.includes(code)` 對照法。

1. `lib/billing/plan-usage.ts`：呼叫 `my_plan_usage`，型別照 §2.11；`hooks/use-plan-usage.ts`（共用快取，失敗時回「未啟用」不擋任何事——fail open 只在前端，後端照擋）。
2. 錯誤顯示：`hooks/use-waddle-data.ts` 的 `handleDbError`、`hooks/use-notebook.ts` 建立筆記失敗處，先攔上述代碼，顯示白話 toast＋「了解 Pro」動作連到 `/membership`。不能再顯示成「錯誤代碼 P0001」。
3. 圖片上傳三處（`hooks/use-notebook.ts`、`components/modals/task-detail-modal.tsx`、`components/scratchpad/whiteboard-detail.tsx`）：上傳前若 `enforced && used.image_bytes >= limits.image_bytes` 就先擋並提示；storage 回錯也轉成同一句。
4. 會議整理：`lib/meeting-import.ts`、`components/meetings/meeting-workspace.tsx` 的寫死 20 全改用伺服器回傳的 limit。
5. Google 日曆頁 `app/settings/google-calendar/page.tsx`：`enforced && !pro && !grandfathered.google_calendar` 時以升級提示取代「連結」按鈕；`start` 回 PRO_REQUIRED 也顯示同一提示。
6. 會員頁 `components/operations/membership.tsx`：開關打開時顯示三項用量條（任務／筆記／圖片）與本月會議整理次數；≥80% 用提醒色。開關關著時不顯示任何新東西。
7. 共用元件：從 `components/org/org-center.tsx` 的升級框抽出 `components/billing/upgrade-prompt.tsx`，組織頁改用它。
8. 文案：全部走 `t()`，繁中當 key、英文寫進 `lib/i18n/dict/`；語氣溫和不催促；不寫「Notion 式」。對外文案初稿完成後標「待老闆審」。
9. 手機 390px、觸控 44pt；iOS 是靜態匯出，不可用 server actions／route handlers／middleware。
10. **開關關著時，畫面必須與現在完全相同**——這是最重要的驗收條件。

## 4. 不做／留待之後

白板 base64 圖片計量、Pro 到期後超量的特殊 UI、80% 主動推播、新企鵝造型／音樂包上鎖、Apple Watch、打開開關本身（要老闆同意＋內購上線）。
