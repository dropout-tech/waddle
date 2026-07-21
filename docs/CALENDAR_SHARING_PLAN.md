# 行事曆互相共享 — 施工計畫（v2 定稿）

> 2026-07-21。需求簡報經使用者確認（雙向共享、帳號制接受、workspace＋時間區塊類型兩層
> 皆可選、逐類別選「完整／只顯示忙碌」、疊加顯示、唯讀、可撤銷、資料庫層過濾）。
> v1 草稿經資安顧問（總判定：修正後開工）與工程師顧問（總判定：修正後開工）獨立批判，
> 本版已整合全部修正。批判者：security-auditor（設計審查）、engineer（工程可行性）。

## 0. 設計總則（安全面最小化）

**既有表的 RLS 一律不動。** 所有跨帳號讀取走全新 SECURITY DEFINER RPC，函式內部驗證
共享關係與授權範圍。理由：

1. 「只顯示忙碌」是欄位級過濾（藏標題、留時段），RLS 只能控列不能控欄，硬做反而擴大攻擊面。
2. 既有 10 張表的 owner-only policy 是唯一隔離防線，動它風險遠大於收益。
3. 安全審查面收斂到 3 張新表＋5 支函式。

**RPC 三件套（資安審查要求，每支函式必套）**：
- `revoke execute on function … from public, anon; grant execute to authenticated;`
- 函式第一行斷言 `auth.uid() is not null`，否則 raise（防 NULL 比對靜默翻轉）
- `security definer set search_path = ''`，函式內全部用 schema 限定名（`public.xxx`）

## 1. 資料模型（migration 0016，純新增、不觸既有表；回滾＝drop 新物件）

```sql
create extension if not exists pgcrypto;  -- gen_random_bytes（0001 只裝了 uuid-ossp）

create table public.calendar_share_invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,          -- sha256(token)，原始 token 不落庫
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at  timestamptz
);
-- RLS：inviter 可 select／insert／update（撤銷）自己的邀請；接受動作只走 RPC。

create table public.calendar_shares (
  id         uuid primary key default gen_random_uuid(),
  user_lo    uuid not null references auth.users(id) on delete cascade,
  user_hi    uuid not null references auth.users(id) on delete cascade,
  invite_id  uuid references public.calendar_share_invites(id),
  created_at timestamptz not null default now(),
  check (user_lo < user_hi),
  unique (user_lo, user_hi)
);
-- RLS：select/delete 限 auth.uid() in (user_lo,user_hi)；insert 不開放（僅 accept RPC）。

create table public.calendar_share_grants (
  share_id  uuid not null references public.calendar_shares(id) on delete cascade,
  owner_id  uuid not null references auth.users(id) on delete cascade,
  kind      text not null check (kind in ('workspace','slot_type')),
  ref_id    uuid not null,
  detail    text not null check (detail in ('full','busy')),
  primary key (share_id, owner_id, kind, ref_id)
);
-- RLS（資安要求「雙重限定」其一）：owner CRUD 自己的 grants，WITH CHECK 子查詢驗
--   ① share_id 屬於 auth.uid() 的關係 ② owner_id = auth.uid()
--   ③ ref_id 確實屬於 auth.uid()（join workspaces / slot_types 驗所有權）。
--   app 層檢查不算數——攻擊者可直打 PostgREST。
-- 對方可 select share 內的列（UI 顯示「對方開了哪些給你」；僅洩 uuid，無法解名）。
```

## 2. RPC（5 支，全套三件套）

| 函式 | 行為要點 |
|---|---|
| `create_share_invite()` | DB 端 `gen_random_bytes(32)` 產 token，只存 sha256，回傳原始 token 一次 |
| `preview_share_invite(token)` | 驗雜湊＋有效 → 回 inviter display_name/avatar。無效/過期/已用/已撤銷**回同一種錯誤**（防當 oracle） |
| `accept_share_invite(token)` | 原子接受：`update … set accepted_by=auth.uid() where token_hash=… and accepted_by is null and …returning`（防併發重放）→ 建 shares（防自接、防重複 pair） |
| `get_share_peers()` | 回自己所有關係＋對方 profile＋雙向 grants 摘要 |
| `get_shared_calendar(peer_id, date_from, date_to)` | 核心，見下 |

**get_shared_calendar 規格（資安＋工程修正後）**：
- 驗證 auth.uid() 與 peer_id 存在關係；事件查詢**同時綁** `user_id = peer_id` AND
  grant 存在（雙重限定其二——縱深防禦，RLS 與 RPC 兩邊都限定）。
- **Default-deny**：只回「比對到已授權類別」的列；孤兒 slot_type（key 改名等）一律不回。
  v1 授權父類型**不含**子類型，逐一明選。
- **欄位白名單（固定形狀，兩種 detail 同形）**：`source('task'|'time_block'), id,
  scheduled_date/date, start_time, end_time, type_key, color, detail, title(nullable)`
  ＋重複欄位：tasks 用實際結構化欄位 `recurrence_type, recurrence_interval,
  recurrence_days_of_week, recurrence_end_date, exdates, parent_id`（**不是**
  `recurrence_rule`——那是 time_blocks 才有的欄位；time_blocks 前端無展開邏輯、
  date 精確比對即完整）。busy 模式 title 回 null。
- **full 模式也只給 title**：description/notes/attendees/location/meeting_url 一律不回
  （meeting_url 是能力憑證、attendees 是第三人個資）。
- 只回**已排時間**的事件（scheduled_date＋時間齊備）；未排程任務不屬於行事曆可用度。
- **重複任務範圍查詢地雷**（工程師抓到，必做）：除 `scheduled_date between` 外，須額外
  回傳「is recurring 且起始 ≤ date_to 且（無結束或結束 ≥ date_from）」的 master 列，
  否則起始日在檢視範圍外的每週重複任務會整個消失。展開沿用前端純函式
  `taskOccursOnDate`（lib/calendar-utils.ts:49，不耦合 use-waddle-data，可重用）。

Profiles：不加 RLS policy，他人名稱只經 `preview_share_invite`／`get_share_peers` 給出。
Token：256-bit、URL fragment（`/share/invite#t=…`，不進 server log）、7 天、單次、可撤銷。

## 3. 邀請流程（端到端）

1. A：設定 →「共享」分頁 →「產生邀請連結」→ 顯示連結＋複製（iOS 系統分享）；
   未接受邀請列表可撤銷。
2. B 開連結 → `/share/invite` 頁。**未登入處理（工程師修正：login 的 `next=` 回跳
   不存在，不能假設）**：invite 頁先把 token 存 sessionStorage 再導 /login，
   登入後回 `/` 時由 invite 流程接手（或 auth-guard 檢查 sessionStorage 導回）。
3. B 看到「{A 名字} 邀請你互相共享行事曆」→ 接受 → 導向設定共享區，提示勾選開放類別。
4. 預設**全部不開放**（安全預設）；雙方各自逐項選 full/busy。
5. 任一方解除 → delete shares（cascade grants）。對方畫面上已載入的資料屬本質殘留
   （等同截圖），UI 文案不承諾「立即從對方畫面消失」，承諾「之後查詢即失效」。
6. **iOS 明定**：邀請連結是 https，iOS 使用者點了走 Safari 網頁版完成接受（app 無
   universal links，deep link 僅 huddle:// auth 用）；app 內設定分頁功能與 web 相同。

## 4. 前端改動（獨立資料路徑，不碰 use-waddle-data.ts）

- 新 hook `hooks/use-calendar-sharing.ts`：peers/grants 管理＋`get_shared_calendar`
  按檢視日期範圍查詢。**不裝新快取套件**（repo 無 SWR/react-query，不為此開先例）；
  手寫快取＋visibilitychange/切視圖 refetch（與 use-waddle-data 同慣例）。
  生效語意：owner 端改動本地立即；viewer 端「切視圖／refocus 後生效」。
- 型別：`database.types.ts` 是手維護檔（Functions 目前是空 Record），5 支 RPC 的
  參數/回傳型別**手補**，不跑 `supabase gen`（會重寫整檔）。全 repo 目前零 `rpc()`
  呼叫，新 hook 是第一個使用者。
- 新頁 `app/share/invite/page.tsx`（static export 相容，純 client）。
- 設定 modal 新「共享」分頁：邀請、待接受、peers、grants 勾選（兩層類別×full/busy）。
- 行事曆疊加——**5 個整合點**（工程師盤點）：week-view、day-scroll-view、
  month-view 桌面、month-view 手機 agenda（獨立渲染路徑）、calendar-header peer chip；
  外加 props 穿線 page→calendar-panel→各視圖。
  作法：peer 事件轉 Task-shaped shim 進既有 `calculateUnifiedColumns` column packing
  （calendar-utils.ts:296-305 有 blocks shim 前例）——**不做純 overlay**（會蓋住
  自己的事件）。樣式：描邊/斜紋＋對方色；busy 顯示類型名；不掛拖曳/編輯 handler。
  `calendar-export-view` 明定**不含** peer 事件。
- onboarding tour：共享功能上線時同步補導覽（既定紀律）；⌘K 入口 P3 順手。
- 手機 390px＋44pt＋safe-area 照 mobile-ux skill；無 server-side 功能（Capacitor 相容）。

## 5. 階段切分與工程量（工程師估計：總計約 7-12 天等級）

| 階段 | 內容 | 量級 | 驗收 |
|---|---|---|---|
| P1 關係建立 | migration 0016＋5 RPC＋邀請頁（含 sessionStorage 登入接手）＋設定共享分頁（邀請/接受/撤銷/peers） | L（3-5 天） | 雙測試帳號 e2e：產生→接受→互見→解除；token 四態同錯誤；anon 打 RPC 全拒；EXECUTE 授權查核 |
| P2 資料共享 | grants UI＋get_shared_calendar＋5 整合點疊加渲染（full/busy） | L（3-5 天） | e2e：A 開 X(full)＋Y(busy) → B 僅見 X/Y、Y 無標題（**驗 JSON 原文**非 UI）；重複任務跨範圍出現；攻擊重演 10 項（下表） |
| P3 打磨 | 手機版、配色、overlay 開關記憶、接受通知 toast、tour/⌘K、文案 | M（1-2 天） | 390px e2e＋截圖 agent 判讀；正式站回歸 |

**P2 上線前攻擊重演清單（資安顧問開列，做成確定性腳本）**：
(1) B 直打 REST 讀 A 十張表→0 列 (2) get_shared_calendar 帶無關係者/自己/亂造 uuid→
空且錯誤形狀一致 (3) busy 回傳驗 JSON 原文無五個敏感欄位 (4) 未 grant 類別＋孤兒
type block 不出現 (5) 直打 insert grant 帶他人 share_id／他人 ref_id→拒 (6) anon 打
5 支 RPC→全拒 (7) token 四態→同一錯誤 (8) 解除後立即重打→空 (9) 同 token 併發
accept→僅一關係 (10) `information_schema.routine_privileges` 查 EXECUTE 只剩
authenticated＋search_path 設定。

安全閘門：P1 開工前設計審查 ✅（本檔即成果）；P2 上線前資安顧問審實作＋攻擊重演。

## 6. 依賴與風險

- **dev 與正式共用同一 Supabase 專案**：套 migration＝動正式 DB → 套用前必問使用者
  （硬底線）。SQL 純新增，不觸既有表。
- **Supabase CLI 憑證過期**：需使用者 `supabase login`；套 0016 前先
  `supabase migration repair` 把 0015 標記已套用（交接檔載明，否則 db push 撞）。
- **第二測試帳號**：互共享 e2e 必需，比照既有測試帳號（SQL 補 email_confirmed_at）。
- 待決（v1 明確不做）：一條連結多人用；父 slot_type 授權涵蓋子類型；universal links。

## 7. 變更紀錄

- **v2.1（2026-07-21，實作 0016 時的 schema 事實修正）**：grants 表的引用欄位由
  `ref_id uuid` 改為 `ref text`——workspace 存 `workspaces.id::text`，slot_type 存
  **`slot_types.key`（不是 uuid）**。原因：實查 schema 發現 ①`time_blocks.type` 存的
  是文字 key；②自訂 slot_types 列在設定儲存時整批刪除重寫、uuid 會翻新（
  use-waddle-data.ts:2362-2398），uuid 引用會讓 grants 變孤兒、共享無聲失效；
  ③內建母類型（'timeblock'、`ws-<uuid>` 偽類型）根本不是資料列（migration 0005 註解）。
  安全性等價：WITH CHECK 仍驗 key 屬於 auth.uid()（`st.key = ref and st.user_id =
  auth.uid()`）、比對用 `w.id::text = ref` 免 cast 錯誤、RPC 查詢時仍 exists 驗 key
  健在（孤兒 default-deny 不變）。另 tasks 直接有 `workspace_id` 欄（不必經
  categories join）、時間欄位實名 `scheduled_start_time/scheduled_end_time`、
  重複任務為結構化四欄＋`exdates jsonb`。0016 已照此實作，尚未套用。
