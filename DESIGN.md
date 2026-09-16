# Design

從 [app/globals.css](app/globals.css) 與目前實裝萃取。所有顏色為 OKLCH。

## Theme

**雙模式，淺色為主**。淺色是 warm cream paper（陶瓷釉色背景），dark 是 warm charcoal（不是 pure black，也帶 chroma 0.015）。沒有 pure `#fff` 或 `#000`——所有中性色都偏 warm hue 85（暖米）或 55（暖灰褐）。

物理場景：一個人在桌邊、桌燈或自然光下，打開筆電寫今天的計畫；不是會議室、不是辦公室、不是凌晨的 SRE 螢幕。所以淺色是預設。

## Color Strategy

**Restrained + 多功能 accent**：以暖米中性色佔 75-85% 表面，搭配 4 個工作色（赤陶、鼠尾草、玫瑰粉、低彩度藍）以角色分配。每個 workspace 有自己的色票，但任何單一畫面中色彩出現次數受控（≤ 30% 表面有飽和色）。

**可執行來源**：色票的程式碼真身在 `lib/palette.ts`（workspace 色、選擇器預設、urgency 五階、舊色遷移對照表）——新增顏色一律從這裡出，不要散寫 hex。資料驅動的顏色（workspace／任務／時段）在深色模式下經 `toDarkDisplayColor()`（OKLCH 降亮度、壓彩度）自動調校，渲染端統一走 `useDisplayColor()`。

### Core Palette

| Role | Light Mode | Dark Mode | 用途 |
|---|---|---|---|
| Background | `oklch(0.975 0.008 85)` — warm cream paper | `oklch(0.18 0.015 55)` — warm charcoal | 主背景 |
| Foreground | `oklch(0.28 0.025 55)` — soft charcoal | `oklch(0.94 0.008 85)` — warm white | 主文字 |
| Card | `oklch(0.995 0.003 85)` — paper white | `oklch(0.22 0.018 55)` | 卡片表面 |
| Panel | `oklch(0.985 0.006 85)` | `oklch(0.2 0.016 55)` | 三欄面板背景 |
| Border | `oklch(0.9 0.015 85)` — soft warm line | `oklch(0.32 0.015 55)` | 邊界線 |

### Brand & Accent

| Role | Light Mode | Personality |
|---|---|---|
| Primary | `oklch(0.68 0.14 35)` — warm terracotta / 赤陶 | 主要 CTA、ring、now-line、Workspace 1 |
| Secondary | `oklch(0.92 0.03 145)` — sage green / 鼠尾草綠 | 次要按鈕、平和狀態 |
| Accent | `oklch(0.88 0.06 15)` — dusty rose / 玫瑰粉 | 強調、hover、selection |

### Functional

| Role | Value | 用途 |
|---|---|---|
| Urgency Low | `oklch(0.78 0.1 155)` | 綠 — 不急 |
| Urgency Medium | `oklch(0.8 0.12 95)` | 黃綠 — 一般 |
| Urgency High | `oklch(0.75 0.14 55)` | 橘 — 重要 |
| Urgency Critical | `oklch(0.68 0.16 25)` | 偏赤陶 — 緊急（不要紅色驚嘆） |
| Overdue | `oklch(0.6 0.18 25)` | 比 critical 略深，但仍在赤陶色域 |

**重要禁區**：不要在這套色系裡混進純藍（#3b82f6）、純紫（#a855f7）、純綠（#22c55e）、純紅（#ef4444）等 Tailwind 預設色。所有顏色必須留在 warm hue 範圍（25-155，避開 200-300 的冷藍紫）。

### Workspace Color Set

| | Hue | 用途 |
|---|---|---|
| Workspace 1 | `oklch(0.68 0.14 35)` — terracotta | 預設第一個 workspace |
| Workspace 2 | `oklch(0.65 0.12 230)` — 低彩度藍 | 唯一允許的冷色 |
| Workspace 3 | `oklch(0.7 0.12 155)` — sage | |
| Workspace 4 | `oklch(0.72 0.1 300)` — dusty lavender | |

## Typography

- **Sans**: `Noto Sans TC`, `Geist`, system-ui — 中文優先，配上 Geist 拉丁字體做混排。Noto Sans TC 帶有圓潤的襯線收尾，符合「溫柔陶瓷感」。
- **Mono**: `Geist Mono`, `JetBrains Mono` — 計時器、數字 KPI。
- **Scale**: 至少 1.25 倍級比；標題字重 600，body 400-500。
- **Line length**: body 段落 65-75ch 上限。
- **禁用**：gradient text、過粗 ExtraBold (≥800) 用於 body、襯線英文字（會與整體無襯線基調衝突）。

## Layout & Spacing

- **三欄式桌面**：左 task panel / 中 calendar / 右 reports。可摺疊。
- **手機**：底欄 tab + bottom sheet（vaul）。桌面的 right drawer 在手機變 bottom sheet（≥ 90vh 高度）。
- **Radius**: `--radius: 0.75rem`，整體基調偏圓但不過分；`xl` 用於 modal / sheet，`sm` 用於 chip / tag。
- **Density**: 任務面板支援 comfortable / compact 切換，但預設 comfortable（呼應「不負擔」）。
- **Spacing rhythm**: 避免每個容器都 `p-4`；用 2 / 3 / 4 / 6 / 8 的混合製造節奏。

### Container Rules

- 卡片只在「真的是獨立物件」時才用（任務卡、會議卡）。Sidebar 區塊、報告區塊用區域留白和細邊界，不套卡片。
- **絕對禁用**：nested cards、side-stripe accent border > 1px、glassmorphism 預設、hero-metric template（big number + label + gradient）、相同尺寸的 icon-heading-text 卡片 grid。

## Elevation & Surface

- 沒有重 shadow。淺色模式用極淺 shadow + warm border 表現層次（`shadow-sm` 居多）。
- Sheet / modal 用 backdrop blur 6-8px + 暗化 background 至 oklch(0/0.25)，避免重黑遮罩。
- Dark mode 用「往上提一階明度」表達 elevation（card 比 background 亮 ~4%），而不是 shadow。
- Auth 卡片等「陶瓷物件」用 `--shadow-ceramic`（雙層暖炭極淺陰影，globals.css）表現手感，不要疊到一般卡片上。

## Motion

- **Easing**：預設 `ease-out-quart` 或 `cubic-bezier(0.22, 1, 0.36, 1)`（ease-out-expo）。**禁止** spring / bounce / elastic — 違反「不催促」原則。
- **Duration**：UI 反饋 150-200ms，過場 300-400ms，emphasis 600ms 上限。
- **`prefers-reduced-motion`**：必須降級為 opacity-only 或 instant。
- 動畫只用於 `transform`、`opacity`、`filter`，**不要** animate `width`、`height`、`top`、`left`。
- 手機手勢（swipe / drag bottom sheet）的 release 動畫用 vaul 預設曲線（已內建）。

## Components (現有實裝)

### 下方自由畫布就地編輯（2026-09-16）

- `components/scratchpad/scratchpad-canvas.tsx` 的「文字／待辦／連結」工具直接在畫布建立本機草稿並聚焦輸入；非畫筆模式下，按兩下空白處會在該畫布座標開始文字草稿。空白新草稿離開時不建立紀錄。
- 既有文字與待辦可按兩下內容，或聚焦內容後按 Enter／空白鍵編輯；文字、待辦與連結也保留編輯按鈕。離開整個編輯區或按 Cmd／Ctrl + Enter 儲存，Escape／取消放棄本次修改；中文輸入法組字期間不觸發儲存或取消，組字結束後若焦點已離開才儲存。
- 文字物件平常採透明背景，未選取時邊框透明；選取或編輯時以既有 primary 邊框標示，操作列於選取或鍵盤聚焦時顯示。編輯中的物件使用不透明的既有背景色並置於選取物件上方，避免其他內容透出；新待辦與連結草稿沿用 card 表面。輸入文字為 16px，操作目標至少 44px。
- 開始編輯時視野切回 100%，透過平移讓編輯區出現在可視範圍；暫時調整編輯區顯示尺寸以容納欄位並配合畫布範圍，不改寫既有物件的位置或大小。更新沿用原紀錄 ID；上方卡片區維持原有呈現，配色沿用現有暖色主題。

### 分類進度看板（2026-09-09）

- 每個分類採同等層級的標題，呈現「目前狀態」、「備註」與任務列。2026-09-14 依使用者調整為緊湊版：預設顯示 4 筆任務，其餘可展開；全域提供全部展開／全部收起，收起時保留分類、狀態與備註。任務列可換行、保留至少 44px 觸控高度，不再重複顯示每筆待辦標籤。
- 點目前狀態或備註即可就地編輯對應欄位，分別儲存且保留取消與 Escape 操作。引用狀態仍保留原任務 ID，另提供開啟原任務入口。
- 桌面與手機共用 `components/task-panel/focus-board.tsx`；手機由 `focus-board-mobile.tsx` 提供返回與捲動容器。主要操作、排序選單及任務列觸控目標至少 44px。手機輸入欄至少 16px；全螢幕編輯版面保留上下安全區，儲存列固定在捲動內容外；看板捲動區下方保留浮動計時器空間。
- 分類卡片按使用者手動順序排列；各分類可獨立選擇任務欄順序、到期日、急迫程度或最新建立，並切換顯示已完成任務。排序與顯示控制留在所屬分類內。
- 狀態可輸入文字或引用該分類任務，備註獨立呈現；沿用暖色表面、低陰影與現有字級，不以警示色或大型指標製造壓力。

| Component | 庫 | 用途備註 |
|---|---|---|
| Dialog / Drawer | Radix Primitives（桌面）/ vaul（手機 bottom sheet） | 手機 sheet 一律從底部上滑 |
| Form / Input | shadcn/ui | 圓角 + warm border |
| Toast | sonner | 右下角，不要中央 |
| Chart | recharts | 顏色限定使用 `--chart-1` 到 `--chart-5` |
| Image Export | html-to-image | 行程 PNG，含 Huddle 浮水印 |
| ModalShell | 自製（components/modals/modal-shell.tsx） | 共用殼：`center`（預設）與 `drawer`（桌面右緣 520px 全高）兩型；Esc／遮罩／焦點歸位／scroll-lock 內建，z-index 用 `--z-index-*` token |
| Command Palette | cmdk + ModalShell | ⌘K 召喚；搜任務、切視圖、快速動作；桌面鍵盤入口 |
| Date/Time Field | 自製（components/ui/date-time-field.tsx） | 桌面 popover 月曆＋15 分時間下拉、中文顯示格式；手機保留原生 input（iOS 滾輪較佳） |

## Iconography

- Lucide React 為基準（已含於 shadcn）。
- 線條 1.5-2px，圓角 cap。
- **企鵝吉祥物 Huddle** 是手繪風格，出現在 onboarding、empty state、PNG 匯出浮水印；不要在功能性 icon 位置使用吉祥物。

## Anti-patterns Specific to Huddle

- ❌ 紅色驚嘆號 / 紅色「逾期」標籤 — 用赤陶飽和度遞增表達 urgency
- ❌ "You're behind on X tasks" 的 UX 文案 — 用「還有 X 件可以慢慢做」之類
- ❌ Streak 斷掉的焦慮提示 — 不要做 streak 紅 X，做 streak 圖也要溫柔
- ❌ 中央 modal 用於非必要決策 — 優先 inline / right drawer / bottom sheet
- ❌ 純色 `#ffffff` / `#000000` — 一律用 OKLCH warm 中性
