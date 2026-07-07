# 🖥️ Huddle Web 桌面版優化方針與長期發展計畫

> 建立：2026-07-07。基於三路實證調查：架構盤點、技術債挖掘、桌面實測體檢
> （截圖證據：`docs/reports/2026-07-07-web-audit-shots/`，24 張，含深色模式與 1920 寬螢幕）。
> 手機版對應文件：`docs/MOBILE_UX_PLAN.md`。設計基準：根目錄 `DESIGN.md`、`PRODUCT.md`。

---

## 一、現況診斷：一句話與三個根因

**一句話判定**：功能都在、骨架合理，但「溫柔陶瓷感」的品牌只落實在背景色——
往上一層的顏色、文案、互動手感全部還是泛用 SaaS 模板，且沒有任何自動防線守著改動。

### 根因 1｜顏色管線繞過了設計系統（品牌失守的技術原因）
`globals.css` 的 OKLCH token 本身乾淨漂亮，但實際畫面的顏色大多**不是從 token 來的**：

- `lib/demo-data.ts` 播種新帳號時，workspace／分類色直接寫死 Tailwind 預設 `#6366f1`
  (indigo)、`#3b82f6` (blue)、`#10b981` (emerald)——全是 DESIGN.md 明文禁區（冷藍紫）。
  之後任務卡、日曆事件、月曆徽章全從資料讀色 → **每個新使用者開箱就是冷 SaaS 配色**。
- 另有一套手寫 hex 色票（`#FF6B6B` 紅、`#4A90D9` 藍、`#66BB6A` 綠…）**重複複製**在
  `settings-modal.tsx`、`task-detail-modal.tsx`、`lib/mock-data.ts` 三處（色票選擇器預設）。
- 紅色警示到處跑：「19 待辦」紅框徽章、鈴鐺紅點、報告紅字百分比——違反「不用紅色恐嚇，
  urgency 用赤陶飽和度遞增」。
- 深色模式只換了底色，事件條／任務卡原色照搬 → 深底上變螢光；記事本工具列深色下
  對比崩壞（目測遠低於 WCAG AA）。

### 根因 2｜互動品質承諾未兌現（重度使用者的底線）
PRODUCT.md 明列「鍵盤導航完整支援（j/k、cmd-K）」，實測（DOM probe 佐證）：

- cmd-K 無反應（無 command palette）；j/k 無作用。
- 「?」快捷鍵說明寫了 D/W/M/T 與 Esc，但 D/W/M/T 要先點過日曆才有效
  （`calendar-panel.tsx:154-155` onKeyDown 綁在 tabIndex=0 的 div 上）；
  Esc 在任務 modal、設定 modal、專注白板三大 overlay 全部無效。**文件寫了但壞的，比沒寫更傷信任。**
- 任務編輯用原生 date/time input（英文 mm/dd/yyyy）、hover 回饋極弱、
  設定 modal 遮罩用重黑 bg-black/60（DESIGN.md 要求 0.25 暗化 + blur）。

### 根因 3｜零防線 + 複製貼上式維護（「試很久才發現衝突」的結構性原因）
- **ESLint 實跑壞掉**（eslint-config-next × ESLint 9.39 相容 bug）→ 全 repo 零 lint 防線。
- **零自動化測試**：三輪手機驗證的 Playwright 腳本都寫在暫存區、session 結束即刪，
  「上輪修好的東西這輪有沒有壞回去」沒有任何機制守著。
- 六個 modal 各自複製同一段 shell class，已實際分岔（`workspace-settings-modal.tsx:139`
  用 90dvh、其餘五個 90vh）；`calendar-export-modal.tsx:85-92` 手刻 body scroll lock
  未用共用 hook（多 modal 疊開時會提前解鎖）；z-index 硬編 14 種值散布 46 檔；
  兩份重複的 `useIsMobile`；四個 toast 死碼檔。
- 巨型檔案：`use-waddle-data.ts` 2693 行（全 app 資料都在裡面）、`settings-modal.tsx` 1608、
  `full-screen-task-view.tsx` 1587（與 task-panel 邏輯重疊）、`main-layout.tsx` 870。

### 體檢另抓到的具體壞點（節錄）
- 週視圖顯示 8 天、欄標題出現兩個「週二」（待復現確認）；30 分鐘事件擠成 28px 不可讀。
- 1920 寬螢幕只是把事件條拉長，多出的空間全浪費（桌面是「放大的手機版」）。
- 報告頁：四張等大 KPI 卡（大數字+icon+label）＋indigo 進度條＋紅字＋⚠️ icon——
  一頁集齊 DESIGN.md 四種明文反模式，是全站離品牌最遠的頁面。
- 通知文案「記得在今天完成這些任務！」屬催促語氣，違反品牌「不催促」。
- 測試帳號開站所有 workspace／任務都成對出現（播種跑了兩次？需查冪等性）。

---

## 二、優化方針（四條原則，所有 WP 都掛在底下）

- **A. 設計系統要「可執行」**：DESIGN.md 的規則從文件變成程式碼的單一來源——
  色票、z-index、modal shell、motion 都 token 化／元件化，讓「違規」在 code review
  一眼可見，而不是靠事後截圖抓。
- **B. 防線先於功能**：先建回歸防線（type-check、lint、入 repo 的煙霧測試），
  之後每一輪改動都有機器把關，不再靠運氣發現衝突。
- **C. 桌面是工作台，不是放大的手機**：大螢幕空間要有策略（第三欄／密度控制），
  鍵盤是桌面的一等公民（等同手機的手勢地位）。
- **D. 每個決策問一句「未來 agent 能不能拿這份資料覆盤」**：對齊 North Star
  （個人企業成長 agent），紀錄不是終點、回顧才是。

---

## 三、Phase 0 — 防線與地基（先做，量級 ~1 天）

| WP | 內容 | 關鍵位置 |
|---|---|---|
| W0.1 | 補 `type-check` script（`tsc --noEmit`）；修 lint（升級 eslint-config-next 或暫降 ESLint 版本，二選一試通即可） | package.json |
| W0.2 | Playwright 煙霧測試**收進 repo**：登入 → 五大視圖開啟 → 無 console error → 幾個關鍵斷言（週視圖 7 欄、Esc 可關 modal 等）。一鍵 `pnpm e2e` | scripts/e2e/（新） |
| W0.3 | 清死碼（toast 四檔）；統一兩份 useIsMobile 為 `hooks/use-mobile.ts` 一份 | components/ui/toast*、use-toast*、components/ui/use-mobile.tsx |
| W0.4 | `calendar-export-modal.tsx:85-92` 改用共用 `useBodyScrollLock` | hooks/use-body-scroll-lock.ts |
| W0.5 | z-index token 化：globals.css 定義 `--z-*` 階層（base/panel/overlay/modal/toast/tour），46 檔換算收斂 | app/globals.css |
| W0.6 | 抽共用 `<ModalShell>` 元件，收斂六份複製的 modal 外殼（順手把遮罩改 DESIGN.md 規範的 0.25 暗化＋blur） | components/modals/* |

驗收：type-check＋lint＋e2e 三綠；z-index grep 斷言無硬編殘留。

## 四、Phase 1 — 品牌色票清洗（核心，量級 1-2 天）

| WP | 內容 | 備註 |
|---|---|---|
| W1.1 | 建 `lib/palette.ts` 單一色票來源：陶瓷釉色系（DESIGN.md 的 4 個 workspace 色＋urgency 五階＋圖表色），三處複製的選擇器預設全部改吃它 | 消滅 #FF6B6B/#4A90D9 那套 |
| W1.2 | `demo-data.ts` 播種色改品牌色票；**舊帳號既有資料**二選一：(a) 一次性遷移 SQL、(b) 顯示層映射（讀到舊冷色時映射到最近的品牌色）——**需使用者決定** | 建議 (a)，資料乾淨 |
| W1.3 | 紅色警示全面改赤陶系：待辦徽章、鈴鐺紅點、已完成數字、報告紅字（含唯一一處 text-red-* 殘留） | 全站掃 |
| W1.4 | 深色模式色彩映射：存的是淺色 hex → 深色模式經轉換函式降亮度/降彩度再上屏（事件條、任務卡）；修記事本工具列深色對比 | lib/utils.ts 已有 isLightColor 可擴充 |
| W1.5 | 月曆徽章降噪：藍色計數徽章改中性／workspace 色、鄰月灰格不顯示徽章 | month-view.tsx |

驗收：前後截圖對比（同一頁面同一資料）；grep 斷言禁區色碼歸零；深色模式截圖過 agent 對比審查。

## 五、Phase 2 — 互動品質：鍵盤與手感（量級 1-2 天）

| WP | 內容 |
|---|---|
| W2.1 | Esc 行為全站一致：任務 modal、設定 modal、專注白板、匯出 modal 全部可 Esc 關閉（配合 W0.6 的 ModalShell 一次到位），含焦點返回 |
| W2.2 | D/W/M/T 改全域監聽（輸入框聚焦時停用）；補 j/k 上下導航任務 |
| W2.3 | **cmd-K command palette 第一版**：跳轉視圖／搜尋任務／快速新增任務。用既有 shadcn cmdk。（長期這是 agent 對話入口，見 L2） |
| W2.4 | 任務編輯的原生 date/time input 換品牌化元件（shadcn calendar + 自製時間選擇），中文格式 |
| W2.5 | hover/focus 精緻化：任務卡 hover 給 elevation/底色變化（不只浮出把手）、登入鈕 hover 加可感知回饋 |
| W2.6 | 文案溫柔化：通知中心「記得在今天完成這些任務！」等催促句 → 品牌語氣（「還有 X 件可以慢慢做」方向）；全站掃一次 UX 文案 |

驗收：e2e 加鍵盤斷言（Esc/D/W/M/T/cmd-K）；hover 前後截圖。

## 六、Phase 3 — 桌面空間與核心視圖重設計（量級 2-4 天，含品味題）

| WP | 內容 | 性質 |
|---|---|---|
| W3.1 | 週視圖修錯：8 天/重複週二（先復現再修）；30 分鐘事件最小可讀高度策略（重疊聚合或 +N 摺疊） | bug＋設計 |
| W3.2 | 大螢幕空間策略：≥1680px 出第三欄（覆盤/報告欄常駐可摺疊，回應「三欄式」的產品初衷）vs 內容置中限寬——**品味題，出 2-3 方案並排截圖供選** | 品味題 |
| W3.3 | 報告頁重做成「溫柔覆盤」：拆 KPI 卡牆，改敘事型呈現（本週節奏、完成的事、時間都花在哪、一句溫柔的觀察）——這是 North Star 覆盤線的第一步，**出 2-3 方案供選** | 品味題 |
| W3.4 | 任務編輯從中央 modal 改 right drawer（DESIGN.md 明文偏好 inline/drawer），桌面編輯不再打斷日曆視野 | 結構 |
| W3.5 | 播種冪等性查修：確認「所有東西成對出現」是測試帳號歷史問題還是播種會重跑；若是後者，加冪等鍵 | bug |
| W3.6 | 登入頁收尾：垂直重心、卡片陶瓷層次（小改，順手） | 精緻化 |

## 七、長期藍圖 L（延續當前脈絡，不受現況限制）

- **L1 覆盤 agent（North Star 主線）**：W3.3 敘事報告 → 週回顧/月回顧頁（自動生成草稿、
  使用者補一句感受）→ 對話式覆盤（Claude API：「我這個月卡在哪」）→ 可切換人格（教練/
  專案管理者/讀書科學家）。前置：資料模型 review-ability 審計——任務完成時間、時間區塊
  實際 vs 計畫、日記與任務的關聯，這些欄位現在有沒有存夠？（審計本身是 L1 第 0 步）
- **L2 cmd-K 長成 agent 入口**：W2.3 的 palette 從「搜尋跳轉」演化成「跟 Huddle 說話」
  的統一入口（新增任務用自然語言、問覆盤問題），桌面版最重要的長期互動投資。
- **L3 設計系統元件庫**：ModalShell（W0.6）、UrgencyChip、Badge、palette（W1.1）、
  motion token 逐步沉淀成 `components/system/`，讓未來每個新功能「天生合規」，
  設計債不再重生。
- **L4 Rebrand 收尾**：程式碼層 Waddle→Huddle（139 處/30 檔，刻意保留中）與 Bundle ID
  一起在 iOS 上架前處理，避免動兩次。
- **L5 小團隊協作預留**：UX 決策維持「一人預設」；唯資料模型層新增欄位時避免做出
  阻擋未來 workspace 共享的設計（如把 user_id 硬編進唯一鍵以外的業務邏輯）。
- **L6 雙線節奏**：web 線（本計畫）完全不依賴 Xcode，可先行；iOS 線等 Xcode 裝好後
  按 `docs/IOS_SETUP.md` 走。Phase 1 色票清洗完成後，iOS 殼內畫面自動受益。

## 八、執行順序與需要使用者決定的事

**建議順序**：Phase 0 → Phase 1 → Phase 2 → Phase 3（0/1 可併一輪做；每 Phase 結束
用 e2e＋截圖對比驗收並更新本檔）。

**需使用者拍板**：
1. W1.2 舊帳號色票：一次性遷移 (a) 還是顯示層映射 (b)？（建議 a）
2. W3.2 大螢幕策略、W3.3 報告頁方向：屬品味題，屆時出並排截圖方案選。
3. Phase 0-2 純技術判斷，授權後可直接連續執行。

**風險與回滾**：全部 web 側改動、不碰金流不碰線上資料庫（W1.2 遷移 SQL 除外，執行前
單獨再確認）；每 Phase 獨立 commit，壞了可整包 revert。

## changelog
- 2026-07-07 建立 v1（三路調查證據落檔於 docs/reports/2026-07-07-web-audit-shots/）
- 2026-07-07 **Phase 0-3 全部執行完畢**（使用者授權連續執行）：commits `5da35ac`（P0 防線）
  → `d25607b`（P1 色票+深色）→ `78cd8df`(P2 鍵盤+cmd-K+選擇器+文案) → `4b48fff`（P3 週視圖
  /播種/覆盤/第三欄）→ `09f2fe3`（P3 收官：任務抽屜+登入頁）。每階段 type-check/lint/e2e 全綠。
  **未完成移入後續票**：j/k 任務導航（需先解決任務列表扁平順序的單一來源）、播種防護的
  DB 層唯一約束（要動 schema）、migration 0014 待使用者放行 `supabase db push`、
  手機浮動計時 pill 蓋到覆盤欄一角、任務抽屜遮罩透明度（品味選項：可調淡讓日曆更清楚）、
  設定頁色票選擇器深色下顯示原始色（低優先）。
- 2026-07-07 W0.5 驗收條件修正記錄（code review WR-04）：全站 50 處 z-index 已 token 化，
  但**刻意保留約 18 處局部堆疊字面值**（拖曳幽靈、格內選取預覽、目前時間線、常駐懸浮鈕、
  沉浸計時器裝飾層等「不與全域圖層互動」的 local stacking context——硬套語意 token 會誤導
  讀者）。原「無硬編殘留」驗收改為「全域圖層零硬編＋局部堆疊白名單」。清單見該輪 agent
  回報與 REVIEW.md WR-04。
