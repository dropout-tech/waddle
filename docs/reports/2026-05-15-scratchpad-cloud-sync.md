# 專注白板雲端同步 + Quick Links upsert 防呆

# Description

- Reported by: info@dropout.tw（dropout-tech）
- 使用者回報：「我的專注白板和常用連結的這兩個區塊我新增了東西以後現在都不見了」
- 兩個區塊分別走不同的持久化機制，但對使用者來說都是「加了東西又不見」的相同症狀
- 換瀏覽器 / 換裝置 / 清過 browser data 後，原本以為已存的內容就消失了

# Fix

## Cause

兩個區塊的資料持久化都有問題：

1. **專注白板**：[components/scratchpad/focus-scratchpad.tsx](../../components/scratchpad/focus-scratchpad.tsx) 只把資料寫進 `localStorage['scratchpad-${date}']`，**從沒打到 Supabase**。
   雖然 [supabase/migrations/0001_initial_schema.sql:135-145](../../supabase/migrations/0001_initial_schema.sql#L135-L145) 一開始就建好了 `scratchpad_items` 資料表（包含 RLS policy），但前端元件根本沒用它。結果：換瀏覽器 / 清 localStorage / 不同裝置 = 資料全失。

2. **常用連結**：[hooks/use-waddle-data.ts](../../hooks/use-waddle-data.ts) 的 `setQuickLinks` 用 `.update().eq('user_id', userId)`。理論上 `user_settings` 列由 `handle_new_user` trigger 預建，但只要那一列因為任何原因不存在（trigger 沒跑、舊資料缺漏、被刪過），`.update()` 就會 **silently 0 rows affected** 然後當作沒事——只剩 localStorage fallback 在撐。

## Solutions

### 1. 把專注白板接到 Supabase

`hooks/use-waddle-data.ts`
- 新增 state `scratchpadByDate: Record<string, ScratchpadItem[]>`
- 在 `loadData` 裡撈 `scratchpad_items`、依 date 分組
- 新增三個 mutation：`addScratchpadItem(date, item)`、`deleteScratchpadItem(id)`、`clearScratchpadDate(date)`
- 全部走樂觀更新 + DB error 時 rollback；用 `pendingWritesRef` 保護 visibility refetch race

`components/scratchpad/focus-scratchpad.tsx`
- 拔掉所有 `localStorage.getItem/setItem`
- `items` 與 `savedDates` 改用 `useMemo` 從 props 推導
- `addTextItem` / `addLinkItem` / `handleImageUpload` / `handlePaste` / `handleDrop` 改呼叫 prop callback

`app/page.tsx` + `components/layout/main-layout.tsx`
- 把新的 props 從 hook 拉下來、再 forward 給桌面與 mobile 兩處 `<FocusScratchpad>` 呼叫點

Result: ✅ TypeScript 通過

### 2. 一次性自動把舊 localStorage 搬遷到雲端

`hooks/use-waddle-data.ts`（loadData 中）
- 掃 `scratchpad-YYYY-MM-DD` 鍵，沒在雲端的 push 上去
- 用 `waddle-scratchpad-migrated-v1` flag 避免重跑
- DB insert 失敗就保留 localStorage、下次再試（不會丟資料）

Result: ✅ 使用者既有資料不會丟

### 3. `setQuickLinks` 改用 upsert

`hooks/use-waddle-data.ts`
```ts
let { error } = await supabase
  .from('user_settings')
  .upsert(
    { user_id: userId, quick_links: next as unknown as Json },
    { onConflict: 'user_id' },
  )
```
取代原本的 `.update().eq('user_id', userId)`，列缺失時也能寫入。

Result: ✅ TypeScript 通過

### 4. WR-01：paste / drop 在過去日期 silently 寫到今天

`/code-review` 跑出來的唯一 warning（confidence 85）。Quick-add 按鈕在 `!isToday` 時已隱藏，但 panel 上的 paste/drop listener 仍 active，會把新項目寫到 `todayKey` 而使用者看不到（因為他看的是過去日期）。

`components/scratchpad/focus-scratchpad.tsx`
- `handlePaste` 開頭加 `if (!isToday) return`
- `handleDrop` 在 `setIsDragging(false)` 之後加 `if (!isToday) return`

Result: ✅ 修好

# Result

- ✅ 專注白板現在雲端同步、跨裝置 / 跨瀏覽器都能用
- ✅ 舊 localStorage 資料自動搬遷，使用者既有內容不丟
- ✅ 常用連結 upsert 防呆，避免 row 缺失時 silently 0-rows
- ✅ 過去日期視圖的 paste/drop edge case 已關閉
- ✅ README 已更新 migration 表（補 0009）、資料模型（補 ScratchpadItem）、開發須知

# Updates

- Fixed [Warning, conf 85] components/scratchpad/focus-scratchpad.tsx:189-220 — paste / drop on past-date view silently wrote to today's bucket. Added `if (!isToday) return` early-exits in both handlers.

# Unsolved Issues

以下 review 期間 surface 但未處理，因為 confidence 低於門檻或屬於既有 codebase pattern。如果要做後續清理可以考慮：

- [Polish, conf ~70] hooks/use-waddle-data.ts — `loadData` 內聯 row 構造繞過 `lib/supabase/mappers.ts` 慣例（其他表用 `rowToTimeBlock` / `timeBlockToRow`）。可抽 `rowToScratchpadItem` / `scratchpadItemToRow` 統一風格。
- [Polish, conf ~70] hooks/use-waddle-data.ts — `loadData` 同時做讀取 + localStorage migration 寫入，職責混在一起。可拆 `migrateLegacyScratchpad()` helper 讓 loader 保持 read-only。
- [Scalability, conf ~75] hooks/use-waddle-data.ts:374 — `scratchpad_items` 整表載入無 date 過濾、無分頁。長期使用者累積數月內容後 fetch 量無上限。建議加 date 範圍 / limit。
- [Polish, conf ~70] hooks/use-waddle-data.ts:1418-1431 — `deleteScratchpadItem(id)` 為了找 item 掃描整個 `scratchpadByDate` map。`addScratchpadItem` 與 `clearScratchpadDate` 都吃 `date` 參數，可改成 `(date, id)` 一致化並避免 O(total) 掃描。
- [Cross-user data path, conf ~70] hooks/use-waddle-data.ts:391-440 — 共用瀏覽器場景：使用者 A migration 失敗 → 使用者 B 登入同瀏覽器 → B 的 first load 會把 A 殘留的 `scratchpad-*` 鍵以 B 的 user_id 寫入雲端。實務上要先發生「A migration 失敗」+「同瀏覽器登入別人」雙條件。
