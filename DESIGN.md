---
name: Huddle — bold public poster and paper workspace
description: Public marketing uses the bold yellow desk poster; the signed-in workspace uses the paper light theme (A 輕版, 2026-09-26).
colors:
  marketing-paper: "#f6f3e9"
  marketing-ink: "#292b24"
  marketing-yellow: "#edc747"
  marketing-orange: "#cf5731"
  marketing-hover: "#474a3d"
  film-paper: "#f3df7d"
  film-ink: "#25231e"
typography:
  marketing-display-zh:
    fontFamily: "Noto Sans TC, sans-serif"
    fontSize: "clamp(36px, 5.9vw, 86px)"
    fontWeight: 900
    lineHeight: 1.16
    letterSpacing: "-0.04em"
  marketing-display-en:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(54px, 7.4vw, 106px)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.015em"
rounded:
  marketing-control: "4px"
  marketing-capture: "10px"
  film-screen: "12px"
components:
  marketing-button-primary:
    backgroundColor: "{colors.marketing-ink}"
    textColor: "{colors.marketing-paper}"
    rounded: "{rounded.marketing-control}"
    padding: "12px 23px"
  marketing-button-primary-hover:
    backgroundColor: "{colors.marketing-hover}"
---

# Design

## Overview

**Creative North Star: "把日常工作印成一張有手感的桌邊海報"**

公開官網以暖黃紙面、厚重墨字、手繪桌邊物件與真實產品截圖，表現一個人整理一天的節奏。這是使用者已選定的獨立展覽海報世界；最終視覺依據為 `.impeccable/mocks/user-approved-poster.png`，direction contract 位於 `app/layout.tsx` 的首個 body template（seed `58f78b58`）。

**The Scope Rule（2026-09-26 修訂）.** 黃色海報（粗墨字、大圖）只適用公開 marketing 與影片展示。登入後 app 與 auth 頁改用「App 內紙本輕版」（見下節），由 `<html data-art="paper">` 預設啟用、`app/art-theme.css` 覆寫語意 token；官網以 `data-surface="marketing"` 退出紙紋。兩套互不混用：官網不套紙本 token，app 不用海報字重（900）與黃色大色面。`app/globals.css` 的陶瓷色票保留為 fallback 與資料色（`lib/palette.ts`）來源。

**Key Characteristics:**
- 公開官網：黃色海報、粗墨字、真實產品證據。
- 工作介面：暖米陶瓷、低壓力、舒適密度。
- 插畫承接情緒，功能與可用性由產品畫面和文字說明。

### App 內紙本輕版（2026-09-26 起預設）

老闆看過 A／B 樣張後選 A 輕版，取代陶瓷米白外觀；B（手繪框線）已移除。

- **色票（淺色）**：紙 `#f6f3e9`、卡片 `#fbf9f2`、面板 `#f3efe2`、墨 `#292b24`、主色赤陶 `#b8482a`（按鈕字 4.7:1 AA；品牌 `#cf5731` 只給 ring／現在時間線）、芥末 `#edc747` 作今日淡底與 chart、邊線 `#e0d8c0`、次要字 `#66645a`。
- **色票（深色，桌燈下的墨色桌面）**：底 `#22231e`、卡片 `#2b2c26`、字 `#f3eedd`、主色芥末 `#edc747`（墨上 8.7:1）、次要字 `#b9b3a0`。
- **紙紋**：單一固定層 `body::after`，`/art/paper-texture.jpg` 520px 平鋪，淺色 multiply 0.4、深色 soft-light 0.18；不加在個別元件上（效能）。
- **插畫用法**：手繪企鵝只用於空狀態、登入場景、官網；不進功能 icon 位置。淺色以 `.art-illus` multiply＋放射遮罩融進紙面；深色變成小張貼紙（圓角＋陰影、亮度 0.92）。企鵝要小小隻、圓圓矮矮，場景大企鵝小。素材在 `public/art/`。
- **仍保留**：版面、圓角 `--radius`、動畫曲線、禁區（不用紅驚嘆、不催促）全部照舊。

### App：既有主題（fallback）
**雙模式，淺色為主**。淺色是 warm cream paper（陶瓷釉色背景），dark 是 warm charcoal（不是 pure black，也帶 chroma 0.015）。沒有 pure `#fff` 或 `#000`——所有中性色都偏 warm hue 85（暖米）或 55（暖灰褐）。

物理場景：一個人在桌邊、桌燈或自然光下，打開筆電寫今天的計畫；不是會議室、不是辦公室、不是凌晨的 SRE 螢幕。所以淺色是預設。

## Colors

### Public marketing

Primary：暖黃用於主海報；墨色用於標題與實心 CTA。Secondary：橘色只作品牌句點與清晰焦點提示。Neutral：奶油紙面承接長文與章節。影片區使用自己的淡黃紙面與深墨色，並未與主頁色值合併。

**The Surface Rule.** 大色面負責章節節奏，產品截圖保留 app 原本的陶瓷色票；不要把截圖染成海報配色。

### App：既有配色（保留）
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

### Public marketing

中文海報標題使用 Noto Sans TC 900；英文使用 Barlow Condensed 800，hero 大寫且較緊密。Hero 傾斜（rotate -1.4deg、skew -2deg）是印刷海報語氣，段落仍使用全站 sans。正文多為 14–15px、1.8–1.95 行高；章節中文標題為 34–56px，英文為 42–67px。影片標題沿用正文 sans，28–52px、1.15 行高、650 字重設定。

**The Language Rule.** 中英文各自調整字級、行高與換行，不把英文斷行原封套給中文；繁中 hero 在逗號後保留換行機會。

### App：既有字體（保留）
- **Sans**: `Noto Sans TC`, `Geist`, system-ui — 中文優先，配上 Geist 拉丁字體做混排。Noto Sans TC 帶有圓潤的襯線收尾，符合「溫柔陶瓷感」。
- **Mono**: `Geist Mono`, `JetBrains Mono` — 計時器、數字 KPI。
- **Scale**: 至少 1.25 倍級比；標題字重 600，body 400-500。
- **Line length**: body 段落 65-75ch 上限。
- **禁用**：gradient text、過粗 ExtraBold (≥800) 用於 body、襯線英文字（會與整體無襯線基調衝突）。

## Layout

### Public marketing

頁首最大寬度 1440px；正文段落以 1220–1320px 容器和約 5–6% 邊距排列。Hero 中央真實日曆截圖放進深色螢幕框，桌燈與植物屬背景插畫。白板段落採不對稱雙欄，價格採兩個平面欄位；不以重複卡片承載所有章節。

760px 以下導覽換到第二列，白板、下載和 FAQ 改單欄；390px 以下價格與專注段落也改單欄。1000px 以下收斂間距，1500px 以上 hero 加高。影片另在 640px 以下將標題與說明垂直排列。這些是實裝 breakpoint，不是 app 全域斷點。

### App：既有版面（保留）
- **三欄式桌面**：左 task panel / 中 calendar / 右 reports。可摺疊。
- **手機**：底欄 tab + bottom sheet（vaul）。桌面的 right drawer 在手機變 bottom sheet（≥ 90vh 高度）。
- **Radius**: `--radius: 0.75rem`，整體基調偏圓但不過分；`xl` 用於 modal / sheet，`sm` 用於 chip / tag。
- **Density**: 任務面板支援 comfortable / compact 切換，但預設 comfortable（呼應「不負擔」）。
- **Spacing rhythm**: 避免每個容器都 `p-4`；用 2 / 3 / 4 / 6 / 8 的混合製造節奏。

### Container Rules

- 卡片只在「真的是獨立物件」時才用（任務卡、會議卡）。Sidebar 區塊、報告區塊用區域留白和細邊界，不套卡片。
- **絕對禁用**：nested cards、side-stripe accent border > 1px、glassmorphism 預設、hero-metric template（big number + label + gradient）、相同尺寸的 icon-heading-text 卡片 grid。

## Elevation & Depth

### Public marketing

紙面章節平坦，以空白和細分隔線區分。陰影僅用於螢幕與產品截圖：hero 螢幕為 `0 12px 30px -18px #292b2480`，白板截圖為 `0 17px 40px -24px #292b2455`，影片為 `0 14px 36px -24px #25231e`。

### App：既有表面（保留）
- 沒有重 shadow。淺色模式用極淺 shadow + warm border 表現層次（`shadow-sm` 居多）。
- Sheet / modal 用 backdrop blur 6-8px + 暗化 background 至 oklch(0/0.25)，避免重黑遮罩。
- Dark mode 用「往上提一階明度」表達 elevation（card 比 background 亮 ~4%），而不是 shadow。
- Auth 卡片等「陶瓷物件」用 `--shadow-ceramic`（雙層暖炭極淺陰影，globals.css）表現手感，不要疊到一般卡片上。

## Shapes

公開官網控制元件採小圓角；白板截圖與影片螢幕使用較柔和的圓角。Hero 螢幕上緣為 24px、深色框 9px，手機降為 15px、6px。價格是帶頂線的平面欄位，FAQ 是可展開的水平列。

App 繼續使用既有 `--radius: 0.75rem` 與陶瓷表面規則，不能將海報控制元件的小圓角套入工作面板。

## Components

### 官網大膽版（2026-09-26）

老闆要「原本的黃色海報官網，但更大膽」。原則：

- **首屏是一句名言**：`lib/brand.ts` 的 `BRAND_QUOTE` 是全站標語唯一來源（名言＋作者；作者空白就不顯示署名）。首屏 Noto Sans TC 900、桌機約 86–104px，只在標點後斷行；橘色大引號「“」當名言記號；署名用 Barlow Condensed 800 大寫＋橘色短線。
- **場景大、企鵝小**：首屏背景是 `hero-desk-v2.webp`（左留白給字、右側桌邊場景），手機換 `hero-mobile.webp`，圖頂端以遮罩融進 `#eecb71` 黃底。
- **黑黃強對比**：首屏下緊接墨色板（`proof`），黃色 900 大標＋整寬真實產品截圖；下載區同為墨色板。
- **每個功能區都配大圖**：三大重點改成左右交錯的大章節（圖佔 55%，編號 Barlow 橘色大字）；其他功能以黃色海報框直式插畫＋168px 小插畫列；方案與下載配寬幅分鏡（手機換直式）。分鏡素材在 `public/art/film/`。
- **字級**：內文 18–24px（手機 16–17），章節標題 42–84px，價格 88–132px；標題 `word-break: keep-all` 只在標點斷。
- **效能**：插畫一律 WebP、預先縮好（next.config 關閉最佳化），首屏圖 `fetchPriority=high`，其餘 lazy。2026-09-26 實測：1440 首次載入圖片約 517KB、捲到底約 893KB。

### Public marketing：既有實裝

- 導覽：奶油紙面，44px 導覽連結，hover 底線；手機登入控制目前為 40px 高，其餘 CTA 44–48px。這是目前實裝記錄，44px 仍為產品觸控目標基準。
- CTA：墨底紙色文字，小圓角，hover 改稍淺墨色；可見鍵盤焦點使用 3px 橘色 outline、5px offset。
- 白板切換：兩個真實產品截圖，共用 tabpanel；選取狀態為墨底紙字，支援左右方向鍵。
- FAQ：原生 details/summary，展開箭頭旋轉；不依賴動態高度動畫。
- 影片：16:9 原生 video，點擊播放、預設靜音，不自動播放；提供重播、音訊切換、下載、繁中／英文字幕與文字摘要。插畫魔法轉場明確註記不是拍照辨識。
- Motion：海報傾斜屬靜態造型。官網 `prefers-reduced-motion` 關閉 transition／animation，影片由使用者主動播放。

### App：既有動畫（保留）
- **Easing**：預設 `ease-out-quart` 或 `cubic-bezier(0.22, 1, 0.36, 1)`（ease-out-expo）。**禁止** spring / bounce / elastic — 違反「不催促」原則。
- **Duration**：UI 反饋 150-200ms，過場 300-400ms，emphasis 600ms 上限。
- **`prefers-reduced-motion`**：必須降級為 opacity-only 或 instant。
- 動畫只用於 `transform`、`opacity`、`filter`，**不要** animate `width`、`height`、`top`、`left`。
- 手機手勢（swipe / drag bottom sheet）的 release 動畫用 vaul 預設曲線（已內建）。

### App：既有元件（保留）

### 白板與內容編輯（2026-09-16）

- 白板作為主要操作區，移除上方快速卡片輸入列與網格。原快速卡片直接以原 ID 呈現在白板，初次顯示只計算位置、不寫入或複製資料；歷史日期維持唯讀。
- 「文字／待辦／連結」工具直接在白板建立聚焦的本機草稿；按兩下空白處可在該座標寫字。純文字可就地修改，離開編輯區或 Cmd／Ctrl + Enter 儲存，Escape／取消放棄；空白新草稿不寫入，保護中文組字。
- 「開啟內容」進入下一層，沿用記事本的 NoteEditor：標題、圖示、文字格式、清單、checklist、收合區塊與圖片。富文字物件的雙擊也開啟內容，避免純文字編輯覆蓋格式。返回白板會提交尚未儲存的修改，白板呈現摘要與清單完成數。
- 「檢查清單」直接建立含 taskList 的物件並開啟內容。文件儲存在原物件的 metadata.document，保留畫布位置、既有欄位與 image/link 原網址；不另建記事本記錄。
- 沿用暖色主題，純文字平常不顯示卡片底色。原地編輯時切回 100%、平移至可視範圍，以不透明表面承接文字；只暫時調整編輯區尺寸，不改寫既有位置或大小。深層編輯桌面為聚焦面板、手機滿版，使用記事本既有格式工具。

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

### App：既有圖示（保留）

- Lucide React 為基準（已含於 shadcn）。
- 線條 1.5-2px，圓角 cap。
- **企鵝吉祥物 Huddle** 是手繪風格，出現在 onboarding、empty state、PNG 匯出浮水印；不要在功能性 icon 位置使用吉祥物。

### 手機小工具預覽（2026-09-25）

此為既有 warm ceramic 工作介面的延伸，範圍限 `/widgets/`；不改寫上方公開官網海報或 App 設計系統。依使用者指定構圖呈現「Huddle・把今天放在手邊」，讓月曆、隨手記與專注形成三個有明確層級的群組，保持溫柔、不催促的語氣。

- **品牌與色彩**：角色只能直接使用 `public/huddle-mascot.png` 原圖，原生資產副本也必須保持相同內容；示意圖的重繪角色不得替代正式素材。此表面採奶油紙面 `#f8f6ef`、卡片 `#fffdf7`、赤陶動作與鼠尾草標題帶 `#969d88`；局部覆寫既有語意 token，不套入 marketing 黃色海報風格。實裝來源為 `components/widgets/widgets.module.css`、`widget-gallery.tsx` 與 `widget-card.tsx`。
- **11 款與首屏構圖**：桌面第一欄為「月曆與今日任務」overview；第二欄為「隨手記・三個入口」，依序放 shortcuts、whiteboard、notebook；第三欄為「專注記事與任務」，依序放 focus-note、tasks。三群組都有鼠尾草標題帶。其餘五款——可視化小月曆、近期行程、今天三件事、專注計時、喝水提醒——放在下方「更多陪你安排日常的小工具」。種類篩選後呈現單一類型。
- **響應式網頁**：容器最大 1500px；上方三欄比例為 `1.04fr 1.04fr 1fr`、欄距 14px，741–1100px 縮小內距，740px 以下改單欄、群組間距 22px。群組圓角 26px，內部小工具圓角 21px，以極淺暖炭陰影呈現紙面層次。下方小工具 grid 在 1000px 以下改兩欄、740px 以下單欄。頁首標題 28–49px，手機 29px。尺寸選擇調整列數與部分內容密度；群組內卡片維持滿寬，並非三種原生尺寸的精確模型。
- **紙面內容**：白板優先顯示摘要縮圖；沒有縮圖時，把文字摘要呈現為淡黃、淡綠、淡桃色便條紙，帶少量靜態傾斜。這是摘要，不是完整畫布的像素還原。專注記事包含主題／狀態列、奶油色記事紙面與原版 Huddle 角色，以及「記一筆」「查看本次記事」兩個清楚入口。
- **互動與狀態**：示範資料與登入後資料有明確提示；白板與記事編輯沿用既有編輯器。鍵盤焦點使用 ring outline，完成狀態同時使用勾選與刪除線。一般卡片控制項以 44px 為基礎；目前工具列 40px、已完成勾選鈕 26px、小尺寸月曆日期格 32px，仍需依產品 44px 觸控基準改善，不能視為已完成無障礙驗收。
- **交付邊界**：這是響應式互動預覽與設定入口，不能當作已完成手機主畫面交付。WidgetKit／Android 原生程式仍需完整建置、簽署、安裝與實機驗證；iOS 平台元件與簽署、Android SDK 授權／建置，以及同步、隱私、通知與不同尺寸驗收的目前狀態，以 [手機小工具實作與限制](docs/native/mobile-widgets.md) 為準。原生更新受系統排程與快照限制，完整文字／白板編輯需開啟 App；不得以網頁截圖宣稱原生行為已通過。

## Do's and Don'ts

### Public marketing

- **Do** 使用真實產品截圖與明示的示範資料，保留清楚可辨識的產品介面。
- **Do** 讓桌邊插畫、粗字與紙面形成品牌，讓操作證據負責說明功能。
- **Don't** 將官網海報色票與字重套入登入後 app。
- **Don't** 將情境影片的魔法解讀為尚未實裝的 AI／辨識功能。

### App：既有禁區（保留）
- ❌ 紅色驚嘆號 / 紅色「逾期」標籤 — 用赤陶飽和度遞增表達 urgency
- ❌ "You're behind on X tasks" 的 UX 文案 — 用「還有 X 件可以慢慢做」之類
- ❌ Streak 斷掉的焦慮提示 — 不要做 streak 紅 X，做 streak 圖也要溫柔
- ❌ 中央 modal 用於非必要決策 — 優先 inline / right drawer / bottom sheet
- ❌ 純色 `#ffffff` / `#000000` — 一律用 OKLCH warm 中性

### 影片字幕（2026-09-21）

公開影片維持 18 秒，1920×1080 情境畫面下方保留獨立黑色字幕與控制列安全區，成片為 1920×1480。中英 VTT 每段一句、粗白字純黑底，`line:78%` 置於黑区上緣，避免手機控制列遮住文字；原生字幕切換與全螢幕保留。
