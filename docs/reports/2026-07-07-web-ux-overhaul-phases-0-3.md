# Web 桌面版 UX 全面優化（Phases 0-3）＋ wrap-up

# Description

- 使用者要求：理解專案後制定 web 桌面優化方針與長期發展計畫（著重 UI/UX），並執行全部階段。
- 三路實證調查（架構盤點／技術債挖掘／Playwright 桌面體檢，證據 `docs/reports/2026-07-07-web-audit-shots/`）產出 `docs/WEB_UX_PLAN.md`，隨後 Phase 0-3 全數執行。

# Changes Made

依 WEB_UX_PLAN 四階段執行，每階段獨立 commit、三道防線（`pnpm type-check` / `lint` / `e2e`）全綠才入庫：

- **Phase 0 防線與地基**（`5da35ac`）：type-check/e2e scripts、修好 ESLint（改用 eslint-config-next 原生 flat config，根因是 FlatCompat 相容層）、`scripts/e2e/smoke.mjs` 八步煙霧測試、共用 `ModalShell`（Esc／遮罩 0.25+blur／焦點歸位／90dvh 統一）收斂 6+1 個 modal、z-index 語意 token（50 處換算）、死碼清除（toast×4、重複 useIsMobile）。
- **Phase 1 品牌色票**（`d25607b`）：`lib/palette.ts` 單一色票來源（陶瓷釉色系＋urgency 五階＋舊色遷移表）；播種資料、三份複製的選色器預設全部改吃 palette（清除 Tailwind indigo/blue/emerald 與明文禁用的純紫）；`toDarkDisplayColor()`＋`useDisplayColor()` 讓資料驅動色在深色模式自動降亮壓彩（淺色零變化）；記事本工具列深色對比修復；月曆徽章降噪。`supabase/migrations/0014`（冪等、只動舊預設值）已寫好未推送。
- **Phase 2 鍵盤與手感**（`78cd8df`）：cmd-K 指令面板（cmdk＋ModalShell：切視圖／開記事本／設定／新增任務／模糊搜尋任務）；D/W/M/T 全域化（輸入框與 modal 抑制）；白板 Esc 收合；共用 `DateField/TimeField`（桌面中文格式 popover 月曆＋15 分下拉，手機保留原生 input，12 處替換）；task-row／按鈕 hover 回饋；通知等 12 句催促文案溫柔化。
- **Phase 3 視圖重設計**（`4b48fff`＋`09f2fe3`）：週視圖 8 天 bug（DAY_WIDTH 綁定容器寬）＋30 分鐘事件可讀性；播種冪等鎖（StrictMode 雙掛載雙播種，DB 時間戳定罪）；報告頁重寫為「溫柔覆盤」四區塊（拆 KPI 卡牆／紅字／⚠️／火焰）；≥1680px 第三欄覆盤欄（可收合、localStorage 記憶）；任務編輯改桌面右側 520px 抽屜（ModalShell drawer variant）；登入頁 2:3 節奏＋`--shadow-ceramic`；死碼 modal 刪除（journal/report-modal，零引用）。
- **wrap-up**（`338fc82`＋本 commit）：README/DESIGN.md 同步實作、onboarding tour 補 ⌘K、五路多 agent code review＋15 條信心評分 → `REVIEW.md`（4 warning）→ 全數修復（見 Updates）。

# Updates

Code review（五路 agent＋逐條信心評分）後修復：

- Fixed [warning 90] `components/modals/time-block-modal.tsx:361` — ModalShell 收斂時退化掉手機 Vaul 底部抽屜（git-history lens 對照 94905cc 抓到）；已恢復雙態（手機 Vaul、桌面 ModalShell），375 實測拖曳把手存在、貼底。
- Fixed [warning 90] `components/calendar/calendar-export-modal.tsx` — 計畫承諾的匯出 modal Esc 缺失＋重黑遮罩；改用 ModalShell（新增 size 2xl），實測 Esc 可關、遮罩 oklab 0.25+blur(8px)。
- Fixed [warning 85] `components/reports/report-dashboard.tsx:442` — 時間佔比條動畫 `width` 違反 DESIGN.md 動效規則；移除 transition。
- Fixed [warning 85] `docs/WEB_UX_PLAN.md` — W0.5「無硬編殘留」驗收與實際（18 處局部堆疊刻意保留）不符；changelog 補記決策與理由。
- Fixed [sub-threshold 75] `components/modals/modal-shell.tsx:137`＋`recurrence-choice-modal.tsx:61` — 巢狀確認框開啟時按 Esc 會關掉外層編輯抽屜（丟編輯資料）；加 `defaultPrevented` 檢查＋recurrence modal 自帶 capture-phase Esc 處理，真實重複任務情境實測通過。
- Fixed [sub-threshold 75] `scripts/e2e/smoke.mjs:16` — 測試帳密寫死入版控；改讀 env／gitignored `.env.e2e.local`，缺憑證 exit 1。
- Fixed [sub-threshold 75] `components/command-palette.tsx:173` — cmd-K 色點未走深色調校管線；改用 `useDisplayColor()`，深淺色實測色值不同。
- 附帶：smoke.mjs 設定 modal 關閉改為正式的 Esc 斷言（原為過時的 backdrop-click workaround）。

# Result

- 最終樹三道防線親跑全綠：`pnpm type-check` 0 錯、`pnpm lint` 0 error（125 warnings 均既有）、`pnpm e2e` 8/8（含新 Esc 斷言）。
- 視覺／互動證據（agent 實測、主對話抽查實體）：`docs/reports/2026-07-07-*-shots/` 各輪截圖（gitignored）＋修復驗證截圖於 /tmp。
- commits：`f3633f2`(計畫) → `5da35ac` → `d25607b` → `78cd8df` → `4b48fff` → `09f2fe3` → `338fc82` → 本次收尾 commit；push 至 `origin/feat/ios-capacitor`。
- 部署：Zeabur 於合併 main 時自動部署，本分支 push 不觸發。

## 文案 before → after（待使用者過目，`components/notifications/notification-center.tsx` 除註明外）

| Before | After |
|---|---|
| 最久的任務已過期 X。建議重新評估…刪除/歸檔。 | 最久的一件是X的。有些也許已經不用做了——放心整理掉，留下真正想做的就好。 |
| N 個任務剛過期 | N 個任務剛過了預定日 |
| …到期，建議盡快安排時間處理。 | 日子過了也沒關係，挑個合適的時段重新安排就好。 |
| N 個任務今天到期／記得在今天完成這些任務！ | 今天排了 N 件事／還有時間，可以慢慢做——一件一件來就好。 |
| N 個任務即將到期／…3 天內到期，提前規劃時間處理。 | N 個任務這幾天到期／接下來三天會陸續到期，先挑個順手的時段放上日曆，到時候就從容多了。 |
| N 個任務需要整理／建議設定明確的時間，或考慮是否真的需要執行。 | N 個任務靜靜躺了兩週／還想做的話，挑個日子放上日曆；不想做了也沒關係，歸檔就好。 |
| 高優先任務過多／…降低執行效率。建議重新評估優先順序。 | 急件好像有點多／全部都急，反而不知道從哪開始——挑出真正的前幾名，其他的緩緩也可以。 |
| 專注於重要的事，定期整理任務清單 | 慢慢搖擺，把事情做完 |
| （full-screen-task-view）N 個過期需處理 | N 個已過預定日 |
| （登入頁）slogan 在頂部 logo 旁 | slogan 移至頁底收尾（文字未改） |

# Unsolved Issues

- ~~[pending-user] migration 0014~~ → **已於 2026-07-08 由使用者明示放行後執行**：暫時開防線→`supabase db push` 套用成功→防線立即還原並用測試 payload 重測（deny 正常）→唯讀腳本驗證測試帳號 3 workspaces/11 tasks/1 time_block 零舊色殘留（workspace 色已為 #AE96DA/#259CCA/#59B47D）。
- [deferred] j/k 任務列表鍵盤導航 — 需先建立「可見任務扁平順序」單一來源（跨 category-section/unified-task-list 的結構工程）。
- [deferred] 播種冪等的 DB 層唯一約束 — 現有 ref 鎖不擋跨分頁並發首登；需 schema 變更，另立遷移。
- [taste] 任務抽屜遮罩透明度 — 可調淡讓「邊編輯邊看日曆」更清楚；等使用者體感回饋。
- [minor] 手機浮動計時 pill 蓋到覆盤欄一角；設定頁色票選擇器深色下顯示原始色。
