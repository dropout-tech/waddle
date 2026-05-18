# Waddle UI/UX Audit · 2026-05-18

Comprehensive code-only audit against PRODUCT.md (溫柔陶瓷感、不催促、anti-SaaS) and DESIGN.md (OKLCH warm palette, ease-out-quart motion). Scope: task panel, calendar, reports, modals, timer (including the just-landed `focus-timer-immersive.tsx`), onboarding tour, scratchpad, notifications, auth pages, layout shell, and UI primitives.

## TL;DR

- The chrome that the user spends 90% of their time in (task-panel row, calendar header progress ring, immersive focus timer, mobile tab bar, scratchpad sheet, quick-links bar) is on-brand and genuinely well executed. Waddle is strongest in those surfaces.
- The brand promise breaks loudest in three secondary surfaces: **`reports/report-dashboard.tsx`**, **`task-panel/full-screen-task-view.tsx`**, and the JournalFocusView inside `layout/main-layout.tsx`. These three files alone produce roughly 60 percent of the brand violations in the codebase: pure Tailwind `red-500` / `blue-500` / `green-500` / `purple-500` are used for KPI tiles, gradient KPI cards, hard "需要立即處理" red alerts, and "需要處理" pressure copy. This is the classic Linear/Asana SaaS look the PRODUCT.md anti-references call out by name.
- Two other surfaces leak pure red into the warm palette: the calendar **current-time line uses literal `bg-red-500`** (should be `--current-time` / terracotta) and the **task-detail urgency slider** maps "High" to `bg-red-500` instead of `--urgency-critical` (terracotta). Both are tokens that already exist, so the fix is one-line.
- Motion and a11y are the weakest cross-cutting area: only `focus-timer-immersive.tsx` honors `prefers-reduced-motion`. Several places animate `width`/`height` (forbidden), use `ease-in-out` instead of `ease-out-quart`, and the onboarding tour spotlight ring is literal indigo `rgba(99,102,241,0.7)` plus a confetti palette of pure Tailwind hex codes including `#6366f1`/`#3b82f6`/`#a855f7`.
- A handful of copy lapses violate "不催促": "需要處理" (`full-screen-task-view.tsx:467`), "需要立即處理" with red AlertTriangle (`full-screen-task-view.tsx:543` and `report-dashboard.tsx`), "嚴重過期", and "將任務放入日曆可以大幅提高完成率" (`notifications:204`) all read as productivity-trainer voice rather than friend voice.

## Severity scale

- **🚨 Critical**: breaks brand promise or accessibility blocker
- **⚠️ Important**: visible-to-user inconsistency or anti-pattern violation
- **✨ Polish**: subtle improvement, would feel more 陶瓷感

## Findings (grouped by lens)

### V · Desktop visual / brand

> **🚨 Reports dashboard is a pure SaaS KPI grid**
> **File:** `components/reports/report-dashboard.tsx:574-590, 655-690, 825-840, 886-895, 979-983, 1086-1096`
> **Lens:** V
> **Issue:** The entire report panel is built out of `bg-red-500/10 text-red-600`, `bg-blue-500/10 text-blue-600`, `bg-green-500/10 text-green-600`, `bg-purple-500/10 text-purple-600`, `bg-yellow-500/10 text-yellow-600` tiles in a 4-up KPI grid (lines 573-590) and matching status palettes (`979-983`, `1086-1096`). This is exactly the "KPI 滿屏的 dashboard 即視感" that PRODUCT.md anti-references call out, and the colors are the pure Tailwind preset blues/purples/greens that DESIGN.md `重要禁區` explicitly forbids. The chart legend at `424-449` doubles down with `bg-green-500` vs `bg-blue-500` bars.
> **Fix:** Replace every `bg-(red|blue|green|yellow|purple)-(500|600)*` with `bg-urgency-critical/10 text-urgency-critical`, `bg-info/10 text-info`, `bg-success/10 text-success`, `bg-urgency-medium/10 text-foreground`, `bg-chart-4/10 text-chart-4`. The tokens already exist in `globals.css:48-77`. For the 4-up "高優先 / 中優先 / 低優先 / 未設定" tiles, drop the colored backgrounds entirely and use a single horizontal bar broken into 4 segments (urgency colors already convey priority).
> **Effort:** heavy (>30min, but mechanical)

> **🚨 Full-screen task view echoes the same SaaS palette**
> **File:** `components/task-panel/full-screen-task-view.tsx:415-422, 455-467, 470-481, 543, 551-572, 927-937, 1012-1028, 1268`
> **Lens:** V
> **Issue:** The four top-of-page tiles (`今日 / 即將到期 / 已過期 / 連續天數`) at 411-481 use `bg-blue-500/10`, `bg-amber-500/10`, `bg-red-500/10`, and the streak tile at 470 uses `bg-gradient-to-br from-orange-500/10 to-red-500/10` — gradient KPI template that DESIGN.md explicitly bans (`hero-metric template` in Container Rules). The "需要立即處理" section at 541-577 paints the entire list `bg-red-500/5 border-red-500/20` with a red AlertTriangle header, and the overdue summary card later at 1012-1028 repeats the pattern.
> **Fix:** Reuse the existing urgency token system. `今日` → no colored background, just primary accent on the value; `即將到期` → `--urgency-medium`; `已過期` → `--urgency-critical` / `--overdue`. Remove the streak gradient entirely; use a solid `bg-secondary` block with a small `--primary` flame icon. The "需要立即處理" list should drop the wash of red bg and use a soft `bg-overdue/5 border-overdue/15` (which is still in the warm hue range, OKLCH `0.6 0.18 25`).
> **Effort:** heavy

> **🚨 Calendar current-time line is literal `bg-red-500`**
> **File:** `components/calendar/current-time-line.tsx:57, 66`
> **Lens:** V
> **Issue:** The "now" indicator (one of the most visible elements on the calendar) is `bg-red-500`. DESIGN.md `Color Strategy` defines `--current-time: oklch(0.68 0.14 35)` (terracotta) specifically for this purpose. The hard red is also the only saturated cool-shifted red in the whole calendar surface, so it looks pasted-in.
> **Fix:** Replace both `bg-red-500` with `bg-current-time` (already in the theme map at `globals.css:163`) or inline `style={{ backgroundColor: 'var(--current-time)' }}`. Optionally darken the dot slightly with `shadow-[0_0_0_2px_color-mix(in_oklch,var(--current-time)_30%,transparent)]` to keep the visibility punch without the cool red.
> **Effort:** quick (<5min)

> **🚨 Urgency slider maps "High" to pure red**
> **File:** `components/modals/task-detail-modal.tsx:638-642`
> **Lens:** V
> **Issue:** `URGENCY_BUCKETS` hardcodes `bg-red-500 / text-red-700` for level 7-10. PRODUCT.md `Anti-patterns` reads literally "❌ 紅色驚嘆號 / 紅色「逾期」標籤 — 用赤陶飽和度遞增表達 urgency" — this is the exact violation. The 1-3 emerald and 4-6 amber are also non-warm.
> **Fix:** Switch to the warm-tonal `--urgency-low / --urgency-medium / --urgency-high / --urgency-critical` ramp from `globals.css:49-52`. Three buckets become four (1-3 low, 4-5 medium, 6-7 high, 8-10 critical) which also matches what `task-row.tsx` already computes via `colors.accentColor`.
> **Effort:** quick (<15min)

> **⚠️ Task-row left stripe is 3px, not 1px**
> **File:** `components/task-panel/task-row.tsx:223, 343-344`
> **Lens:** V
> **Issue:** Both compact and comfortable rows render `borderLeft: 3px solid ${accentColor}`. DESIGN.md Container Rules: "**絕對禁用**: nested cards, side-stripe accent border > 1px". This same pattern repeats in `report-modal.tsx:287` (`borderLeftWidth: '4px'`).
> **Fix:** Either drop to `borderLeftWidth: 1px`, or replace the stripe with a small filled circle / chip that already carries the workspace color (workspace tag at 281 already conveys it). For the compact row, the urgency dot at 274 plus the chip is enough; the stripe is redundant. Update `report-modal.tsx:287` similarly.
> **Effort:** medium (touches color helpers in task-panel/colors.ts)

> **⚠️ JournalFocusView is three primary-colored KPI tiles**
> **File:** `components/layout/main-layout.tsx:759-772`
> **Lens:** V
> **Issue:** Inline JournalFocusView renders `bg-green-500/10 / bg-orange-500/10 / bg-blue-500/10` for `已完成 / 未完成 / 總任務數`. This is jarring against the muted journal surface and again uses non-warm pure Tailwind colors.
> **Fix:** Replace with three text-only stats separated by `Separator` lines (no backgrounds), or one row: `已完成 N · 未完成 N · 總共 N` in `text-muted-foreground`. The journal is meant to feel like writing, not like reading a CI dashboard.
> **Effort:** quick

> **⚠️ Report-modal overview uses gradient KPI cards**
> **File:** `components/modals/report-modal.tsx:205, 218, 231`
> **Lens:** V
> **Issue:** `bg-gradient-to-br from-primary/10 to-primary/5` × 3 cards. DESIGN.md bans the hero-metric template (`big number + label + gradient`).
> **Fix:** Use solid `bg-secondary/60` or `bg-card` with a 1px `border-border` instead of gradient. The numbers themselves can stay large.
> **Effort:** quick

> **⚠️ Notification center uses cool red/amber/blue priority dots**
> **File:** `components/notifications/notification-center.tsx:223-229, 257`
> **Lens:** V
> **Issue:** `getPriorityColor` returns `text-red-500 bg-red-50`, `text-amber-500 bg-amber-50`, `text-blue-500 bg-blue-50`. The bell badge at 257 is `bg-red-500` / `bg-amber-500`.
> **Fix:** Map to `text-urgency-critical bg-urgency-critical/10`, `text-urgency-high bg-urgency-high/10`, `text-muted-foreground bg-muted` (low priority shouldn't shout). Badge → `bg-urgency-critical` / `bg-urgency-medium`.
> **Effort:** quick

> **⚠️ Empty-state in notification center uses `bg-green-100`**
> **File:** `components/notifications/notification-center.tsx:304-305`
> **Lens:** V
> **Issue:** "一切順利！" empty state circle is `bg-green-100 text-green-600`. Pure Tailwind cool green.
> **Fix:** Use `bg-secondary text-secondary-foreground` (sage green is the brand's "平和狀態" color per DESIGN.md). One-line swap.
> **Effort:** quick

> **⚠️ Settings modal section headers leak cool colors**
> **File:** `components/modals/settings-modal.tsx:1025, 1147, 1276, 1338, 1393`
> **Lens:** V
> **Issue:** Section icons use `text-red-500`, `text-blue-500`, `text-green-500`, `text-indigo-500`, `text-purple-500` for category emphasis. The intent (icon-coded sections) is fine, but pulling them from the Tailwind preset palette breaks the warm system.
> **Fix:** Map to `--chart-1` through `--chart-5` (those are designed for exactly this — categorical accents inside the warm OKLCH space). e.g. `style={{ color: 'var(--chart-2)' }}` for the blue-ish low-chroma `--chart-2`.
> **Effort:** quick

> **⚠️ Calendar header "all-done" sparkle is `text-emerald-500`**
> **File:** `components/calendar/calendar-header.tsx:463, 505`
> **Lens:** V
> **Issue:** When all today's tasks complete, the daily-progress ring colors itself `stroke-emerald-500` and shows a pulsing `text-emerald-500` Sparkles. Emerald (Tailwind hue 160) sits outside the warm palette range (25-155) DESIGN.md prescribes.
> **Fix:** Use `--success: oklch(0.75 0.12 155)` token (already defined at `globals.css:56`). It's a softer sage-green that stays inside the warm-hue boundary. `stroke-[var(--success)]` and `text-[var(--success)]`.
> **Effort:** quick

> **⚠️ Workspace delete button uses pure red wash**
> **File:** `components/modals/workspace-settings-modal.tsx:370-371`
> **Lens:** V
> **Issue:** Delete-confirm state is `border-red-400 bg-red-50 text-red-600`. The destructive action should use `--destructive` token (already defined) or stay in the warm overdue range.
> **Fix:** Replace with `border-destructive/40 bg-destructive/5 text-destructive`. The destructive token in `globals.css:39` is OKLCH `0.62 0.2 25` which is the warm赤陶飽和高 version, still warm.
> **Effort:** quick

> **⚠️ Scratchpad delete buttons use `text-red-500 bg-red-500/10`**
> **File:** `components/scratchpad/focus-scratchpad.tsx:366, 540`
> **Lens:** V
> **Issue:** Same as above, in a place that's right next to a hand-drawn-feeling pull-down sheet. The cool red breaks the surface mood the most here.
> **Fix:** `text-destructive bg-destructive/10` token swap.
> **Effort:** quick

> **⚠️ Filter-bar workspace pills hardcoded `bg-blue-500 / bg-red-500`**
> **File:** `components/task-panel/filter-bar.tsx:163, 168`
> **Lens:** V
> **Issue:** Active state for two filter modes is bg-blue-500 vs bg-red-500.
> **Fix:** Both should use the same `bg-primary text-primary-foreground` active state (the toggle is binary, color isn't distinguishing two things). Or use `--secondary` for the "off" mode and `--primary` for "on".
> **Effort:** quick

> **⚠️ Month-view weekend coloring**
> **File:** `components/calendar/month-view.tsx:215`
> **Lens:** V
> **Issue:** Sunday `text-red-400`, Saturday `text-blue-400`. Cool red + cool blue at the same time, neither in the warm palette.
> **Fix:** Sunday → `text-overdue` (warm赤陶) or just `text-foreground/70`; Saturday → `text-muted-foreground`. Or weekend differentiation via subtle background tint only.
> **Effort:** quick

> **✨ Toast destructive variant retains stock shadcn red**
> **File:** `components/ui/toast.tsx:80`
> **Lens:** V
> **Issue:** `group-[.destructive]:text-red-300 ... ring-red-400 ... ring-offset-red-600` is the un-customized shadcn destructive variant. Toast destructive variant is rarely rendered, but if it ever fires it'll look completely foreign.
> **Fix:** Either remove the destructive variant (Sonner is used elsewhere with `richColors`, this Radix toast is dead-ish code) or rewrite using `--destructive` tokens.
> **Effort:** quick

### C · Copy / non-pushy philosophy

> **🚨 "需要處理" / "需要立即處理" with red AlertTriangle**
> **File:** `components/task-panel/full-screen-task-view.tsx:467, 543; components/reports/report-dashboard.tsx:863`
> **Lens:** C
> **Issue:** PRODUCT.md `Anti-patterns`: ❌ `"You're behind on X tasks"` — use 「還有 X 件可以慢慢做」之類. `需要立即處理` is the Mandarin equivalent of "You're behind!"; pairing it with a red AlertTriangle compounds the urgency-shout.
> **Fix:** Soften to 「過期的可以慢慢補上」 or 「過期任務 (N)」 without the AlertTriangle. The count alone is information; the language shouldn't add anxiety.
> **Effort:** quick

> **🚨 Notification copy reads as productivity trainer**
> **File:** `components/notifications/notification-center.tsx:204`
> **Lens:** C
> **Issue:** "有 ${N} 個任務沒有設定時間。將任務放入日曆可以大幅提高完成率。" — "大幅提高完成率" is direct SaaS-coach voice.
> **Fix:** "${N} 個任務還沒挑時間，想排個時段嗎？" or just "${N} 個任務還沒上日曆"。 Drop the efficacy claim entirely.
> **Effort:** quick

> **⚠️ "嚴重過期" / "輕微過期" labels**
> **File:** `components/reports/report-dashboard.tsx:863, 879`
> **Lens:** C
> **Issue:** "嚴重 / 輕微" is a productivity-app moralizing register. The user knows it's been a while; the app doesn't need to grade them.
> **Fix:** Replace with simple time labels: "超過 7 天" / "3-7 天" / "3 天內"。 Same information, no judgment.
> **Effort:** quick

> **⚠️ "Crush"-flavored streak language**
> **File:** `components/task-panel/full-screen-task-view.tsx:479`
> **Lens:** C
> **Issue:** "繼續保持！" is on the edge of OK, but combined with a flame icon and a streak number it slides toward Duolingo / streak-anxiety territory PRODUCT.md warns against.
> **Fix:** Drop the exclamation: "今天也辛苦了" when streak > 0, "歡迎回來" when streak == 0. Or remove the streak feature entirely from this view (the report tab has stats; the today-glance doesn't need them).
> **Effort:** quick

> **⚠️ "超過一半排程時間都在開會 — 留意專注時段"**
> **File:** `components/reports/report-dashboard.tsx:619-620`
> **Lens:** C
> **Issue:** Em-dash (—) appears in user-facing string (DESIGN.md / project anti-pattern in your audit brief), and the tone is slightly nagging ("留意專注時段").
> **Fix:** "超過一半排程時間都在開會。專注時段也別忘了留一些。" (period instead of em-dash, softer phrasing).
> **Effort:** quick

> **⚠️ Loading copy uses ellipsis with trailing "..."**
> **File:** `app/page.tsx:330`
> **Lens:** C
> **Issue:** "載入中..." with three ASCII dots. The warm-stationery brand reads better with a half-width Chinese ellipsis or no dots at all when paired with the bobbing penguin.
> **Fix:** "載入中" (no dots, the spinner + bobbing penguin already convey "in progress") or "載入中…" (single horizontal-ellipsis char).
> **Effort:** quick

### A · A11y / motion

> **🚨 Only one component honors `prefers-reduced-motion`**
> **File:** entire `components/` tree; only `components/timer/focus-timer-immersive.tsx:141-144` has the media query
> **Lens:** A
> **Issue:** Task-completion sparkle burst (`task-row.tsx:256-269`, `globals.css:400-410`), Waddle mascot bob (`globals.css:413-422`), gentle-pulse current-time-dot (`globals.css:274-281`), check-pop animation (`globals.css:312-326`), confetti in onboarding tour all run unconditionally. PRODUCT.md: "支援 `prefers-reduced-motion`：所有 ease-out-quart 動畫應在 reduced motion 下變成 opacity-only 或 instant".
> **Fix:** Add a global block to `globals.css`:
> ```css
> @media (prefers-reduced-motion: reduce) {
>   *, *::before, *::after {
>     animation-duration: 0.01ms !important;
>     animation-iteration-count: 1 !important;
>     transition-duration: 0.01ms !important;
>   }
>   .animate-waddle-bob, .current-time-dot, .check-animate { animation: none !important; }
> }
> ```
> For the celebration burst in `task-row.tsx`, wrap the sparkle div in a `motion-safe:` Tailwind variant or check `window.matchMedia` once and skip the burst.
> **Effort:** medium

> **🚨 Onboarding spotlight ring is literal indigo**
> **File:** `components/onboarding-tour.tsx:485`
> **Lens:** A + V
> **Issue:** `boxShadow: '0 0 0 9999px rgba(0,0,0,0.65), 0 0 0 2px rgba(99, 102, 241, 0.7), 0 0 32px 4px rgba(99, 102, 241, 0.45)'` — `rgb(99, 102, 241)` is Tailwind indigo-500, the literal color DESIGN.md `重要禁區` calls out by name.
> **Fix:** Replace both indigo rgba calls with `var(--primary)` via JS template (e.g. `getComputedStyle(document.documentElement).getPropertyValue('--primary')`) or simply hardcode the terracotta hex `#d97757` equivalent. The 0.65 black dim is also harsher than DESIGN.md's "暗化 background 至 oklch(0/0.25)" guideline.
> **Effort:** quick

> **🚨 Confetti palette is pure Tailwind preset hex**
> **File:** `components/onboarding-tour.tsx:249`
> **Lens:** A + V
> **Issue:** `CONFETTI_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7']` — indigo, blue, emerald, amber, red, purple. Six confetti colors, four of them violate DESIGN.md's warm-hue boundary.
> **Fix:** Re-pick from the workspace + chart palette: terracotta `#d97757`-ish, sage, dusty rose, lavender, urgency-medium yellow. All warm-hue, all OKLCH-coherent.
> **Effort:** quick

> **🚨 Skip-link in onboarding is `text-white/70` on transparent ground**
> **File:** `components/onboarding-tour.tsx:632`
> **Lens:** A
> **Issue:** "略過導覽" link is rendered at `absolute -bottom-7 left-1/2` with `text-white/70` — but the dim layer at 491 is `bg-black/65`, so the white text lands sometimes on the dim layer and sometimes on whatever's below. When the spotlight rect is being used (the `rect ?` branch at 473-487), there is NO dim layer behind the tooltip area, so the white skip link sits on the page chrome (which is light cream). Contrast becomes invisible.
> **Fix:** Render the skip link with its own backdrop chip: `bg-foreground/80 text-background px-3 py-1 rounded-full` so it stays legible regardless of underlying surface.
> **Effort:** quick

> **⚠️ Task-panel width animates the `width` property**
> **File:** `components/layout/main-layout.tsx:563-566`
> **Lens:** A (motion)
> **Issue:** `className="transition-all duration-300 ease-in-out"` with `style={{ width: \`${panelWidth}px\` }}` — DESIGN.md `Motion` explicitly says "動畫只用於 `transform`、`opacity`、`filter`，**不要** animate `width`、`height`、`top`、`left`." This causes layout thrash on every frame and also uses `ease-in-out` instead of `ease-out-quart`.
> **Fix:** Open/close (binary collapse) should slide via `transform: translateX(-100%)` on a wrapper; the resize-drag inner state can stay as direct width (no transition during drag). Replace `ease-in-out` with `cubic-bezier(0.22, 1, 0.36, 1)` everywhere it appears.
> **Effort:** medium

> **⚠️ `ease-in-out` and `transition-all` are widespread**
> **File:** `components/timer/focus-timer-immersive.tsx:152, 213`; `components/ui/sheet.tsx:61`; many `transition-all duration-300 ease-in-out` callsites
> **Lens:** A
> **Issue:** DESIGN.md mandates `ease-out-quart` / `cubic-bezier(0.22, 1, 0.36, 1)`. The immersive timer's `waddle-breathe` and `waddle-ring-pulse` keyframes use `ease-in-out` (which is fine inside a keyframes loop, where you actually do want symmetric in-out), but the surrounding `transition` declarations on width/opacity throughout the app use `ease-in-out` rather than the brand curve.
> **Fix:** Add `--ease-quart: cubic-bezier(0.22, 1, 0.36, 1)` to `globals.css` and a Tailwind `transitionTimingFunction.quart` so callsites can use `ease-quart` shorthand. Do a controlled find/replace of `ease-in-out` in `.tsx` (skip CSS keyframes).
> **Effort:** medium

> **⚠️ `bg-green-500 animate-pulse` running-state dot in timer**
> **File:** `components/timer/focus-timer.tsx:513`
> **Lens:** A + V
> **Issue:** When timer is running, the status dot pulses green; "已暫停" pulses amber. PRODUCT.md A11y rule: "顏色不是唯一的資訊載體". The status is already described by the adjacent label ("計時中"/"已暫停"), but the dot color itself should still be from the warm palette: green-500 is cool.
> **Fix:** Running → `bg-success` (sage green, in the warm range), paused → `bg-urgency-medium`. Add a subtle inset shadow ring for "running" to provide a non-color signal.
> **Effort:** quick

> **⚠️ Notification bell badge has no aria-live region**
> **File:** `components/notifications/notification-center.tsx:254-261`
> **Lens:** A
> **Issue:** The count badge updates silently when overdue tasks appear. Screen readers don't announce. The bell button itself also has no `aria-label`.
> **Fix:** Add `aria-label={\`通知 (${totalCount})\`}` to the bell button and wrap the badge in `<span role="status" aria-live="polite">`.
> **Effort:** quick

> **⚠️ Timer wraps `animate-pulse` for status hint that doubles after dim**
> **File:** `components/timer/focus-timer.tsx:513, 1052`
> **Lens:** A
> **Issue:** Constant `animate-pulse` on a status dot violates "不催促": pulse is implicitly demanding attention. The immersive view already added a slow `waddle-breathe`; this one is more aggressive.
> **Fix:** Drop `animate-pulse` from the status dot; keep just the color difference. The status text label is already there.
> **Effort:** quick

### M · Mobile UX

> **⚠️ Bottom tab bar tap targets are 60px tall but only ~25% width**
> **File:** `components/layout/main-layout.tsx:467, 491`
> **Lens:** M
> **Issue:** Bottom nav buttons have `min-h-[60px]` and width = column width (1/4 of screen), so total touch zone is fine in width but the visible tap-icon (`w-11 h-7`) is only 28px tall. WCAG and Apple HIG both want ≥44pt; the surrounding button does meet that, so this is OK in practice — but the visual misalignment (small icon in a tall transparent button) makes the bottom inch feel sparse on landscape phones.
> **Fix:** Either pull `min-h-[60px]` down to `min-h-[56px]` (still ≥44 + safe-area), or bump the icon container to `w-12 h-9` to look intentional. Cosmetic.
> **Effort:** polish

> **⚠️ Notification dropdown on mobile is fixed but max-height uses `vh` not `dvh`**
> **File:** `components/notifications/notification-center.tsx:280-301`
> **Lens:** M
> **Issue:** `max-h-[70vh]` / `max-h-[calc(80vh-60px)]` — on iOS Safari, `vh` doesn't account for the dynamic toolbar so the panel can be cut off when the URL bar is visible. The rest of the app already uses `dvh` (e.g. `task-detail-modal.tsx:297` and timer at `498`).
> **Fix:** Replace both `vh` with `dvh`. Trivial.
> **Effort:** quick

> **⚠️ Focus-timer collapsed chip lifts above tab bar via hardcoded `78px`**
> **File:** `components/timer/focus-timer.tsx:490`
> **Lens:** M
> **Issue:** `style={{ bottom: 'calc(78px + env(safe-area-inset-bottom))' }}` — the 78px is the assumed tab bar height. The tab bar is `min-h-[60px]` plus `pt-2 pb-1.5` (~10px) plus the safe-area, so 78 is roughly right but brittle. If the bar height changes, the chip overlaps it.
> **Fix:** Use a CSS custom property `--mobile-tabbar-h: 76px` set on `:root` and reference it in both places, or measure with `ResizeObserver`.
> **Effort:** medium

> **⚠️ Onboarding tooltip on mobile can hit small viewport edges**
> **File:** `components/onboarding-tour.tsx:511`
> **Lens:** M
> **Issue:** `width: TOOLTIP_WIDTH` is presumably a fixed number; if the spotlight target is near the right edge or in landscape, the tooltip can overflow. The positioning logic (not shown) needs `max-w-[calc(100vw-1.5rem)]` as a safety net.
> **Fix:** Add `maxWidth: 'calc(100vw - 24px)'` to the inline style and let the positioning algorithm clamp.
> **Effort:** quick

> **✨ Calendar export modal backdrop opacity uses `bg-black/50`**
> **File:** `components/calendar/calendar-export-modal.tsx:217`
> **Lens:** M + V
> **Issue:** DESIGN.md sets the standard at "暗化 background 至 oklch(0/0.25)". The modals across the app are inconsistent: 0.65 (onboarding), 0.60 (settings, task-detail), 0.50 (export), 0.40 (timer), 0.20 (scratchpad), 0.25 prescribed.
> **Fix:** Standardize on `bg-foreground/25` (which uses warm-charcoal foreground rather than pure black) across all modal backdrops.
> **Effort:** medium (sweep)

## Cross-cutting themes

**1. The "secondary surfaces" reveal that the design system was retro-fitted, not adopted.** The chrome users see most (task-row, calendar timeline, scratchpad pull-down, mobile tab bar, focus-timer-immersive) is correctly built on OKLCH tokens. The deep but rarely-visited surfaces (reports, full-screen task view, journal, settings sections, notification center) are built out of Tailwind preset colors — `bg-red-500/10`, `bg-blue-500/10`, etc. These look like they were written first, before the warm palette was finalized, and never migrated. A token-only-lint rule (`eslint-plugin-no-restricted-syntax` denying `bg-red-, bg-blue-, bg-green-, bg-yellow-, bg-purple-, bg-indigo-` classes) would prevent regressions and surface the existing debt as a finite worklist.

**2. The motion system is documented but not enforced.** Only `focus-timer-immersive.tsx` honors `prefers-reduced-motion`, only that same file uses `cubic-bezier(0.22, 1, 0.36, 1)` consistently in inline styles. Elsewhere, `transition-all duration-300 ease-in-out` is the de-facto default. A reduced-motion global block in `globals.css` plus a Tailwind `ease-quart` token would let the team standardize without thinking. The `width` animation on the left panel collapse is the only true performance offender; everything else is brand-consistency rather than jank.

**3. Onboarding is the single most off-brand surface.** It's the user's first impression, and it leaks indigo `#6366f1` in the spotlight ring, pure Tailwind hex confetti, white-on-anything skip link, and uses `bg-black/65` rather than the warm dim. Given that PRODUCT.md is explicit about anti-references to Linear/Asana/Jira, having the welcome experience colored like Linear is a notable miss. This is a contained file and a quick, high-leverage fix.

**4. Urgency / overdue / "destructive" semantics are inconsistent across files.** The warm palette already defines `--urgency-low/medium/high/critical`, `--overdue`, `--destructive`. But individual components each invented their own bucket maps: full-screen-task-view uses red-500/orange-500/amber-500, task-detail-modal uses red-500/amber-500/emerald-500, notification-center uses red-500/amber-500/blue-500, report-dashboard uses red-500/yellow-500/blue-500. None reuse the tokens. A single `lib/urgency-colors.ts` exporting `urgencyTone(level) => { bg, text, border }` reading from CSS vars would unify all of them in one place.

**5. Copy voice is mostly correct, but the productivity-trainer leaks in around "overdue".** Most of the app speaks in the gentle voice the brand promises ("辛苦了"、"慢慢搖擺，喝口水吧" in the timer completion screen are perfect). But around overdue and notifications, the voice slips into Asana-mode ("需要立即處理", "嚴重過期", "大幅提高完成率", "繼續保持！"). The fix is small per string but happens in 4-5 files; a single audit pass on the copy strings would be cheap.

## Recommended phase 3 batches

**Batch 1: Warm-tone the report and full-screen views (~2 hours)**
- `report-dashboard.tsx`: sweep all `bg-(red|blue|green|yellow|purple)-(500|600)` → urgency/info/success/chart tokens.
- `full-screen-task-view.tsx`: rewrite the 4-up KPI grid, the "需要立即處理" section, the streak gradient card.
- `main-layout.tsx` JournalFocusView: kill the 3-tile colored grid.
- DoD: zero `bg-(red|blue|green|yellow|purple)-` matches in these three files. Visual smoke-check both panels render cleanly.

**Batch 2: Tokens-not-hardcoded sweep across the smaller files (~1 hour)**
- `current-time-line.tsx`: `bg-red-500` → `bg-current-time`.
- `task-detail-modal.tsx` URGENCY_BUCKETS: red/amber/emerald → urgency tokens, 4 buckets.
- `notification-center.tsx`: priority colors + bell badge + empty-state green-100 → tokens.
- `calendar-header.tsx`: emerald sparkle → `--success`.
- `month-view.tsx`: weekend text colors → foreground/muted.
- `workspace-settings-modal.tsx` + `focus-scratchpad.tsx`: destructive red → `--destructive`.
- `filter-bar.tsx`: blue/red pill → primary/secondary.
- `settings-modal.tsx`: section icon colors → `--chart-1..5`.
- `focus-timer.tsx`: status dot green-500 → `--success`, remove `animate-pulse`.
- DoD: grep for `red-500|blue-500|green-500|emerald-500|amber-500|orange-500|purple-500|indigo-500|yellow-500|red-400|blue-400` returns < 10 matches across the codebase, all of which are intentional `--destructive` shadcn primitives.

**Batch 3: Onboarding rebrand (~45 min)**
- `onboarding-tour.tsx`: spotlight ring rgba → `var(--primary)` extraction; dim layer to `bg-foreground/25`; confetti palette → warm hex; skip link gets a backdrop chip; ensure tooltip has `maxWidth: calc(100vw - 24px)`.
- DoD: visit `/` with localStorage cleared; tour shows terracotta spotlight + warm confetti; works on iPhone SE viewport.

**Batch 4: Motion + a11y baseline (~1 hour)**
- `globals.css`: add reduced-motion global block + `--ease-quart` variable.
- `tailwind.config.ts` / `@theme inline`: register `transitionTimingFunction.quart`.
- `main-layout.tsx`: replace the panel-width transition with a transform-translateX collapse.
- Sweep `ease-in-out` → `ease-quart` in component class strings (skip CSS @keyframes).
- `notification-center.tsx`: add bell `aria-label` + badge `aria-live`.
- DoD: with macOS Reduce Motion on, no animations run except instant fades; lighthouse a11y on `/` ≥ 95.

**Batch 5: Copy pass + small consistency (~30 min)**
- Soften "需要立即處理" / "需要處理" / "嚴重過期" / "輕微過期" / "大幅提高完成率" / "繼續保持！" / "超過一半排程時間 — 留意專注時段" (em-dash).
- Standardize modal backdrops to `bg-foreground/25`.
- Replace fixed `78px` in timer chip with `--mobile-tabbar-h`.
- Replace task-row `border-left: 3px` with 1px + chip (or just chip).
- Replace report-modal `borderLeftWidth: 4px` with 1px.
- DoD: full-text search for the offending phrases returns zero hits; no `border-l-[34]` or `borderLeftWidth` > 1 remains.
