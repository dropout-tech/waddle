# Waddle 🐧

一個整合 **任務管理 + 時間區塊排程 + 日記反思** 的工作面板，三欄式單頁應用。慢慢搖擺，把事情做完。

> 桌面為主、純前端（無後端／無持久化）的 Next.js 應用。所有資料皆存於記憶體中，重新整理後會回到 mock 初始狀態。

## 主要功能

- **左側任務面板** — Workspace ▸ Category ▸ Task 三層架構，支援搜尋、urgency 篩選、密度切換、quick-add、全螢幕檢視
- **中央日曆** — 日／週／月 三種檢視，可拖放任務上時間軸、即時時間指示、待排清單區
- **右側報告** — 完成率、urgency 分佈、workspace 對比（recharts）
- **焦點工具** — 番茄鐘、暫存板、日記反思模式
- **設定** — 時間偏好、通知、自訂 slot type、workspace 管理

## 技術棧

| 類別 | 套件 |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19、TypeScript 5.7 |
| Styling | Tailwind CSS v4、shadcn/ui (Radix Primitives) |
| Forms | react-hook-form + zod |
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

## 專案結構

```
app/
  layout.tsx        # Root layout、theme provider
  page.tsx          # Root state (workspaces, timeBlocks, settings)
  globals.css       # Tailwind v4 + design tokens
components/
  layout/           # MainLayout、ResizeHandle
  calendar/         # 日／週／月檢視、time-grid、task-block
  task-panel/       # 任務列表、filter、unified-list、full-screen
  modals/           # 任務、設定、workspace、日記、報告
  reports/          # ReportDashboard
  scratchpad/       # 焦點暫存板
  timer/            # 番茄鐘
  notifications/    # 通知中心
  ui/               # shadcn/ui 元件
hooks/              # use-mobile, use-swipe-navigation, use-toast
lib/
  types.ts          # Workspace / Category / Task / TimeBlock / SlotType
  mock-data.ts      # 初始 demo 資料
  task-utils.ts     # 任務排序、計數、篩選輔助
  calendar-utils.ts # Calendar 共用幾何/時間計算
  utils.ts          # cn (clsx + tailwind-merge)
  workspace-icons.tsx
```

## 資料模型

```
Workspace ─┬─ Category ─── Task[]
           └─ ...
TimeBlock     # 非任務時段（午休、緩衝、專注）
SlotType      # 可自訂的時間區塊類別系統
```

## 開發須知

- 所有 root state 在 `app/page.tsx`，透過 `MainLayout` 向下傳遞
- 沒有後端，現有資料全為 mock；要接 API 須引入 fetch 層
- Calendar 拖放邏輯共用於 [lib/calendar-utils.ts](lib/calendar-utils.ts)
