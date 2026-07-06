# Huddle 手機版 UX 優化方針

> 2026-07-06 制定。依據：三路程式碼審查（基礎設施盤點＋兩輪 UX 審查＋爭議點 grep 裁決）。
> 通用準則已沉淀為全域 skill：`~/.claude/skills/mobile-ux/SKILL.md`（未來所有手機頁面工作
> 動手前先讀它）。本檔是該準則落在 Huddle 的具體施工計畫。

## 現況評估（哪些已經是對的，不要重做）

- ✅ 基礎設施扎實：`useIsMobile`（768px）、`viewport-fit=cover`、safe-area 全面鋪設、
  `100dvh`（無 100vh 陷阱）、`overscroll-behavior: none`、tap-highlight 已清、
  input 16px 防 iOS 縮放、底欄 4-tab、Capacitor 原生殼（haptics/鍵盤/狀態列/deep link）。
- ✅ 拖曳系統是 Pointer Events + 280ms 長按 + `touch-action: none`（task-block、
  day-scroll-view），觸控可用；白板 dnd-kit 有 TouchSensor。
- ✅ 高頻 modal（task-detail / settings / journal / workspace-settings）手機已全螢幕化；
  time-block-modal 用 vaul bottom sheet，是正確示範。

## 施工分包（P0 → P2）

### WP1【hover-only 隱形功能】— sonnet
- `components/notebook/note-list.tsx:127,170`：拖曳把手與刪除鈕 `opacity-0 group-hover` →
  手機（coarse pointer）常駐顯示，熱區 ≥44。
- `components/quick-links/quick-links-panel.tsx:88-140`：編輯/刪除鈕同上。
- 全域掃 `group-hover` / `hover:opacity` 找同型問題，逐一給觸控路徑。

### WP2【觸控目標 44pt 普查】— sonnet
- `components/calendar/calendar-header.tsx`：chevron／視圖切換／⋯ 選單，手機 ≥44（視覺可維持，熱區撐大）。
- `components/calendar/task-block.tsx:353-359,501-506`：縮放把手手機加高＋隱形熱區外擴。
- `components/modals/journal-modal.tsx`：心情 emoji 36px → 44px。
- `components/notebook/note-editor.tsx`：工具列按鈕 28px → ≥40px＋可橫捲。
- `components/task-panel/task-row.tsx`：勾選框與展開箭頭熱區 ≥44、彼此間距拉開。
- `components/modals/settings-modal.tsx`：分類 chip 橫捲加漸層提示。

### WP3【殘存中央 modal → bottom sheet】— sonnet
- `components/modals/recurrence-choice-modal.tsx`、`water-reminder-modal.tsx`：
  手機改 vaul Drawer，照抄 `time-block-modal.tsx` 的分流模式。

### WP4【行事曆手機重設計】— 主對話（最難，跨檔互動邏輯）
- **月視圖**：手機上格子只放日期＋任務圓點（workspace 色），下方接「選中日 agenda 清單」
  （Apple 行事曆 iPhone 模式）；點日期切換 agenda，雙擊/agenda 內按鈕進日視圖。
- **週視圖**：手機加 scroll-snap 逐日翻頁（對齊 day-scroll-view 既有模式）或明確導向日視圖。
- 驗證 week-view 欄位拖曳與 task-row 拖曳在觸控的 touch-action 覆蓋完整性，缺的補上。

### WP5【底欄 tab 手感】— ✅ 完成（2026-07-07）
- active 滑動指示改 200ms + ease-quart（不彈跳）；切 tab 加 `hapticSelection()`
  （Haptics.selectionChanged，比 impact 輕，iOS segmented-control 語意）。
- ⚠️ **第 3 項「切 tab 保留日曆捲動位置」未做，需你決定**：成因是手機 tab 用條件
  渲染 + `key` 強制 remount 觸發滑入動畫，捲動 state 全在 day-scroll-view 內部。要修得
  動 calendar/ 檔案並改寫進場動畫（兩面板常駐掛載），屬中等架構改動、有風險。
  建議另立工作包，且是否值得做取決於你實際用起來覺得「切回日曆被重置」有多惱人。

### WP6【鍵盤貼附工具列】— ✅ 完成（2026-07-07，web 已驗、原生待真機）
- note-editor 工具列在手機改成 fixed 貼底、隨鍵盤上升（新 hook `useKeyboardInset`
  用 visualViewport，跨 web/原生自校正）；桌面維持 sticky top 不變。
- web 驗證通過（工具列 fixed 貼底、按鈕 40px、可打字、桌面無回歸）；**「浮在 iOS
  軟鍵盤正上方」的精確行為 headless 測不到，需 Xcode 真機補驗一次**。

### WP7【殘留 hover-only 普查】— ✅ 完成（2026-07-07）
實修 4 檔（notification-center 鈴鐺熱區補 44、任務 chevron 觸控可見；category-section
badge、full-screen-task-view 兩處 chevron、toast 關閉鈕觸控可見）。其餘 6 檔經查證是
「拖曳把手 + 手機已有 280ms 長按替代」或「手機已 opacity-100 只桌面 hover 隱藏」，
不需動（清單與行號在 git commit 訊息）。注：toast.tsx / ui/toaster.tsx 是死碼（正式用
sonner），仍照修但無實際影響。

### WP8【週視圖 CSS scroll-snap】— P2（待實機測試後決定，維持不變）
週視圖手機已改為「剛好 3 欄一屏」（2026-07-06）；是否再加 CSS snap-proximity
需在 iOS 實機驗證與拖曳 autoscroll 的相容性後決定，不要盲加。

## 驗收標準（每個 WP 交付都要過）

照 skill §9-10：Playwright 390×844 + 375×667、`hasTouch`，量 boundingBox ≥44、
body 無橫向溢出、深淺色截圖、checklist 逐條打勾。

## 不做的事（明確出界）

- 不動桌面版行為；不換拖曳架構（現有 pointer 系統是好的）；不引入新 UI 框架；
- 視覺語言一律遵守 DESIGN.md（warm 陶瓷色系、不彈跳、44pt、不紅色警告）。
