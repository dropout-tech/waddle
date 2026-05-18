# Mobile Immersive Timer + Brand Token Sweep · 2026-05-18

## TL;DR

兩件主要工作：

1. **新建手機沉浸式 Focus Timer**（[focus-timer-immersive.tsx](../../components/timer/focus-timer-immersive.tsx)）— 手機開始計時後切換到全屏沉浸畫面，含呼吸動畫、5 秒自動 dim、長按 0.9s 退出、工作→休息「辛苦了」結束畫面。
2. **全 app brand token sweep** — 11 個檔案的 Tailwind 預設色票（`bg-red-500`、`text-blue-500` 等）換成 Waddle warm OKLCH token（`bg-urgency-*`、`text-success`、`text-info`、`text-chart-*`、`bg-destructive`、`bg-current-time`）。
3. **Onboarding tour 改回 Waddle 風** — Linear indigo spotlight → terracotta `--primary` via `color-mix`；冷色 confetti → 6 個暖色；skip link 加 backdrop chip 修可讀性。

## Context

User goal：強化 Waddle 的 UI/UX 一致性與品牌感，特別是手機體驗。User 想全面檢視整個 app。

我先做了 audit 產出 [2026-05-18-uiux-audit.md](2026-05-18-uiux-audit.md)（4 lens × 全 app），找到 ~40 個問題分 5 個批次。User 選擇先做 Batch 3（onboarding）+ Batch 2（token sweep）。

## Session work

### Phase 1 — Skill setup
- 釘 `/craft`、`/animate-ui` slash command（透過 `~/.claude/commands/`）
- 加 shadcn MCP 到 `~/.claude.json`（下次 session 生效）
- 建立 [PRODUCT.md](../../PRODUCT.md)（策略）+ [DESIGN.md](../../DESIGN.md)（視覺）作為 impeccable skill 的 context

### Phase 2 — Immersive Timer（craft flow）
做完 shape 階段後實作：[focus-timer-immersive.tsx](../../components/timer/focus-timer-immersive.tsx) 新檔；[focus-timer.tsx](../../components/timer/focus-timer.tsx) 加掛接邏輯。

- 全屏 `z-[80]`，drenched 色彩（`color-mix` warm wash）
- 8s `waddle-breathe` 呼吸背景（reduced-motion 下停）
- 240px progress ring + 4.5rem 時間字
- 5 秒無互動自動 dim → 任何 touch 喚回
- 長按 × 0.9s 退出（視覺進度圈）
- BGM bar 底部固定，顯示目前播放
- 工作→休息切換時 2.4s 完成畫面：「辛苦了 / 慢慢搖擺，喝口水吧」

### Phase 3 — Audit
單 agent 跑 code-only audit 覆蓋 4 lens（手機 UX / 桌面視覺 / Copy / a11y + motion）。產出 [uiux-audit.md](2026-05-18-uiux-audit.md)，含 5 個建議實作批次。

### Phase 4 — Batch 3：Onboarding tour
- Spotlight ring `rgba(99, 102, 241)` (Linear indigo) → `color-mix(in oklch, var(--primary) 85%, transparent)`
- Dim layer `bg-black/65` → `bg-foreground/55`（warm dim）
- `CONFETTI_COLORS` 6/6 換成暖色域 hex
- Skip link `text-white/70` → `bg-foreground/80 text-background` chip
- Tooltip 加 `maxWidth: calc(100vw - 24px)` 防溢出

### Phase 5 — Batch 2：Token sweep
11 個檔案：

| 檔案 | 改動 |
|---|---|
| `calendar/current-time-line.tsx` | `bg-red-500` → `bg-current-time` |
| `modals/task-detail-modal.tsx` | URGENCY_BUCKETS 從 3 桶 → 4 桶（低/中/高/緊急）對應 urgency-* token，含 chipText 對比修正 |
| `notifications/notification-center.tsx` | 優先級顏色 + bell badge + empty state → urgency / success / info token |
| `calendar/calendar-header.tsx` | `stroke-emerald-500` → `stroke-success`；移除 `animate-pulse` |
| `calendar/month-view.tsx` | 週末紅藍 → `text-foreground/65` |
| `modals/workspace-settings-modal.tsx` | Delete workspace 鈕 → `--destructive` token |
| `scratchpad/focus-scratchpad.tsx` | 清除/刪除 hover → destructive token（2 處） |
| `task-panel/filter-bar.tsx` | Urgency pills → urgency-* token，含淺色 token 改用 `text-foreground` |
| `modals/settings-modal.tsx` | 7 個彩虹 section icons → chart-* / urgency / info / destructive token |
| `timer/focus-timer.tsx` | Status dot `bg-green-500 animate-pulse` → `bg-success` |

### Phase 6 — Code review
跑了 2 個 agent（bugs-security、quality-architecture；其他 3 個因無 CLAUDE.md / plan / commit history 不適用）找到 11 個 finding（1 critical / 10 warning）：

- **CR-01 dark mode token 缺失** → 補完 `.dark` 所有對應 OKLCH override
- **WR-01 immersive RAF 沒 unmount 清理** → 加 useEffect cleanup
- **WR-02 `${color}33` hex-alpha 不通用** → 改用 `color-mix(in oklch, ${color} 22%, transparent)`
- **WR-03 text-white 在淺色 urgency 上對比不足** → 低/中 chip 改 `text-foreground`，URGENCY_BUCKETS 加 `chipText` 欄位
- **WR-04 BgmBar / 完成 overlay 玻璃感** → 拿掉 `backdrop-blur-md`
- **WR-05 spotlight ring 硬編 terracotta hex** → 改 `var(--primary) via color-mix`
- **WR-06 z-[60] 撞 menu** → 升 `z-[80]`
- **WR-07 通知優先級往 critical 偏一格** → medium → urgency-medium（從 urgency-high）
- **WR-08 settings text-chart-2 重新引入冷色** → 換 `text-info`；layers chart-4 → chart-3 避免重複
- **WR-09 URGENCY 級距 6 從中變高** → 文檔化（接受行為改變）
- **WR-10 onboarding dim 65%→45% 太淡** → 提到 55%
- **WR-11 BgmBar duplication** → 抽 `summarizeBgm()` 到 `lib/timer-bgm.ts`，兩處共用

## Verification

- `pnpm exec tsc --noEmit` → exit 0 ✅
- `pnpm build` → 成功，所有 routes 產生 ✅
- 殘餘 Tailwind 預設色：從滿天飛 → 7 個檔案 / 114 行，全部集中在 Batch 1 預定處理（reports、full-screen-task-view、main-layout、journal-modal、calendar-export-modal、panel-header、today-meetings-popover）

## What's not done

- **Batch 1**（reports / 全螢幕任務 / journal 三個面板的 KPI 牆）— ~2h 工作量，最大塊
- **Batch 4**（motion + a11y baseline：global reduced-motion、ease-quart token、aria-label、`width` 動畫換 `transform`）— ~1h
- **Batch 5**（Copy 軟化：「需要立即處理」、「嚴重過期」、「繼續保持！」+ em-dash 清掉）— ~30m

實機驗證也沒做：
- Phase 5 修改未在實機 / Playwright viewport 測過
- dark mode 新 token 的視覺結果未實際看過（純根據 OKLCH 數學調整）

## Unsolved Issues

無 critical 殘留。Audit 中提到的「整個 `lib/urgency-colors.ts` 抽出單一 urgencyTone() 函數」是更大的 refactor，沒做。

## Updates during review

User 在 wrap-up 階段選擇「都修完再 commit」，所以 11 個 finding 全部處理；無延後項目。

## Files changed

**新增 (5)**:
- [PRODUCT.md](../../PRODUCT.md)
- [DESIGN.md](../../DESIGN.md)
- [components/timer/focus-timer-immersive.tsx](../../components/timer/focus-timer-immersive.tsx)
- [docs/reports/2026-05-18-uiux-audit.md](2026-05-18-uiux-audit.md)
- [docs/reports/2026-05-18-mobile-immersive-timer-and-token-sweep.md](2026-05-18-mobile-immersive-timer-and-token-sweep.md)

**修改 (13)**:
- [app/globals.css](../../app/globals.css)（dark mode token override）
- [components/calendar/calendar-header.tsx](../../components/calendar/calendar-header.tsx)
- [components/calendar/current-time-line.tsx](../../components/calendar/current-time-line.tsx)
- [components/calendar/month-view.tsx](../../components/calendar/month-view.tsx)
- [components/modals/settings-modal.tsx](../../components/modals/settings-modal.tsx)
- [components/modals/task-detail-modal.tsx](../../components/modals/task-detail-modal.tsx)
- [components/modals/workspace-settings-modal.tsx](../../components/modals/workspace-settings-modal.tsx)
- [components/notifications/notification-center.tsx](../../components/notifications/notification-center.tsx)
- [components/onboarding-tour.tsx](../../components/onboarding-tour.tsx)
- [components/scratchpad/focus-scratchpad.tsx](../../components/scratchpad/focus-scratchpad.tsx)
- [components/task-panel/filter-bar.tsx](../../components/task-panel/filter-bar.tsx)
- [components/timer/focus-timer.tsx](../../components/timer/focus-timer.tsx)
- [lib/timer-bgm.ts](../../lib/timer-bgm.ts)
- [REVIEW.md](../../REVIEW.md)
