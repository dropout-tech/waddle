# Waddle 手機 RWD 體驗審查報告 + PRD

**審查日期：** 2026-05-05
**審查範圍：** 手機（≤ 768px）斷點下的整體 RWD、可觸性、互動流暢度與 iOS/Android 細節處理
**整體評分：** 7.0 / 10（堅實的基礎，但離「頂尖產品級」仍有約 3-5 個關鍵 gap）

---

## 一、總體評語

Waddle 在手機 RWD 上的**架構決策**做得很到位 —— 單欄 Tab 切換而非硬塞兩欄、自製 swipe 手勢加 drag 衝突抑制、safe-area-inset 全面導入、最近一連串 commit（`b65dfae`、`d923335`、`9f8c6b9`）已修掉一批要害。**但**底層 Design System 的幾個 primitives（Input、Button、Popover）未針對 touch 優先重新校準，導致整個 app 上層即使每處都記得處理，仍會在邊緣情境漏拍。這是「7 → 9」的關鍵。

---

## 二、做得好的地方

| 項目 | 評語 |
|---|---|
| Mobile 斷點選擇 | `useIsMobile` 統一以 768px 切，與 Tailwind `md:` 對齊，沒有自訂奇怪斷點 — 維護成本低 |
| Input 字級防 iOS Zoom | `components/ui/input.tsx:11` `text-base md:text-sm` — 教科書級正解 |
| Safe area 處理 | tab bar、modal、scratchpad 都用 `env(safe-area-inset-*)`，不是只貼 padding |
| Swipe 與 drag 不打架 | `hooks/use-swipe-navigation.ts` 用原生 PointerEvent 而非 React synthetic、有 dragActiveCount 抑制 — 同業常踩這雷 |
| Modal 改用 100dvh | 不用 100vh — 已避開 iOS Safari 工具列伸縮造成的高度跳動 |
| OKLCH 色票 | 在低端 OLED 螢幕上對比與飽和度更準，深色模式不偏色 |

---

## 三、發現的問題（依嚴重度排序）

### P0：架構或基礎問題，會跨頁影響

#### 1. Viewport meta 缺 `viewport-fit=cover` — Safe area 在 iOS Notch 裝置上實際是 0

**檔案：** `app/layout.tsx:47-50`

Next.js 雖會自動補 `width=device-width, initial-scale=1`，但 **不會自動補 `viewport-fit=cover`**。沒有它，iOS Safari 就不會把內容延伸到 notch / home indicator 區域，`env(safe-area-inset-top/bottom)` 全部回傳 `0px`。

#### 2. Popover 預設 `w-72` 沒設 mobile clamp，會溢出 320-360px 視口

**檔案：** `components/ui/popover.tsx:33`

`w-72` = 288px。在 360px 視口、popover 靠右展開時，扣掉 padding 與 sideOffset，常常會貼到甚至超出右緣。

#### 3. Button / Icon Button 預設低於 44pt iOS HIG 最小可觸尺寸

**檔案：** `components/ui/button.tsx:24-29`

`default` h-9 = 36px、`icon` size-9 = 36px、`icon-sm` size-8 = 32px。Apple HIG / Material 都要求 44×44pt。

### P1：高頻使用路徑的破口

#### 4. `useIsMobile` SSR-first render 為 false → mobile 進站會閃一下桌機版

**檔案：** `hooks/use-mobile.ts`

#### 5. Modal 全部 `h-[100dvh]` 全螢幕 — 短表單浪費空間、關閉鍵在頂端難按

範圍：`task-detail-modal`、`settings-modal`、`time-block-modal`、`workspace-settings-modal`、`journal-modal`

#### 6. Hover-only 互動殘留在 Calendar / Task list

部分 drag handle / 操作按鈕用 `opacity-0 group-hover:opacity-100`，沒有 `md:` scope。手機上看不見。

#### 7. Input 缺 `inputMode` / `autoComplete` — Native 鍵盤體驗不到位

### P2：邊緣情境與細緻度

#### 8. 極窄視口（< 320px、橫拿小螢幕）日曆欄會擠壓
#### 9. 無 list virtualization
#### 10. 缺 `apple-mobile-web-app-capable` / PWA manifest meta
#### 11. Long-press 拖曳沒有觸覺/視覺進入態提示
#### 12. Theme-color 寫死亮色

---

## 四、PRD：手機體驗強化

### 目標

在 2 個 sprint（4 週）內將 Waddle 的手機體驗從「7/10 堪用」升級到「9/10 媲美 Linear / Notion / Things 3 的 native-feel」。

### 成功指標

| 指標 | 目前 | 目標 |
|---|---|---|
| Lighthouse Mobile Best Practices | 未知 | ≥ 95 |
| Lighthouse Mobile Accessibility | 未知 | ≥ 95 |
| iPhone SE (320px) 全頁面無水平捲軸 | 未驗證 | 100% |
| 所有可點元素 hit area ≥ 44×44pt | 部分 | 100% |
| Modal/Popover 視口溢出 bug | 偶發 | 0 |
| Mobile Hydration Mismatch flash | 有 | 無 |

---

### Sprint 1（第 1–2 週）：Foundation Fixes

#### Task 1.1 — 修補 Viewport Meta（P0）

- 加入 `viewportFit: 'cover'`、`width: 'device-width'`、`initialScale: 1`
- `themeColor` 改 light/dark 對應陣列

#### Task 1.2 — Popover Primitive 加入 Mobile Width Clamp（P0）

- `PopoverContent` 加 `max-w-[calc(100vw-1rem)]`、`collisionPadding={8}`
- 同步 `dropdown-menu.tsx`

#### Task 1.3 — Button Primitive 校準到 44pt 觸控標準（P0）

- 視覺尺寸不變，用 `::before` pseudo-element 把 hit area 擴到 44pt

#### Task 1.4 — 修 useIsMobile SSR Flash（P1）

- 在 `<html>` 上 inline script 預先寫入 `data-viewport` attribute，避免 hydration mismatch

---

### Sprint 2（第 3–4 週）：Polish & Native-Feel

#### Task 2.1 — 短表單 Modal 改 Bottom Sheet（P1）

優先 `time-block-modal`、`workspace-settings-modal`。引入 Vaul drawer，內容 < 70vh 時用 sheet。

#### Task 2.2 — 清除 Hover-Only 互動（P1）

所有 `group-hover:opacity-*` 加 `md:` scope。

#### Task 2.3 — Input `inputMode` / `enterKeyHint` 校準（P1）

時間欄位 numeric、email、url、enterKeyHint 等。

#### Task 2.4 — Long-Press 視覺與觸覺進入態（P2）

`scale(1.04)` + `shadow-lg` + `navigator.vibrate(10)`。

#### Task 2.5 — 320px 視口巡檢與修補（P2）

#### Task 2.6 — PWA Capable Meta（P2）

加 `manifest.webmanifest`、apple-mobile-web-app meta。

---

## 五、QA Checklist

實機（**真機，不只 emulator**）必過：
- iPhone SE（最小寬度，無 notch）
- iPhone 15（標準 notch）
- iPhone 15 Pro Max（最大、Dynamic Island）
- Pixel 7 / Galaxy S 系列（Android Chrome）
- iPad Mini 直立（測 768px 邊界切換）

功能巡檢：
- 進站第一個 paint 是 mobile 版本（無閃動）
- 底部 tab bar 不被 home indicator 遮、與其有適當間距
- 三個 tab 切換動畫流暢
- 行事曆 swipe 換日 / 換 tab 不誤觸 drag
- 點擊每一個 icon button、checkbox、close button — 第一次嘗試成功率 100%
- 任意 popover 不溢出視口
- 任意 modal 開啟、輸入、關閉
- 鍵盤跳出時不擋輸入欄
- 深色模式下 URL 列、status bar 顏色正確
- 旋轉橫向 — layout 正確切換或保持

---

## 六、長期建議（不在本 PRD 範圍）

1. List virtualization（`@tanstack/react-virtual`）
2. Skeleton loading state
3. Optimistic UI for task toggle / drag
4. i18n 字串長度測試
5. Accessibility audit（VoiceOver / TalkBack）
