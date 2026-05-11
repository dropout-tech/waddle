# 會議標記、已完成抽屜、行程匯出三大功能加上多 agent code review

# Description

- 一輪密集的功能開發 session：先補了之前的小 bug 與優化（cute completion sound、modal 勾選即時同步、persistent AudioContext、任務時間 chip 顯示日期、時間區塊 / 類別存檔的非破壞性寫入），然後實作三個較大功能 — 「已完成任務」抽屜 + KPI 統計、行程匯出 PNG、會議標記與相關配套（今日會議 chip / 瀏覽器通知 / 報告 KPI）。
- 中段做了一次手刻 17 條 code-review，全部修完；之後安裝 `dev-skills` plugin（dropout-tech/dev-skills marketplace），用多 agent `/code-review` 再跑一遍，再修 4 條 confidence 100 的 Critical。
- 同時補了 README 文件、`onboarding-tour.tsx` 對應新功能的 spotlight steps、Supabase migrations 0007/0008、`isLightColor` 工具、`forEachTask` / `findTaskById` 等樹走訪 helper。

# Changes Made

## 一、會議標記與配套（commits `aeff4a2`, `7242a78`）

- 資料層：`Task` 新增 `isMeeting / attendees / location / meetingUrl`；migration `0008_meeting_fields.sql` 加四個欄位 + partial index；`mappers.ts` 雙向對應。

  ```sql
  -- supabase/migrations/0008_meeting_fields.sql
  alter table public.tasks
    add column if not exists is_meeting boolean not null default false,
    add column if not exists attendees text,
    add column if not exists location text,
    add column if not exists meeting_url text;
  create index if not exists tasks_is_meeting_idx
    on public.tasks (user_id, scheduled_date) where is_meeting = true;
  ```

- 任務詳情 modal：「標記為會議」toggle，開啟後展開三個欄位；視訊連結自動偵測 Zoom/Meet/Teams/Webex/generic（`lib/meeting-utils.ts`）。
- 視覺差異化（`components/calendar/task-block.tsx`、`components/task-panel/task-row.tsx`、`components/calendar/calendar-export-view.tsx`）：雙線邊框、對角紋理、右上角 icon badge；後續加 luminance-aware 切色（`lib/utils.ts` 新增 `isLightColor`）。
- 「今日會議」popover（`components/task-panel/today-meetings-popover.tsx`）：今日未結束的會議列表，含「進行中 / N 分鐘後」標籤，可一鍵加入視訊。
- 瀏覽器提醒：`lib/meeting-reminder.ts` + `hooks/use-meeting-reminders.ts`，30s 輪詢、`Notification` API、localStorage 紀錄已 fired ID（pruning + 損壞時刪 key）。設定 modal 加 5/10/15 分鐘選項。
- 報告 dashboard 加「會議佔比」與「深度工作時間」KPI（`components/reports/report-dashboard.tsx`）。

## 二、已完成任務抽屜（commit `a2450aa`）

- migration `0007_completed_tasks_view.sql`：`user_settings.keep_completed_today_in_list` + 回填 `tasks.completed_at` 用 `updated_at`。
- `components/task-panel/completed-tasks-drawer.tsx`：右側 sheet，KPI 卡（本週完成、連續天數 streak、平均耗時、最常完成時段），列表依時間分組（今天 / 昨天 / 本週稍早 / 上週 / 按月 / 未知時間）。
- 主任務列表過濾邏輯改：完成的任務只有「今日完成 + 設定保留」才留下；其餘進抽屜。
- 任務面板頂端 chip 列（並排放「今日會議」+「已完成 (N)」）。

## 三、行程匯出 PNG（commit `a6ac2ef`）

- `components/calendar/calendar-export-modal.tsx`：日期範圍 picker（今天/本週/本月/自訂，最多 14 天）、隱私選項（顯示任務名稱 / 顯示備註）、淺/深主題、即時預覽、下載 PNG / 複製剪貼簿兩個動作。
- `components/calendar/calendar-export-view.tsx`：1080px 固定寬輸出，自帶 Waddle 企鵝 logo + watermark；隱私模式時只顯示時段顏色不洩漏內容。
- `html-to-image` 新依賴；pixelRatio: 2 輸出 2160px 高解析度。
- 日曆 header 加「匯出」按鈕（桌面 secondary row、手機 ⋯ overflow menu）。

## 四、共用 helpers / 一致性整理

- `lib/task-utils.ts` 新增 `forEachTask` / `findTaskById` / `filterTasks`，取代五個檔案各自 hand-roll 的 `for ws → for cat → for task` 巢狀走訪。
- `lib/utils.ts` 新增 `isLightColor`（YIQ luminance 判斷）。
- `app/page.tsx` 的 `liveSelectedTask` 改用 `findTaskById`，配合 modal 同步即時狀態（早先修的 bug，這次補完整）。
- `lib/task-sound.ts` 改成 lazy-init + 共用 `AudioContext`，避免 cancel-然後立即-complete 第二聲沒響的問題。

Result: ✅ 5 個 feat commit + 1 個 review-fix commit成功推上 `main`（hashes `a7c9af2` → `feec9ae`）。Production build 全程通過。Zeabur 自動部署（CI/CD）。

# Updates

## 第一輪 code review（手刻、17 條，commit `feec9ae`）

我先自己跑了一次多面向 review，17 條全修：

- Fixed [HIGH] `lib/supabase/mappers.ts:119-122` — `taskToRow` 無條件寫 4 個會議欄位 → pre-migration deployment 所有 task update 都會失敗。改加 `meetingColsKnownMissing` session latch + `stripMeetingCols` + retry-on-PGRST204/42703，套到 `createTask` 與 `updateTask`。
- Fixed [HIGH] `hooks/use-meeting-reminders.ts:78` — Notification onclick 沒驗證 URL scheme，`javascript:` URL 可被觸發。加 `detectMeetingProvider` 把關 + 標題/地點/參與者長度與 newline 清洗。
- Fixed [HIGH] `components/onboarding-tour.tsx` — 新功能沒對應 spotlight steps，違反 memory `feedback_onboarding_tour.md`。桌面與手機 tour 都加會議標記 / 今日會議 / 已完成 / 匯出 PNG 提示，並補 `data-tour` anchors 到 task-panel.tsx 與 calendar-header.tsx。
- Fixed [MED] `components/task-panel/today-meetings-popover.tsx:30` — `todayStr` 用 `useMemo([])` 凍結在 mount → 跨午夜不換日。改加 1 分鐘 `nowTick` ticker。
- Fixed [MED] `components/calendar/calendar-export-view.tsx:127-151` — 循環時段在範圍內每天蓋一份，跟現有 calendar 不一致（live calendar 只在 `b.date` 顯示）。改成只渲染自己日期那天。
- Fixed [MED] `hooks/use-waddle-data.ts:1032` — settings migration fallback regex 太寬，可能誤觸。加 `error.code in {PGRST204, 42703}` 雙條件。
- Fixed [MED] `lib/meeting-reminder.ts:65` — fired-set JSON parse 失敗回空 set，導致 30 秒重發。改成損壞時刪 key。
- Fixed [MED] `components/task-panel/task-row.tsx:418` — meeting chip 用 hardcoded oklch cream 底，dark mode 不可讀。改 `bg-primary/15 text-primary` token。
- Fixed [MED] `components/calendar/calendar-export-modal.tsx:461` — PreviewScaler 用 `calc(-100% * (1-scale))` 數學錯（resolve 父寬不是子高）。改用 `ResizeObserver` 量子層高度 × scale 套到 wrapper。
- Fixed [MED] `components/task-panel/today-meetings-popover.tsx:60` — popover 外擊用 `mousedown` 不觸發 iOS Safari。改 `pointerdown`。
- Fixed [MED] popover trigger + X close 按鈕觸控目標 < 40px。改 `min-h-[32px]` + X 改 `w-8 h-8` rounded 容器。
- Fixed [MED] `components/calendar/task-block.tsx:309` — meeting ring 在淺色 workspace 看不到。引入 `isLightColor` 切 black/30 vs white/45。
- Fixed [LOW] 5 處 workspace 樹走訪重複 — 抽到 `lib/task-utils.ts` 的 `forEachTask / findTaskById / filterTasks`。
- Fixed [LOW] `lib/meeting-reminder.ts:53` — `cutoff.toISOString().slice(0,10)` UTC vs local 邊界 → 改用 `toDateString`。
- Fixed [LOW] `components/task-panel/completed-tasks-drawer.tsx:78` — 沒 `completedAt` 的舊任務被靜默 skip → 加「未知時間」桶，stats 仍排除以保正確。
- Fixed [LOW] `components/task-panel/completed-tasks-drawer.tsx:252` — sticky group header 蓋到 KPI → 改非 sticky。
- Fixed [LOW] `components/calendar/calendar-export-modal.tsx:168` — 檔名 mix 中文 + ASCII，部份系統下載亂碼 → 改 `waddle-schedule-...png`。

順手加碼：streak 計算改成 fresh-Date-per-iteration，避免非 TW 時區 DST fall-back 雙計天的 edge case。

## 第二輪 code review（`/dev-skills:code-review` 多 agent pipeline，4 條 Critical confidence=100）

裝 `dev-skills` plugin 後跑了 5 agent 並行 review（bugs-security / claude-md / git-history / plan-adherence / quality-architecture），再用 1 個 Haiku scorer 統一打分，14 個 candidate 過濾出 4 條 ≥ 80：

- Fixed [Critical] `components/task-panel/task-panel.tsx:152` — CR-01：完成日期過濾比的是 UTC `split('T')[0]` 對 local `todayStr`，TW 早上 00:00-08:00 完成的會被過濾掉。改 `toDateString(new Date(task.completedAt))` 用 local 日期。
- Fixed [Critical] `components/task-panel/task-panel.tsx:102` — CR-02：`todayStr = useMemo(..., [])` 凍結在 mount（跟 popover 一樣 bug，第一輪只修了 popover 沒注意這邊也有）。加 1 分鐘 `nowTick` ticker。
- Fixed [Critical] `components/task-panel/today-meetings-popover.tsx:51` — CR-03：跨午夜會議（23:00-01:00）`end.setHours(eh, em)` 落今天 01:00，會被當成已結束。加 `if (endMin < startMin) end.setDate(end.getDate() + 1)`。
- Fixed [Critical] `hooks/use-waddle-data.ts:1098` — CR-04：`saveSettings` 用 inline regex 沒 latch，跟 `createTask/updateTask` 的 session-latch 模式不一致。加 `settingsExtColsKnownMissing` 平行 latch，並重構成 `isMissingColumnError(err, regex)` 通用 helper。

# Result

- 驗證：`npx tsc --noEmit` 與 `pnpm build` 在每個階段都過。沒寫單元測試（專案沒測試套件），dev server 沒手動跑（無瀏覽器環境）。
- 部署：Zeabur CI/CD 自動跟著 push 上 main，本 session 共 7 push（5 feat + 1 review-fix + 預計 1 wrap-up）。
- 文件：`README.md` 大改 — 更新成 Supabase 後端、加入會議 / 已完成 / 匯出 / 通知 / 設定的功能段；技術棧表加 Supabase、html-to-image、sonner、vaul；專案結構樹同步；新增 `## 環境變數`、`### 資料庫 Migration` 段。
- Migration：0007、0008 都已在 Supabase 跑過（user 確認）。
- Plugin：`~/.claude/plugins/marketplaces/dev-skills/` clone + 三個檔（`known_marketplaces.json`、`settings.json` 的 `extraKnownMarketplaces` / `enabledPlugins`、`installed_plugins.json`）手動設置，後續 `/dev-skills:wrap-up` 等指令可用。
- REVIEW.md：本 session 第二輪 review 結果保留在 repo root（4 finding 全 resolved，下個 session 可清掉或保留作參考）。
