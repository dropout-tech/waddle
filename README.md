# Waddle 🐧

一個整合 **任務管理 + 時間區塊排程 + 日記反思** 的工作面板，三欄式響應式應用。慢慢搖擺，把事情做完。

> Next.js 16 + Supabase（RLS、SSR auth）。資料持久化到 Postgres，跨裝置同步。桌面、平板、手機皆優化。

## 主要功能

- **左側任務面板** — Workspace ▸ Category ▸ Task 三層架構，支援搜尋、urgency 篩選、密度切換、quick-add、全螢幕檢視
- **中央日曆** — 日／週／月 三種檢視，可拖放任務上時間軸、即時時間指示、待排清單區
- **會議任務** — 任務可標記為會議，多三個欄位（參與者 / 地點 / 視訊連結）；自動偵測 Zoom / Meet / Teams / Webex 並提供「加入」按鈕；日曆上有專屬視覺差異化（雙線邊框、對角紋理、icon badge）
- **今日會議 chip** — 任務面板頂端顯示今天還剩幾場會議，點開可一鍵加入視訊
- **已完成任務抽屜** — 完成的任務集中管理，KPI 含本週完成數、連續天數 streak、平均完成耗時、最常完成時段；依時間分組（今天 / 昨天 / 本週稍早 / 上週 / 按月）
- **匯出行程 PNG** — 選日期範圍輸出 1080px 圖檔，含 Waddle 品牌標記；隱私模式只顯示時段顏色不洩漏細節
- **瀏覽器通知提醒** — 會議開始前 5/10/15 分鐘 OS 通知，點擊直接跳轉視訊連結（Notification API；分頁需開著）
- **右側報告** — 完成率、urgency 分佈、workspace 對比（recharts）；含「會議佔比」與「深度工作時間」KPI
- **焦點工具** — 番茄鐘（含可選音效 + 自動休息）、暫存板、日記反思模式
- **設定** — 時間偏好、視圖範圍（日 1-3 天 / 週 5-7 天）、通知、自訂 slot type、workspace 管理、任務完成音效、今日完成任務是否保留在列表

## 技術棧

| 類別 | 套件 |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19、TypeScript 5.7 |
| Styling | Tailwind CSS v4、shadcn/ui (Radix Primitives) |
| 後端 / 認證 | Supabase（Postgres + RLS + SSR auth via `@supabase/ssr`） |
| Drawer / Sheet | vaul（手機 bottom sheet）、Radix Dialog（桌面 right drawer） |
| Toast | sonner |
| 圖檔輸出 | html-to-image（行程 PNG 匯出） |
| 視覺化 | recharts |
| 日期 | date-fns |

## 開發

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build
pnpm start
pnpm lint
```

### 環境變數

`.env.local` 需要：

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### 資料庫 Migration

`supabase/migrations/` 下的 `.sql` 檔需依序執行（Supabase Studio → SQL editor）：

| Migration | 內容 |
|---|---|
| 0001 | 初始 schema（workspaces / categories / tasks / time_blocks / settings） |
| 0002 | RLS policies |
| 0003 | Onboarding tour 進度 |
| 0004 | `tasks.show_in_task_list` |
| 0005 | `slot_types.parent_key` |
| 0006 | `user_settings.day_view_days / week_view_days` |
| 0007 | `user_settings.keep_completed_today_in_list` + `tasks.completed_at` 回填 |
| 0008 | `tasks.is_meeting / attendees / location / meeting_url` |

App 對新欄位 missing 有 graceful fallback（偵測 PGRST204 / 42703 自動降級），所以 migration 落後不會 hard-crash，但會走 localStorage / 預設值。

## 專案結構

```
app/
  layout.tsx              # Root layout、theme、Noto Sans TC + Geist
  page.tsx                # Root: useWaddleData() + 各個 modal 掛點
  globals.css             # Tailwind v4 + design tokens
  auth/                   # SSR auth callback + signout
  login/ signup/          # Supabase auth pages
components/
  layout/                 # MainLayout、ResizeHandle
  calendar/               # 日／週／月檢視、time-grid、task-block、export-modal/view
  task-panel/             # 任務列表、filter、unified-list、full-screen、completed-tasks-drawer、today-meetings-popover
  modals/                 # 任務、設定、time-block、workspace
  reports/                # ReportDashboard
  scratchpad/             # 焦點暫存板
  timer/                  # 番茄鐘（含 timer-sound）
  notifications/          # 通知中心
  onboarding-tour.tsx     # 首次登入 spotlight tour
  branding/               # Waddle 企鵝 SVG
  ui/                     # shadcn/ui 元件
hooks/
  use-waddle-data.ts      # 主資料層 — workspaces/tasks/timeBlocks/settings 的 CRUD + Supabase 同步
  use-meeting-reminders.ts# 每分鐘 poll，到時間 fire Notification
  use-mobile.ts           # ≤ 767px 判斷
  use-swipe-navigation.ts # 手勢切換分頁 / 日期
  use-body-scroll-lock.ts use-toast.ts
lib/
  types.ts                # Workspace / Category / Task / TimeBlock / SlotType / UserSettings
  task-utils.ts           # 任務排序、計數、forEachTask/findTaskById/filterTasks
  calendar-utils.ts       # Calendar 共用幾何/時間計算
  meeting-utils.ts        # 會議 URL provider 偵測（Zoom/Meet/Teams/Webex/generic）
  meeting-reminder.ts     # 提醒偏好 + collectMeetings + Notification API helpers
  task-sound.ts           # 任務完成音效（Web Audio API，無音檔依賴）
  timer-sound.ts          # 番茄鐘音效
  notes-render.tsx        # 備註的 link 解析
  popover-position.ts     # 共用 popover 定位
  workspace-icons.tsx     # workspace icon mapping
  utils.ts                # cn、haptic、isLightColor、scroll lock
  mock-data.ts            # 新帳號 onboarding 的 seed 資料
  demo-data.ts            # 首次登入塞入的 demo workspaces
  supabase/               # client、server、middleware、mappers、seed、database.types
supabase/
  migrations/             # SQL migrations，依序執行
```

## 資料模型

```
Workspace ─┬─ Category ─── Task ─── (is_meeting? → attendees/location/meeting_url)
           │                     ├── scheduledDate + start/end
           │                     ├── completedAt（用於統計 / streak / 已完成抽屜）
           │                     └── recurrence?
           └─ ...
TimeBlock          # 非任務時段（午休、緩衝、專注）
SlotType           # 可自訂的時間區塊類別系統，可 parent → workspace
UserSettings       # 視圖範圍、calendar hour range、通知偏好、slot types、會議提醒（localStorage）
```

## 開發須知

- 主資料層走 [hooks/use-waddle-data.ts](hooks/use-waddle-data.ts)：所有 CRUD 樂觀更新 + Supabase 同步、visibilitychange refetch（3s throttle）、寫入中跳過 refetch race（pendingWritesRef）
- Calendar 拖放與時段幾何計算共用 [lib/calendar-utils.ts](lib/calendar-utils.ts)
- 任務 modal 顯示用 `liveSelectedTask`（從 workspaces 由 id 即時查），避免 toggle complete 後 modal UI 不同步
- 跨檔案的 workspace 樹狀走訪用 [lib/task-utils.ts](lib/task-utils.ts) 的 `forEachTask / findTaskById / filterTasks`，不要自己寫 nested for
- 部署到 Zeabur，`pnpm install --no-optional` 跳過 ESLint dependency tree（lint 走 optionalDependencies）
- 新增功能時記得同步更新 [components/onboarding-tour.tsx](components/onboarding-tour.tsx) 的 spotlight steps
