# 專注白板 Notion 化 Phase 1（+ iOS handoff 收尾）

# Description

- 收尾上個 session 的 iOS handoff（兩個 code-review warning），接著把「專注白板」(focus scratchpad) 演進成 Notion 風格的區塊編輯器 Phase 1：可勾選待辦、一鍵升級成任務、markdown 捷徑、拖曳重排，並補齊支撐用的 DB migration。
- 過程踩到一個工具雷：用 `/gemini-plan` 規劃時，Gemini CLI 沒守唯讀模式、平行把實作寫進工作目錄又漏了 migration → 靠補 migration + 多代理 code-review 救回。

# Changes Made

- **iOS handoff 收尾**（已 commit `73223af`）
  - WR-01 open redirect：`app/auth/callback/page.tsx` 的 `next` 只允許同源相對路徑。
  - WR-02：新增 `lib/haptics.ts`，在任務 off→on 完成時觸發 iOS Taptic 成功回饋（接到 `hooks/use-waddle-data.ts` 的 `toggleTaskComplete`）；移除沒用到的 `@capacitor/clipboard`。

- **白板 Phase 1（block 模型，未 commit）**
  - 資料模型走 Route A（擴充 row，不走 Tiptap-每日-JSON）。新增 migration：
    `supabase/migrations/0011_scratchpad_blocks.sql`
    ```sql
    ALTER TABLE scratchpad_items ALTER COLUMN type TYPE text;  -- enum→text，避免日後 ALTER TYPE 限制
    DROP TYPE scratchpad_type_enum;
    -- + sort_order / is_checked / parent_id / metadata；backfill sort_order by created_at ASC；index
    ```
  - `components/scratchpad/focus-scratchpad.tsx`（重寫）：卡片 grid 版（`rectSortingStrategy` 拖曳）、text/image/link/todo 四型別、`[] `→待辦捷徑、就地編輯、勾選、升級任務鈕、時間戳。
  - `hooks/use-waddle-data.ts`：`updateScratchpadItem` / `reorderScratchpadItems`（單次原子 upsert）；`addScratchpadItem` 在 hook 內權威指派 `sort_order`；loader 改最舊在上（ASC）。
  - `app/page.tsx`：`handlePromoteToTask` + `promotedScratchpadIdRef`，任務存成功後才刪來源筆記。
  - `lib/types.ts` / `lib/supabase/database.types.ts`：`type` union 收斂為 `text|image|link|todo`，移除殘留 `scratchpad_type_enum`。
  - `README.md` / `components/onboarding-tour.tsx`：同步文件與導覽文案。

Result: TypeScript `tsc --noEmit` 通過。白板寫入功能需先把 migration 0011 套到遠端 Supabase 才會生效。

# Updates

- **Step-by-Step（救援流程）**：`/gemini-plan` → Gemini 違規平行實作 P1 且漏 migration（執行期壞） → 我補 `0011` → 多代理 `/code-review`（11 findings）→ 依使用者拍板（還原卡片 grid、最舊在上）逐項修 → 焦點 re-review 抓到我自己引進的回歸 → 修掉。
- **本 session 修掉的 code-review findings**（REVIEW.md）：
  - Fixed CR-01 `app/page.tsx` / `focus-scratchpad.tsx` — promote-to-task 先刪筆記再開未存草稿 → 取消 modal 會掉資料；改成存成功後才刪。
  - Fixed WR-01/02/03 `hooks/use-waddle-data.ts` — 重排 rollback 可能寫入 undefined、N 筆平行 UPDATE 部分失敗、`sort_order` 撞號；改成 updater 內捕捉+`?? []`、單次 upsert、hook 內權威指派。
  - Fixed WR-04/05 `focus-scratchpad.tsx` — 動作鈕/拖曳把手在手機隱形、拖曳跟捲動打架；改 `opacity-100 md:opacity-0 md:group-hover` + PointerSensor `delay:200`。
  - Fixed WR-06/07/08 `focus-scratchpad.tsx` — 移除假 bullet 捷徑、撤掉做不完的 divider、清掉死 import。
  - Fixed WR-09/10（設計決定）— 還原卡片 grid + 縮圖 + 時間戳；排序統一最舊在上。
  - Fixed WR-11 `lib/types.ts` / `database.types.ts` / `0011` — 移除殘留 enum 型別、收斂 union、軟化 migration 註解。
  - Fixed（re-review 新發現）`app/page.tsx` — CR-01 修法回歸：modal 先 `onSave` 不 await 再同步 `onClose`，導致 ref 在 `await createTask` 期間被清空、刪除變死碼、留下重複筆記；改成 await 前先把 sourceId 快照進區域變數。

# Result

- `npx tsc --noEmit`：通過（修完回歸後再次通過）。
- ESLint：此 repo 本身相容性壞掉，跳過；正確性靠型別檢查與 code-review 把關。
- 影響範圍：白板資料模型由 enum 三型別擴成 text 欄多型別；既有 text/image/link 項目相容（讀取降級安全）。

# Unsolved Issues

- [blocker] `supabase/migrations/0011_scratchpad_blocks.sql` 尚未套到遠端 Supabase — 套之前白板的新增/編輯/勾選/重排會在執行期失敗（前端已寫新欄位、DB 還沒有）。需 `supabase db push` 或 SQL editor 執行。
- [pending] 本批白板改動尚未 commit（等使用者指示）。
- [deferred] Phase 2/3 未做：callout、toggle、連結預覽卡（Edge Function 抓 OG）、每日頁面化、Tiptap 段落內富文字 + slash、範本、@提及、AI 覆盤（Edge Function 呼叫 Claude API）。
- [manual] 手動 UI 走查（新增/勾選/重排/升級任務）待 migration 套用後驗收。
