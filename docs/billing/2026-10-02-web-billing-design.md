# Huddle 網站訂閱（SHOPLINE Payments）設計文件與開工前風險審查

- 日期：2026-10-02　作者：engineer（Claude）　狀態：**草案，待老闆拍板第 0 節決策後開工**
- 分支：feat/web-billing（基準 origin/main 79fd238）
- 依據：`docs/billing/2026-10-02-shopline-api-notes.md`（以下簡稱「SLP 筆記」）、`app/terms/page.tsx`、`app/refunds/page.tsx`、`app/support/page.tsx`、`app/privacy/page.tsx`，以及本文引用的 migration／程式行號（皆以 79fd238 為準，開工時請重核）。
- 本文件只做設計，**沒有寫程式、沒有碰任何資料庫、沒有打任何 SLP API**。文中標 [推測] 的地方，要等 sandbox 實測或 SLP 窗口回覆才能定案。

---

> **決策紀錄（2026-10-02）**：老闆對 D1–D10 回覆「照建議」，全部採用下表建議欄。D7 已由 PR #128（main 62574cf）定案：月繳 NT$150、年繳 NT$990，網站與 App 一致。老闆已向 SLP 窗口確認個人戶可收 SaaS 訂閱、月收款無上限（§9 第 2 題已答）。

## 0. 給老闆的一頁摘要

**要做什麼**：讓客人在 Huddle 網站用信用卡訂閱 Pro。月繳 NT$150／年繳 NT$990，第一次訂閱可以先免費用 2 週（要先綁卡，2 週到了自動扣第一期）。客人在「設定 → 訂閱」可以自己取消續訂、換卡、7 天內申請退款。

**怎麼做（白話）**：
1. 卡號由 SHOPLINE 的付款框直接收，我們只拿到一組「代碼」和卡號末四碼，碰不到完整卡號。
2. 我們的伺服器每 10 分鐘巡一次「今天該扣款的人」，用代碼向 SHOPLINE 請款；成功就寄收據，失敗就寄信通知、7 天內再試最多 3 次。
3. 網站訂閱的資料放在**新的表**，不和 Apple 的訂閱資料混在一起（否則 Apple 那邊一過期，會把網站付費的人也洗成免費）。
4. 全部做在「開關」後面：開關關著時，線上網站、iOS App、現有會員判斷**完全不變**。要等 iOS App 內購先上線、你點頭，才打開。

**對你的影響**：
- 規模：**XL（約 3–4 週工程）**，已拆成 7 個階段（第 8 節），每階段都能單獨合併、開關關著不影響線上。
- 最大不確定：SHOPLINE「沒有人在場的自動扣款」可能被銀行要求 3D 驗證而失敗（SLP 筆記 §1、§5 錯誤碼 4900/4901）。這種情況我們設計了「寄信請客人回網站按一下付款」的補救，但**失敗比例要問 SHOPLINE**（第 9 節問題 3）。
- 月費：寄信服務用 Resend 免費方案 $0（每天上限 100 封，量大再升 $20/月）。

**需要你做的事**：拍板下表 D1–D10；把第 9 節問題清單轉給 SHOPLINE 窗口；第 8 節標「必問」的步驟到時候會再逐一問你。

### 需要老闆拍板（每項：選項 → 建議 → 理由）

| # | 議題 | 選項 | 建議 | 理由 |
|---|---|---|---|---|
| D1 | 寄信服務 | A. Resend 免費方案（$0，3,000 封／月、100 封／天、寄件網域 lazy72.com）<br>B. Resend Pro（US$20／月，5 萬封、無每日上限）<br>C. 不寄信 | **A**，日寄信量接近 80 封再升 B | 條款已承諾收據、年繳續訂前 7 天提醒、扣款失敗通知、漲價通知（0.5 節對照表 T14/T15/T18/T19），**C 等於違約**。同一個 Resend 帳號也能順便解決「Supabase 註冊驗證信 SMTP 未設」的舊問題。你要做：在 lazy72.com 的 DNS 加 3 筆紀錄（SPF／DKIM／回信）；另外要在 Apple 開發者後台登記寄件網域，否則用「隱藏我的 Email」登入的 Apple 用戶**收不到信**（風險 R14）。費用以 resend.com/pricing 2026-10-02 頁面為準。 |
| D2 | 同時有 Apple 與網站訂閱 | A. 擋下：已有有效 Apple 訂閱的人，網站不給買；已有網站訂閱的人，App 購買卡顯示「你已是 Pro」不給買<br>B. 警告後允許<br>C. 不管 | **A** | 條款寫「請不要重複購買，重複了來電退網站那筆」（terms 〈同時有 Apple 訂閱時〉）。擋下最省客訴與退款手續費。App 端只顯示「你已是 Pro」、不提網站、不放連結，不違反 Apple 3.1.1。 |
| D3 | 7 天退款 | A. 自助按鈕，按下即自動退款（第二次以上申請改人工）<br>B. 按鈕只送出申請，你在後台按「核准」才退<br>C. 只接電話 | **A** | 條款承諾「設定→訂閱→申請退款」（refunds 〈七日內全額退款〉），**C 違約**。B 可行但你一個人營運，條款承諾「收到申請隔天起 15 天內完成」，漏看就違約。法律上 7 天內本來就不能拒絕，人工審核擋不了什麼。A 加「同一帳號第二次以上退款轉人工」防「訂→用 6 天→退」循環。 |
| D4 | 試用到期第一次扣款失敗 | A. 比照續訂：7 天寬限、Pro 照用、最多再試 3 次<br>B. Pro 立刻停，7 天內補付可恢復<br>C. 直接結束 | **A** | 條款〈扣款失敗〉寫的是「續訂扣款失敗」，試用轉付費算不算「續訂」有疑義；條款自己寫「有疑義時作有利於消費者的解釋」（terms 〈準據法〉）。A 最安全。代價：卡片有問題的人最多多用 7 天，因為每人只能試用一次，損失有上限。 |
| D5 | 管理後台 | A. 最小版，放在現有營運後台：查某人的訂閱與扣款紀錄、代取消、代退款（含 7 天外一定要退的情形）、暫停扣款（帳號被冒用）、排程最後執行時間與異常清單<br>B. 只用 SHOPLINE 後台＋請工程師查資料庫<br>C. 完整版（報表、匯出、漲價工具） | **A** | 條款承諾電話代取消、帳號被冒用暫停扣款、重複扣款一定退（terms〈帳號與使用安全〉、refunds 第 2 段末），沒有後台按鈕，你只能半夜找工程師。C 的漲價工具留到真的要漲價前再做（第 8 節 P7）。 |
| D6 | 試用到期前提醒信（條款沒承諾） | A. 寄（試用結束前 2 天）<br>B. 不寄 | **A** | 不提醒就扣款是「訂閱糾紛」和信用卡拒付（chargeback）的主要來源；拒付每筆會有額外處理成本（金額要問 SLP）。多寄一封信成本趨近 0。 |
| D7 | 網站價格 | A. 與 App 一致（PR #128 把月繳改 150，尚未合併）<br>B. 網站維持 149 | **A，先決定 App 價格再開工 P3** | 兩邊價格不同，客人會問；條款、官網、收據、SDK 金額都要跟著改。程式會把價格做成設定，不寫死。 |
| D8 | 測試環境 | A. 開一個免費的 Supabase「測試專案」，接 SLP sandbox<br>B. 直接在正式資料庫用白名單測 | **A** | 把測試卡的假交易寫進正式庫，等於讓假資料混進帳務紀錄。Supabase 免費方案可以開 2 個專案，$0。需要你用你的帳號開（或授權我開）。 |
| D9 | 沒試用直接購買的第一筆，7 天內可退嗎 | A. 可以<br>B. 不行（條款字面只寫「試用結束後第一次扣款」） | **A** | 消保法 7 天解除權本來就涵蓋第一次購買；B 有違法風險。 |
| D10 | 月繳↔年繳互換 | A. 第一版不做，客人取消後到期再買，或來電人工處理<br>B. 第一版就做 | **A** | 換方案涉及按比例退費與扣款日重算，會讓範圍再大 M 級。條款沒有承諾這件事。 |

---

## 0.5 條款承諾對照表（逐條兌現）

來源縮寫：T＝`app/terms/page.tsx`、R＝`app/refunds/page.tsx`、S＝`app/support/page.tsx`、P＝`app/privacy/page.tsx`。英文版 `app/en/*` 承諾相同，開賣前改文案時要一起核。「階段」對應第 8 節。

| # | 承諾（摘要） | 出處 | 設計怎麼兌現 | 階段 |
|---|---|---|---|---|
| T1 | 付款前顯示功能、週期、價格、自動續訂、取消方式，由你主動確認 | T〈免費使用與未來訂閱〉 | 購買頁（§5.1）在付款框上方固定顯示上述五項＋「試用結束日 YYYY/MM/DD 將扣 NT$X」；確認按鈕前要勾選同意，沒勾按鈕不能按 | P3 |
| T2 | 免費帳號不會自動轉付費 | 同上 | 只有使用者在購買頁完成綁卡才建立訂閱；沒有其他程式碼會寫 `web_subscriptions` | P1/P3 |
| T3 | 含稅、無其他手續費 | 同上 | SDK 與扣款金額都直接用方案價（分）；不加任何費用欄位 | P2 |
| T4 | 未成年購買需法定代理人同意 | T〈帳號與使用安全〉 | 購買頁同意句加入此提醒（文案待法務審） | P3 |
| T5 | 帳號被冒用，來電後暫停後續付款與續訂 | 同上 | 後台「暫停扣款」＝設 `billing_hold=true`＋`cancel_at_period_end=true`，排程不扣款（§2.2）；冒用期間的扣款依 R9 退 | P5 |
| T6 | 首次在網站開始 Pro 享 2 週試用，需綁卡，試用期不收費，結束後自動扣第一期 | T〈網站購買〉、R〈網站購買：免費試用〉 | CardBind（SLP 固定 1 元授權後自動取消，SLP 筆記 §4）→ `trialing`，`trial_end = 綁卡成功時間 + 14 天`；到期由排程以 Recurring 扣第一期（§2.2） | P2/P4 |
| T7 | 試用期內取消就不扣款 | 同上 | 取消＝`cancel_at_period_end=true`；排程挑選待扣款訂閱時排除此旗標（同一列鎖內判斷，§4.3） | P2/P4 |
| T8 | 每人限一次試用，不論 iOS 或網站；用過的人購買時直接扣款 | 同上 | `web_trial_usage` 記錄網站試用＋Apple 試用（§6）；用過者走 CardBindPayment 當場扣款 | P2/P5 |
| T9 | 只收信用卡、不分期 | T〈網站購買〉 | SDK `paymentMethod: 'CreditCard'`；不開分期參數 | P3 |
| T10 | Huddle 不取得完整卡號；SLP 保存付款資訊 | T〈網站購買〉、P〈訂閱與付款資料〉 | 卡號只進 SLP SDK 的輸入框；我們只存 instrumentId、卡別、發卡國家、末四碼（§1.2 欄位刻意不存有效期限與前 6 碼，因為隱私說明沒列） | P1 |
| T11 | 開通後即可使用 | T〈網站購買〉 | 綁卡成功（試用）或扣款成功（直購）的同一筆交易內寫入 `access_until`，`has_pro` 立即為真 | P1/P2 |
| T12 | 自動續訂直到取消；月繳每月一次、年繳每年一次 | T〈自動續訂〉 | 排程每期扣一次；每期最多一筆成功扣款由資料庫唯一索引保證（§4.3） | P4 |
| T13 | 扣款日＝首次扣款日的同一天；當月沒有這天改月底 | 同上 | 存「錨點時間」，第 k 期扣款時間＝錨點＋(k−1) 個月（或年），**每次都從錨點算、不鏈式累加**，以台北時間計（§2.3） | P2 |
| T14 | 每次扣款成功寄電子收據到帳號 Email | 同上 | 扣款成功的同一個交易內寫入寄信佇列（`web_email_outbox`，去重鍵＝扣款紀錄 ID），排程寄出 | P4 |
| T15 | 年繳續訂前至少 7 天寄信提醒日期與金額 | 同上 | 排程在「下次扣款時間 − 8 天」起排入提醒信（去重鍵＝訂閱＋期數），留 1 天緩衝確保 ≥7 天 | P4 |
| T16 | 設定→訂閱→「取消續訂」線上完成；也可來電代取消 | T〈取消續訂〉、R〈取消續訂〉、S〈訂閱與帳務問題〉 | 設定新分頁「訂閱」（§5.2）；後台「代取消」（D5） | P3/P5 |
| T17 | 取消後不再扣款，Pro 用到已付費期間（或試用期）結束，之後回免費 | 同上 | `access_until` 不動、只設旗標；期末排程把狀態改 `expired`（就算排程掛了，`has_pro` 也會因時間到自動變假，§2.1） | P2/P4 |
| T18 | 續訂扣款失敗：寄信、7 天內最多再試 3 次、期間 Pro 照用、可換卡；7 天後結束、不追收、資料不刪 | T〈扣款失敗〉、R〈續訂扣款失敗〉 | `past_due`、`grace_until = 原扣款時間 + 7 天`、`access_until = grace_until`；重試排在 +1／+3／+6 天；需要 3D 驗證的失敗（4900/4901）不自動重試、改寄「回站補付」信；7 天到 → `expired`，不建立任何欠款紀錄（§2.2） | P4/P5 |
| T19 | 漲價前至少 30 天寄信；只從通知後下一期適用；已付期間不補差額；可在生效前取消 | T〈價格調整〉 | 訂閱列存「本期鎖定價」；漲價工具寫 `next_price_minor`＋`next_price_from` 並寄通知，排程只在「通知後滿 30 天且為新一期」才用新價（§2.2 漲價） | P7（**任何漲價前必須完成**） |
| T20 | Apple 與網站訂閱各自獨立、不互相取消；重複購買來電退網站那筆 | T〈同時有 Apple 訂閱時〉 | D2-A 從源頭擋；漏網的由後台退款（原因 `duplicate`） | P2/P5 |
| T21 | 調整付費條件或停止服務前 30 天通知；停止服務／因嚴重違約終止按未使用天數比例退 | T〈服務更新與內容保存〉 | 後台退款支援指定金額（部分退款，SLP 筆記 §6 推論可行，待問 SLP 第 9 節 Q9）；停服通知用同一寄信佇列。比例計算公式寫在後台工具裡 | P5（比例退款）／P7（群發通知） |
| T22 | 刪除帳號時網站訂閱一併停止續訂、不再扣款；已付期間不退 | T〈帳號刪除〉、R〈刪除帳號與訂閱〉 | `delete-account` 刪人前先呼叫停訂（§2.2 刪除帳號）；扣款中的帳號暫時擋刪除 | P5 |
| R1 | 隨時可取消、不需理由 | R〈取消續訂〉 | 取消原因欄位為選填 | P3 |
| R2 | 請在續訂日前一天結束前取消 | 同上 | 我們做得更寬：扣款前一刻取消都有效（同一列鎖）；扣款已送出才取消 → 本期照常、下期不扣 | P4 |
| R3 | 試用後第一次扣款（月／年）與年繳續訂扣款，7 天內全額退款、免手續費 | R〈七日內全額退款〉 | `web_payment_attempts.cooling_off_eligible` 在扣款成功時決定（首扣、年繳續扣＝真；月繳續扣＝假；D9-A 時直購首扣也＝真） | P5 |
| R4 | 設定→訂閱→「申請退款」或來電 | 同上 | 符合資格時才顯示按鈕並寫出截止時間；後台也能代申請 | P3/P5 |
| R5 | 7 天從付款隔天起算，第 7 天結束前提出 | 同上 | `refund_deadline = (付款日台北日期 + 8 天) 00:00 台北時間`（即第 7 天 23:59:59 結束）；資料庫函式判斷，不信任前端 | P5 |
| R6 | 退回原卡；收到申請隔天起 15 天內完成 | 同上 | SLP refund API 原路退（SLP 筆記 §6）；`web_refunds.due_by` 記期限，後台異常清單列出逾 10 天未完成者 | P5 |
| R7 | 退款完成後該期 Pro 停止，回免費，資料不刪 | 同上 | 退款成功 → 訂閱 `refunded`、`access_until = 退款完成時間`；申請當下就設 `cancel_at_period_end` 防止再扣 | P5 |
| R8 | 超過 7 天不按比例退，可取消用到期末 | 同上 | 按鈕不顯示；取消照 T17 | P3 |
| R9 | 重複扣款、扣錯金額、已取消仍扣、冒用、停止服務 → 一定退 | 同上 | 後台退款不受 7 天限制，原因必選；排程發現「同一期兩筆成功」自動列入異常清單 | P5 |
| P1 | 只處理卡別、發卡國家、末四碼等列舉資料；交易紀錄刪帳號後仍依法保存 | P〈訂閱與付款資料〉 | 只存列舉欄位；扣款／退款／事件表的 `user_id` 用 `on delete set null`，不跟著刪（§1.5） | P1 |
| S1 | 設定→訂閱可管理、取消、換卡 | S〈訂閱與帳務問題〉 | §5.2 | P3/P5 |

**條款以外、開賣前必補（不屬本設計，但不做會違約）**：客服 Email（消保法解除契約書面通知）、營運者本名與地址、條款裡「網站購買目前尚未開放」等字樣（約 21 處，見 HANDOFF 2026-10-01 深夜段）開賣當天要一起改。

---

## 1. 資料模型

### 1.1 設計原則
1. **網站訂閱另開表**，不寫 `billing_entitlements`。理由：`apply_billing_snapshot` 會無條件以 Apple 快照覆寫 `expires_at`（`supabase/migrations/20260920082633_billing_entitlements.sql:36-40`），兩個來源共用一列會互相洗掉。
2. **一個統一函式回答「付費到什麼時候」**：`huddle_ops.paid_until(user)` = `greatest(Apple 的 expires_at, 網站的 access_until)`。Postgres 的 `greatest` 忽略 NULL，所以網站表沒資料時結果與今天完全相同。
3. 所有寫入只走 service_role 呼叫的資料庫函式（同一個 transaction 內完成「冪等判斷＋狀態轉換＋寫寄信佇列」，比照 `apply_billing_snapshot`）。前端只能透過一支 SECURITY DEFINER RPC 讀自己的固定形狀資料（團隊共同記憶 2026-07-21：欄位級隱私走 DEFINER RPC 白名單）。
4. 所有金額存整數「分」（`*_minor integer`），欄位名帶 `_minor`，禁止 numeric/float。

### 1.2 新表（全部在 `public`，RLS 開啟、`revoke all from public, anon, authenticated`、只 `grant all to service_role`）

**web_billing_config**（單列設定，service-only；**不要**加在 `huddle_ops.settings`，因為 dispatch 'self' 會把整列 settings 回給前端：`20260928120000_security_hardening.sql:164` 的 `to_jsonb(s)-'launched_at'`）
- `id boolean pk default true check(id)`
- `checkout_mode text not null default 'off' check in ('off','testers','on')`：新購買開關
- `renewals_enabled boolean not null default false`：排程扣款開關
- `price_monthly_minor integer not null`、`price_annual_minor integer not null`（預設依 D7）
- `trial_days integer not null default 14`
- `auto_refund_limit integer not null default 1`（D3：每帳號自動退款次數上限）
- `runner_lease_until timestamptz`、`runner_last_tick_at timestamptz`（排程租約與心跳，§4.3）

**web_billing_testers**：`user_id uuid pk references auth.users on delete cascade`（`checkout_mode='testers'` 時可購買的名單）

**web_billing_customers**：`user_id uuid pk references auth.users on delete cascade`、`slp_customer_id text unique not null`、`created_at`

**web_payment_methods**
- `id uuid pk`、`user_id uuid references auth.users on delete set null`
- `slp_customer_id text not null`、`slp_instrument_id text not null unique`
- `brand text`、`issuer_country text`、`last4 text check (last4 ~ '^[0-9]{4}$')`（**不存** first6、持卡人、有效期限——隱私說明只列卡別、發卡國家、末四碼）
- `status text check in ('active','disabled')`、`created_at`、`disabled_at`

**web_subscriptions**
- `id uuid pk`、`order_ref text unique not null`（16 碼隨機英數，組 SLP 訂單號用，§4.3）
- `user_id uuid references auth.users on delete set null`
- `plan text check in ('monthly','annual')`
- `status text check in ('incomplete','trialing','active','past_due','expired','refunded','incomplete_expired')`
- `price_minor integer not null`（本期鎖定價）、`currency text default 'TWD' check (currency='TWD')`
- `next_price_minor integer`、`next_price_from timestamptz`、`price_notice_sent_at timestamptz`（漲價，P7 才用）
- `with_trial boolean not null`、`trial_start timestamptz`、`trial_end timestamptz`
- `anchor_at timestamptz`（第一期扣款時間；T13 的「首次扣款日」）
- `cycle integer not null default 0`（已付清的期數；0＝試用或尚未付款）
- `current_period_start timestamptz`、`current_period_end timestamptz`（下次扣款時間）
- `access_until timestamptz`（**唯一給權限判斷用的欄位**，只由轉換函式寫）
- `grace_until timestamptz`、`retry_count smallint default 0`、`next_retry_at timestamptz`
- `needs_customer_action boolean default false`（4900/4901 等需回站補付）
- `cancel_at_period_end boolean default false`、`canceled_at timestamptz`、`cancel_reason text check in ('user','admin','account_deleted','refund','grace_exhausted','duplicate','admin_hold')`
- `billing_hold boolean default false`（冒用暫停，T5）
- `payment_method_id uuid references web_payment_methods`
- `ended_at timestamptz`、`created_at`、`updated_at`
- 約束：`unique (user_id) where status in ('incomplete','trialing','active','past_due')`（每人同時最多一筆進行中訂閱，擋雙擊與並行分頁）

**web_payment_attempts**（每一次向 SLP 請款，含綁卡）
- `id uuid pk`、`subscription_id uuid references web_subscriptions`、`user_id uuid references auth.users on delete set null`
- `kind text check in ('card_bind','first_purchase','recurring','customer_present')`
- `cycle integer not null`（這筆是付第幾期；綁卡為 0）、`attempt_no smallint not null`
- `reference_order_id text unique not null check (char_length(reference_order_id) <= 32)`
- `amount_minor integer not null check (amount_minor >= 0)`、`currency text default 'TWD'`
- `status text check in ('pending','succeeded','failed','unknown')`
- `slp_trade_order_id text unique`、`slp_status text`、`slp_sub_status text`、`failure_code text`、`failure_msg text`
- `cooling_off_eligible boolean not null default false`、`refund_deadline timestamptz`
- `refunded_minor integer not null default 0`
- `created_at`、`finished_at`
- 約束（**防重複扣款的核心**）：
  - `unique (subscription_id, cycle) where status = 'succeeded' and kind <> 'card_bind'`：同一期最多一筆成功
  - `unique (subscription_id, cycle) where status in ('pending','unknown')`：同一期同時最多一筆未決

**web_refunds**
- `id uuid pk`、`payment_attempt_id uuid not null references web_payment_attempts`、`user_id … on delete set null`
- `reference_order_id text unique not null`（退款單號，≤32）
- `amount_minor integer not null check (amount_minor > 0)`
- `reason text check in ('cooling_off','duplicate','wrong_amount','charged_after_cancel','account_compromised','service_discontinued','admin_other')`
- `requested_by text check in ('user','admin')`、`requested_at`、`due_by timestamptz`（R6：申請隔天起 15 天）
- `status text check in ('requested','processing','succeeded','failed','needs_review')`
- `slp_refund_order_id text`、`completed_at`
- 約束：`sum(amount_minor) ≤ 原扣款金額`（以觸發器或函式內檢查）

**web_billing_events**（外部事件去重＋稽核）
- `source text check in ('slp_webhook','cron','user','admin','system')`、`event_id text`、`primary key (source, event_id)`
- `type text`、`reference_order_id text`、`received_at`、`processed_at`、`outcome text`、`payload jsonb`（只存白名單欄位；**不存卡片以外的個資、也不存原始 header**）

**web_trial_usage**：`user_id uuid pk references auth.users on delete cascade`、`source text check in ('web','apple')`、`first_used_at`、`ref text`

**web_email_outbox**
- `id uuid pk`、`user_id … on delete set null`、`kind text check in ('receipt','trial_ending','renewal_reminder','payment_failed','action_required','refund_done','canceled','price_change','service_notice')`
- `dedupe_key text unique not null`、`to_email text not null`（寄出當下的帳號 Email 快照）、`payload jsonb`、`status text check in ('queued','sent','failed','skipped')`、`attempts smallint`、`provider_id text`、`created_at`、`sent_at`

### 1.3 狀態機

```
incomplete ──綁卡成功(有試用)──────────→ trialing
incomplete ──綁卡＋首扣成功(無試用)────→ active
incomplete ──1 小時未完成／綁卡失敗──→ incomplete_expired（終態，不占試用資格）
trialing ──到期首扣成功──────────────→ active
trialing ──到期首扣失敗（D4-A）──────→ past_due
trialing ──已取消且 trial_end 到──────→ expired（終態，cancel_reason=user/admin…）
active ──續扣成功──────────────────────→ active（cycle+1）
active ──續扣失敗──────────────────────→ past_due
active ──已取消且 period_end 到────────→ expired
past_due ──重試或補付成功──────────────→ active
past_due ──grace_until 到仍未付───────→ expired（cancel_reason=grace_exhausted，不追收）
trialing/active/past_due ──退款成功────→ refunded（終態，access_until=退款完成時間）
trialing/active/past_due ──刪除帳號────→ expired（cancel_reason=account_deleted，access_until=now）
```
- 「取消」不是狀態，是 `cancel_at_period_end` 旗標；「恢復續訂」＝在終態之前把旗標設回 false。
- `access_until` 規則（權限只看這欄）：
  - trialing：`trial_end + 1 天`（未取消，留給排程扣款的緩衝）；已取消則 `= trial_end`
  - active：`current_period_end + 1 天`（未取消）；已取消則 `= current_period_end`
  - past_due：`grace_until`
  - 終態：凍結在結束時間（≤ now）
  - 「+1 天」是為了排程延遲或 SLP 慢回應時，客人不會在扣款中途被降成免費。代價：排程完全停擺時，未取消者最多多用 1 天（之後 has_pro 自動變假）。
- **排程掛了也不會「永久免費」或「誤扣」**：權限靠時間戳自然到期；扣款只在排程跑時發生。

### 1.4 統一函式與既有函式的修改（新 migration 以 `create or replace`，不改舊 migration）

新增：
- `huddle_ops.web_paid_until(p_user) returns timestamptz`：`select max(access_until) from web_subscriptions where user_id=p_user`
- `huddle_ops.paid_until(p_user) returns timestamptz`：`greatest((Apple expires_at), huddle_ops.web_paid_until(p_user))`
- 兩者皆 `security definer set search_path=''`、`revoke all from public, anon, authenticated`（比照 `has_pro`）。
- **命名衝突提醒**：dispatch 'self' 回傳的 JSON 鍵 `paid_until` 仍維持「只有 Apple」（iOS 購買卡靠它判斷 Apple 是否已訂閱，見下表），與這支 SQL 函式同名不同義。函式註解要寫清楚；新增鍵 `web_paid_until`。

既有讀 Pro／付費到期的地方，逐一說明：

| 位置 | 現在讀什麼 | 改或不改 | 說明 |
|---|---|---|---|
| `huddle_ops.has_pro`（`20260927120000_task_assignments_orgs.sql:37`） | Apple `expires_at > now()` 或有效贈送 | **改**：第一段換成 `huddle_ops.paid_until(p_user) > now()` | 所有付費功能閘門的源頭 |
| `huddle_ops.plan_allows`／`plan_limits`／`check_insert_quota`／`my_plan_usage.pro`（`20261001200000_pro_limits.sql:40,46,101,304`） | 呼叫 has_pro | 不改 | 隨 has_pro 自動生效 |
| `create_organization`／`get_my_organizations`（被 pro_limits 以文字替換改成 plan_allows，`pro_limits.sql:285-288`） | plan_allows | 不改 | 同上 |
| `meeting_import_limit`、`google_calendar_connect_allowed`（`pro_limits.sql:232,270`，被 `supabase/functions/meeting-import/index.ts:125`、`google-calendar/index.ts:125` 呼叫） | plan_limits／plan_allows | 不改 | 同上 |
| `huddle_ops.pro_until`（`pro_limits.sql:325`） | `greatest(now, 贈送, Apple)` | **改**：Apple 段換 `paid_until` | `days_to_reach`、`grant_early_pro`、`enable_pro_limits` 隨之正確，不改 |
| `huddle_ops.give_days`（`20260925075939_operations_referrals.sql:122`，base 在 :133-135） | 贈送起點＝`greatest(now, 贈送, Apple)` | **改**：Apple 段換 `paid_until` | 否則網站付費期間收到的贈送會和付費期重疊、白白浪費 |
| `huddle_ops.defer_gifts` 觸發器（`operations_referrals.sql:167-179`） | `cursor_at = greatest(now, new.expires_at)` | **改**：`cursor_at = greatest(now, huddle_ops.paid_until(new.user_id))`；並在 `web_subscriptions` 加同一支 `after insert or update of access_until` 觸發器 | 兩張表都有 `user_id`，同一支函式可共用；退款讓 access_until 縮短時也會把贈送往前補位（原邏輯已支援縮短） |
| dispatch `'self'`（`20260928120000_security_hardening.sql:151-172`，鍵在 :165-166） | `paid_until`＝Apple；`pro_until`＝greatest(贈送, Apple) | **改**：`paid_until` 不變（Apple only）；`pro_until` 改 `greatest(贈送, huddle_ops.paid_until(u))`；新增 `web_paid_until` | 會員頁「可使用至」才會包含網站訂閱 |
| dispatch `'admin_revoke'` 補位（`security_hardening.sql:318`） | `cursor_at = greatest(now, Apple)` | **改**：換 `paid_until` | 否則撤銷贈送時會把其他贈送排到網站付費期內 |
| dispatch `'admin_overview'` 的 paid／gifted／converted_trials（`security_hardening.sql:348-353`） | Apple | **改**：以 `paid_until > now()` 計 | 純統計，錯了不影響客人，但老闆看數字會錯 |
| dispatch `'admin_members'` 的 paid_until（`security_hardening.sql:359`） | Apple | **改**：多回一欄 `web_paid_until` | 後台會員列表 |
| dispatch `'admin_coupons'` paid（`security_hardening.sql:375`） | Apple＋observed_at_ms | **暫不改**（P5 再評估） | 優惠碼轉換率統計，網站訂閱需另寫條件；不影響客人 |
| dispatch `'admin_billing'`（`security_hardening.sql:383`） | Apple 列表 | 不改 | 網站列表另做後台頁（D5） |
| `apply_billing_snapshot`（`billing_entitlements.sql:23`） | 只寫 Apple | 不改 | Apple 繼續獨占 `billing_entitlements` |
| 前端 `components/operations/membership.tsx:98,136,139-143` | `pro_until`、`paid_until` | **改（小）**：`pro_until` 已含網站，免改；`paid_until` 那行文案寫「商店…請在購買商店管理」，網站訂閱者要另顯示一行（網頁版才顯示「網站訂閱，下次扣款…」；App 內只顯示「Pro 有效至」，不提網站） | |
| 前端 `components/operations/announcements.tsx:277-278` | `!paid_until` 時提醒「贈送／體驗即將結束」 | **改**：條件加 `!web_paid_until` | 否則網站試用者會收到錯誤的「贈送即將結束」提醒 |
| 前端 `components/operations/admin.tsx:484` | `m.paid_until` | **改**：多顯示網站到期 | |
| `lib/operations/types.ts:33-34,67` | 型別 | **改**：加 `web_paid_until` | |
| `lib/billing/plan-usage*.ts`（`my_plan_usage`） | 伺服器 pro 布林 | 不改 | |
| iOS 購買卡（分支 `origin/feat/ios-iap-paywall-rebased` 的 `components/billing/pro-purchase-card.tsx:45-48,102`） | `paid_until`（Apple）判斷「已訂閱」 | **改（在該分支）**：維持用 Apple `paid_until` 判斷「Apple 已訂閱」；另讀 `web_paid_until`，有效時不顯示購買按鈕、只顯示「你已是 Pro，有效至 X」，不出現網站字樣或連結 | D2-A；若不改，網站訂閱者會在 App 內被引導重複購買 |
| 既有測試 `scripts/tests/billing-database.sql`、`operations-database.sql`、`pro-limits.sql`、`supabase/tests/assignment_rls_checks.sql` | | 不改，必須全數照過 | 網站表空時行為等價 |

**dispatch 的修改方式**：dispatch 是一支 270 行的大函式，只能整支 `create or replace`。做法：先以唯讀方式讀回**正式庫**的 `pg_get_functiondef('huddle_ops.dispatch(text,jsonb)')`，與 `20260928120000_security_hardening.sql:120-391` 比對一致後，複製全文只改上表 5 處；DB 測試斷言「新舊定義的差異行數＝預期」（比照 `pro_limits.sql:285-288` 的防呆寫法）。讀正式庫雖是唯讀，仍照慣例先告知總管。

### 1.5 RLS 與前端讀取
- 所有 `web_*` 表：無 authenticated 表權限（連 SELECT 都不給）。
- 前端唯一讀取口：`public.my_web_billing() returns jsonb`，SECURITY DEFINER，三件套（`revoke from public, anon`＋`grant to authenticated`；第一行斷言 `auth.uid() is not null` 且 `huddle_ops.access_allowed()`；`search_path=''`）。固定形狀：
  `{checkout_available, trial_eligible, apple_active, prices{monthly,annual}, subscription{plan,status,trial_end,current_period_end,cancel_at_period_end,needs_customer_action,grace_until,price_minor}|null, card{brand,last4}|null, payments[≤24]{id,date,amount_minor,status,refundable_until,refunded_minor}, open_refund{status,due_by}|null}`
- 刪除帳號：`web_subscriptions`、`web_payment_attempts`、`web_refunds`、`web_payment_methods`、`web_email_outbox` 的 `user_id` 用 **`on delete set null`**（帳務憑證依隱私說明要保留，P〈訂閱與付款資料〉）；`web_billing_customers`、`web_trial_usage`、`web_billing_testers` 用 cascade。保留年限（建議 5 年，商業會計法第 38 條的憑證保存期）**請會計師確認**，期滿清除排入 P7 之後。
- 注意 `operations_account_active` 限制性 policy 是在 `operations_referrals.sql` 當時對既有表一次性加的，新表不會自動套用；新表本來就沒有 authenticated 權限，所以不需要。

---

## 2. 流程

縮寫：FE＝前端、WB＝Edge Function `web-billing`、WH＝`web-billing-webhook`、CR＝`web-billing-cron`、DB＝資料庫函式（service_role）、SLP＝SHOPLINE Payments。

### 2.1 開始試用（綁卡）
1. FE 呼叫 `my_web_billing()`：確認 `checkout_available`（開關＋白名單＋不在原生 App）、`apple_active=false`（D2-A）、`trial_eligible=true`。
2. FE 動態載入 SLP SDK（只在 `/billing/*` 路由），以 `clientKey`、金額（試用時用 sandbox 安全金額，正式用方案價）、`paymentInstrument.bindCard.enable=true`、`protocol.mustAccept=true`、`textType.subscribeAgreement=true` 初始化。
3. 客人輸入卡號、勾同意 → `payment.createPayment()` 取得 `paySession`。
4. FE → WB `{action:'start', plan, paySession}`（JWT）。
5. WB：驗 JWT 取 user id → DB `web_start_checkout(user, plan)`（鎖此人；檢查開關、無進行中訂閱、Apple 未有效、試用資格；建 `incomplete` 訂閱＋`card_bind` 扣款紀錄，訂單號＝`{prefix}{order_ref}c0000a01`）→ 呼叫 SLP `trade/payment/create`（`paymentBehavior=CardBind`、`savePaymentInstrument=true`、`referenceCustomerId`＝user id 去連字號、`client.ip`＝客人 IP）→ 回 `nextAction`。
6. FE `payment.pay(nextAction)`；需要時 SDK 導去銀行 3D 頁，回 `returnUrl=/billing/return?ref=…`。
7. SLP → WH：`customer.instrument.binded`／`trade.succeeded`。WH 驗簽後**不信任內容**，改呼叫 SLP `payment/get`＋`paymentInstrument/query` 取權威狀態 → DB `web_apply_bind_result`：存 customer、payment method、`trialing`、`trial_start=now`、`trial_end=now+14 天`、`anchor_at=trial_end`、`current_period_end=trial_end`、寫 `web_trial_usage(source='web')`、`access_until=trial_end+1 天`。
8. `/billing/return` 輪詢 WB `status`（最多 60 秒；逾時顯示「處理中，稍後在設定→訂閱查看」）。webhook 晚到時，`status` 動作自己也會以 SLP 查詢補一次（不靠 webhook 才開通）。
9. 失敗或 1 小時未完成 → 排程標 `incomplete_expired`，不占試用資格。

**沒有試用資格（直購）**：步驟 5 改 `paymentBehavior=CardBindPayment`，金額＝方案價；成功即 `active`、`cycle=1`、`anchor_at=付款時間`、`cooling_off_eligible`（D9-A 為真）、寄收據。

### 2.2 其他流程

**試用到期首扣**（CR 每 10 分鐘）
1. DB `web_claim_due(limit 20)`：`select … for update skip locked` 挑 `status in (trialing,active,past_due)`、`not cancel_at_period_end`、`not billing_hold`、`not needs_customer_action`、`renewals_enabled`、到期（`current_period_end <= now()` 或 `next_retry_at <= now()`）、且該期**沒有**成功或未決的扣款紀錄 → 為每筆插入 `pending` 扣款紀錄（`kind=recurring`、`cycle=本期`、`attempt_no=第幾次`）→ commit。
2. CR 對每筆呼叫 SLP Recurring（`autoConfirm=true`、`paymentCustomerId`、`paymentInstrumentId`、金額＝`price_minor`、`referenceOrderId`＝決定性訂單號、`idempotentKey`＝同值）。
3. 同步回應是終態 → DB `web_apply_payment_result`；不是終態或逾時 → 保持 `pending`，交給 webhook 與對帳（§4.3）。
4. 成功：`active`、`cycle+1`、`current_period_start=原到期時間`、`current_period_end=錨點+(cycle) 單位`、`access_until=period_end+1 天`、清空重試、`cooling_off_eligible`（首扣／年繳續扣為真）、`refund_deadline`、寄收據（同一 transaction 入佇列）。
5. 失敗：見下方「扣款失敗」。

**每期續扣**：同上，月繳／年繳一樣；期數由錨點計算，不鏈式累加（§2.3）。

**扣款失敗、重試與寬限**
- 第一次失敗：`past_due`、`grace_until=原到期時間+7 天`、`access_until=grace_until`、`retry_count=0`、`next_retry_at=+1 天`；寄「扣款失敗」信（附更換卡片／立即付款入口）。
- 重試排程：+1、+3、+6 天（共 3 次，全在 7 天內，T18）。
- 失敗碼 4900（需 3D）、4901（需 CVC）、4902（已存卡付款其他錯誤）：SLP 明說無人在場無法完成，且建議停止對該卡發起定期扣款（SLP 筆記 §5）→ 設 `needs_customer_action=true`、**不自動重試**、寄「請回網站完成付款」信。
- 1201（卡片處理中）：5 分鐘後重試，不計入 3 次。
- `grace_until` 到仍未成功 → `expired`、`cancel_reason=grace_exhausted`；寄「訂閱已結束」信；不留欠款。

**補付（客人回站、有人在場）**
1. `/billing/pay`：WB 取 `customerToken`（`customer/token`）→ FE 以 `customerToken` 初始化 SDK（顯示已綁卡）→ `createPayment()` → WB `{action:'pay_now'}` → SLP `QuickPayment`（可走 3D）；或客人改輸入新卡 → `CardBindPayment`（付款同時綁新卡）。
2. 成功 → 同 `web_apply_payment_result`（`kind=customer_present`），補的是**原本那一期**；若綁了新卡，切換訂閱的卡、舊卡解綁（失敗只記錄，後台可重試）。

**取消續訂**：WB `{action:'cancel'}` → DB 鎖列 → `cancel_at_period_end=true`、`canceled_at=now`、`access_until` 依 §1.3 收斂（拿掉 +1 天緩衝）→ 寄取消確認信。若本期已有 `pending` 扣款（極短時間窗），本期照常、下期不扣；若最後仍出現「取消後成功扣款」，列入異常清單並依 R9 退款。

**恢復續訂**：WB `{action:'resume'}` → 只在非終態且 `cancel_at_period_end=true` 時把旗標設回；`access_until` 加回緩衝。已 `expired` 者要重新購買（不再有試用）。

**換卡**：`/billing/card`：WB 建 `CardBind` 交易（同 2.1 步驟 5，但不建新訂閱）→ 綁定成功 → 訂閱改指新卡、`needs_customer_action=false` → 舊卡 `paymentInstrument/unbind`。`past_due` 時換卡完成後頁面直接引導「立即付款」（有人在場的補付，比由排程用新卡無人在場扣款成功率高）。

**7 天退款**
1. 設定→訂閱顯示「申請退款（截止：MM/DD 23:59）」，僅在 `my_web_billing().payments[].refundable_until > now()` 時出現。
2. WB `{action:'refund'}` → DB `web_request_refund`：鎖訂閱；以伺服器時間核對資格（`cooling_off_eligible`、未過 `refund_deadline`、未退過）；建 `web_refunds(requested)`、`due_by=申請日台北隔天+15 天`；設 `cancel_at_period_end=true`（防止再扣）。
3. D3-A：此人自動退款次數 < `auto_refund_limit` → WB 立即呼叫 SLP `refund/create`（退款單號決定性、唯一）；否則 `needs_review`，後台處理。
4. WH 收 `trade.refund.succeeded` 或 `refund.succeeded`（兩種寫法都接，SLP 筆記 §12-1）→ 以 `refund/get` 查證 → DB：退款 `succeeded`、扣款 `refunded_minor` 增加、訂閱 `refunded`、`access_until=now`、解綁卡、寄「退款完成」信。
5. SLP 退款失敗 → `needs_review`，後台異常清單（R6 期限倒數）。

**刪除帳號**（改 `supabase/functions/delete-account/index.ts`，在 `:117` `deleteUser` 之前）
1. DB `web_account_closing(user)`：若有 `pending`／`unknown` 扣款 → 回錯「付款處理中，請 10 分鐘後再試」，**不刪**；否則所有進行中訂閱 → `expired`（`account_deleted`）、`access_until=now`。
2. 對此人所有 active 卡呼叫 SLP `unbind`；失敗只記錄（訂閱已停，不會再扣款），後台可重試。
3. 前端刪除確認框（`components/auth/delete-account-button.tsx`）：若有可退款的扣款，加一行「你仍可在 MM/DD 前申請全額退款，刪除後無法辦理」（R〈刪除帳號與訂閱〉的要求）。
4. 網站表無資料時以上全為 no-op。

**漲價通知**（P7）：後台輸入新價與生效日（工具強制 ≥ 今天+30 天）→ 對每筆進行中訂閱寫 `next_price_minor`、`next_price_from`＝「生效日之後的第一個新週期起點」→ 入佇列寄通知（去重鍵＝訂閱＋新價＋生效日）→ 排程扣款時，若本期起點 ≥ `next_price_from` 且 `price_notice_sent_at` 早於起點 30 天以上，才改用新價並寫回 `price_minor`。通知信寄送失敗的訂閱**不漲**（寧可少收不可違約）。

**續訂提醒信**：年繳：排程每次 tick 挑 `plan='annual'`、未取消、`current_period_end` 在 7–8 天內者 → 入佇列（去重鍵＝訂閱＋期數）。試用結束提醒（D6-A）：`trial_end` 在 2 天內者，內容寫明扣款日與金額、取消方式。月繳續訂：條款未承諾，不寄。

### 2.3 日期與時區規則（T13）
- 台灣無日光節約時間，固定 UTC+8；所有「日期」判斷一律 `at time zone 'Asia/Taipei'`。
- 第 k 期扣款時間＝`(anchor_at at time zone 'Asia/Taipei') + (k-1) * interval '1 month'`（年繳用 `'1 year'`），再轉回 timestamptz。Postgres 加月份會自動夾到月底：1/31 +1 月＝2/28、+2 月＝3/31；2028/2/29 +1 年＝2029/2/28——**必須從錨點算，不可「上期結束 + 1 個月」**（否則 1/31 → 2/28 → 3/28 漂移）。
- 單元測試至少涵蓋：31 號錨點全年 12 期、2/29 年繳、試用結束跨月、台北 23:30／00:30（UTC 前一天）。

---

## 3. Edge Functions

| 名稱 | 職責 | 驗證方式 | 用到的 secret |
|---|---|---|---|
| `web-billing` | 使用者動作：`start`、`status`、`cancel`、`resume`、`card_start`、`pay_now`、`customer_token`、`refund` | Supabase JWT（gateway 驗＋函式內 `auth.getUser` 取 user id）；**user id 一律取自 JWT，body 不收 user id**；檢查 `access_allowed`；每人每分鐘動作次數上限（DB 計數） | `SHOPLINE_API_KEY`、`SHOPLINE_MERCHANT_ID`、`SHOPLINE_API_BASE`、`SHOPLINE_ORDER_PREFIX`、`WEB_BILLING_SITE_URL` |
| `web-billing-webhook` | 收 SLP 事件 → 去重 → 以 SLP 查詢 API 取權威狀態 → 呼叫 DB 轉換函式 | 不驗 JWT（比照 `revenuecat-webhook` 部署方式）；`HMAC-SHA256(timestamp + "." + 原始 body, signKey)` 常數時間比對；`|now − timestamp| ≤ 5 分鐘`；header `merchantId` 必須等於我們的；訂單號前綴不是我們的 → 回 200 忽略（sandbox 共用帳號會收到別人的事件）；body ≤ 100KB；事件 `id` 去重 | `SHOPLINE_WEBHOOK_SIGN_KEY`、`SHOPLINE_API_KEY`、`SHOPLINE_MERCHANT_ID`、`SHOPLINE_ORDER_PREFIX` |
| `web-billing-cron` | 排程 tick：扣款、對帳、狀態到期、提醒入列、寄信佇列、退款狀態追蹤、心跳 | 不驗 JWT；header `x-cron-secret` 與 `WEB_BILLING_CRON_SECRET` 常數時間比對；只接受 POST | 上列 SLP secret＋`RESEND_API_KEY`、`RESEND_FROM_ADDRESS`、`WEB_BILLING_CRON_SECRET` |
| `web-billing-admin` | 後台：查詢、代取消、暫停扣款、代退款（含 7 天外必退與比例退款）、重寄收據、解綁重試 | JWT＋`huddle_ops.admin_users` 檢查（比照 dispatch admin 判斷，`security_hardening.sql:137`）；每個動作寫 `huddle_ops.audit` | 同 `web-billing` |
| `delete-account`（既有） | 刪人前停訂＋解綁 | 既有 JWT | 加 SLP secret |
| `revenuecat-webhook`（既有） | 加記錄 Apple 試用（§6） | 既有 | 不變 |

程式結構比照 `supabase/functions/revenuecat-webhook/core.mjs`：
- `supabase/functions/_shared/web-billing/core.mjs`：純 JS（驗簽、時間窗、訂單號編碼、日期計算、SLP 錯誤碼對照、金額換算、狀態機轉換表），可用 `node --test` 測。
- 各 `index.ts` 只負責讀 env、組 fetch、呼叫 core。
- secret 缺任何一個 → 回 503（比照 `revenuecat-webhook/core.mjs:35`），並且 DB 開關沒開 → 回 503／no-op。
- 所有對 SLP 的請求：`requestId`＝去連字號 UUID（32 碼）；10 秒逾時；log 不印 apiKey、不印完整 SLP 回應（只印 code／訂單號）。

---

## 4. 排程

### 4.1 做法
- 啟用 Supabase 的 `pg_cron`、`pg_net` extension（**正式庫啟用 extension 屬必問**）。
- 排程密鑰存 Supabase Vault：`select vault.create_secret('<隨機值>', 'web_billing_cron_secret')`——**由人在 SQL editor 執行，不寫進 migration／git**；Edge Function 端設同值的 `WEB_BILLING_CRON_SECRET`。
- 排程 SQL（官方做法：pg_cron 呼叫 `net.http_post`，認證值從 `vault.decrypted_secrets` 讀，來源 supabase.com/docs/guides/functions/schedule-functions，2026-10-02 讀取）：
  ```sql
  select cron.schedule('web-billing-tick', '*/10 * * * *', $$
    select net.http_post(
      url := 'https://<project>.supabase.co/functions/v1/web-billing-cron',
      headers := jsonb_build_object('Content-Type','application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'web_billing_cron_secret')),
      body := '{"job":"tick"}'::jsonb,
      timeout_milliseconds := 5000);
  $$);
  ```
- `pg_net` 是非同步、不重試；漏一次沒關係，下一個 tick 會補（所有工作都是「掃描待辦」而非「事件驅動」）。

### 4.2 頻率與每次 tick 的工作（依序、各自有上限）
1. 取租約（4.3）；失敗即結束。
2. 對帳：`pending` 超過 15 分鐘的扣款 → 有 `tradeOrderId` 就 `payment/get` 查；沒有（建立交易時逾時）→ 標 `unknown`，**不重試、不新增扣款**，等 webhook（最長約 2 天的重送週期）；超過 24 小時仍 unknown → 列入後台異常清單人工處理。
3. 扣款：`web_claim_due(20)`。
4. 狀態到期：已取消且期末、`grace_until` 到、`incomplete` 逾 1 小時 → 改終態（純標籤，權限早已靠 access_until 自然到期）。
5. 提醒入列：年繳 7–8 天前、試用 2 天前。
6. 退款追蹤：`processing` 的退款查 `refund/get`。
7. 寄信佇列：每次最多 30 封（Resend 免費方案每日 100 封，D1）；失敗最多重試 5 次後標 `failed` 進異常清單。
8. 寫心跳 `runner_last_tick_at`、釋放租約。
- Edge Function 牆鐘上限：免費方案 150 秒、付費 400 秒（supabase.com/docs/guides/functions/limits，2026-10-02 讀取）。每批上限＋每次 SLP 呼叫 10 秒逾時，最壞 20×10 秒＝200 秒會超過免費方案 → **扣款每 tick 上限 10 筆並設 120 秒總時限，時間到就停、剩下的下個 tick 做**。專案是免費或付費方案，開工時查（不確定）。
- 監控：後台顯示 `runner_last_tick_at`；超過 1 小時沒 tick → 後台紅字（第一版不做推播）。

### 4.3 防重複扣款與鎖
三層，任何一層單獨失效都不會重複扣款：
1. **租約**：`update web_billing_config set runner_lease_until = now()+interval '5 minutes' where runner_lease_until is null or runner_lease_until < now() returning true`——拿不到就不跑。不用 advisory lock，因為經 PostgREST 的連線是 pooled、鎖撐不過多次 HTTP 呼叫。
2. **資料庫唯一約束**：同一期最多一筆成功、最多一筆未決（§1.2 `web_payment_attempts` 約束）。claim 在同一 transaction 內 `for update skip locked` 鎖訂閱列並插入 `pending` 列，兩個 tick 同時跑也只有一個插得進去。
3. **決定性訂單號**：`referenceOrderId = {prefix 2 碼}{order_ref 16 碼}c{期數 4 碼}a{次數 2 碼}`（共 25 碼 ≤ 32）。同一筆扣款紀錄重送時用同一個號碼，SLP 若照預期回 1001「Order exist」就不會重扣（[推測]，SLP 筆記 §5，第 9 節 Q5 要問）。`prefix`：正式 `hp`、sandbox `hs`，webhook 依前綴過濾別人的事件。
- 「冪等鍵＝訂閱 ID＋週期」由約束 2 實現；重試同一期需要新的 SLP 訂單號（`attempt_no` 遞增），因為 SLP 不保證失敗單號可重用。
- 未決（`pending`／`unknown`）存在時，該期**絕不**再發新扣款。寧可漏扣（客人多用幾天，後台人工補），不可重扣。

---

## 5. 前端

### 5.1 路由與元件（全部在 `NEXT_PUBLIC_WEB_BILLING_ENABLED==='true'` 且非原生時才有內容）
- `/billing`：購買頁。選方案、顯示 T1 必要資訊、試用資格與扣款日、同意勾選、SLP 付款框。
- `/billing/return`：3D 驗證回來後的等待頁（輪詢 `status`）。
- `/billing/card`：換卡。
- `/billing/pay`：補付（past_due）。
- 為什麼 SDK 不放在設定 modal 裡：設定是主程式頁上的 modal，要放 SDK 就得把全站 CSP 放寬；集中在 `/billing/*` 可以只對這幾頁放寬（5.3）。設定→訂閱只放狀態與按鈕，需要輸入卡片時導到 `/billing/*`。
- 原生 App 防線（Apple 3.1.1）：`/billing/*` 頁面 client-only 渲染，`isNative()`（`lib/platform`）為真時直接導回首頁、不輸出任何購買文字；App 內任何地方不放連到 `/billing` 的連結；`WebOnly`（`components/legal/web-only.tsx`）包住所有網站購買相關文案。驗收要跑 `pnpm build:cap` 後在 `out/` 內 grep 購買關鍵字＋iOS 模擬器實點。
- 入口：官網價格卡與會員頁加「開始免費試用」按鈕（WebOnly＋旗標）。

### 5.2 設定 → 訂閱
- `components/modals/settings-modal.tsx:103` 的 `SettingsTab` 加 `'subscription'`，分頁只在網頁版＋旗標開啟時出現（條款路徑「設定→訂閱」）。
- 內容：方案、狀態（試用中／使用中／付款失敗／已取消將於 X 結束）、下次扣款日與金額、卡別末四碼；按鈕：取消續訂、恢復續訂、更換信用卡、立即付款（past_due）、申請退款（符合資格才出現，寫截止時間）；扣款紀錄列表（日期、金額、狀態、已退金額）。
- 已有 Apple 訂閱者：只顯示「你的 Pro 透過 Apple 訂閱，請在 iPhone 設定管理」（網頁版文案，對應 S〈訂閱與帳務問題〉）。
- 新分頁元件抽成獨立檔（例如 `components/billing/web-subscription-tab.tsx`），不要再把 2,388 行的 settings-modal 撐大。

### 5.3 CSP（`next.config.mjs:35-49`；只套用在網頁版，Capacitor 靜態匯出不受影響，見 `next.config.mjs:68-78`）
- **不改全站 CSP**。在 `headers()` 新增 `source: '/billing/:path*'` 一組較寬的 CSP（Next.js 多條規則同 key 時後者覆蓋，順序要實測）：
  - `script-src` 加 `https://cdn.shoplinepayments.com`
  - `connect-src`、`frame-src` 加 SLP 網域（確切網域 [推測] `*.shoplinepayments.com`，sandbox 實測後收斂）
  - `form-action`：3D 驗證常用「自動送出表單 POST 到發卡行網址」，發卡行網域無法列舉；若實測被擋，只能在 `/billing/*` 放寬為 `form-action 'self' https:`。這是本設計最可能卡關的地方（風險 R10）。
- SDK 用 CDN 動態載入、只在 `/billing/*`，**不裝** npm `@shoplinepayments/payment-web`（不新增依賴；若日後要改用 npm 版，需先回報）。

### 5.4 i18n
- 所有新文案走 `t()`，字典放 `lib/i18n/dict/billing.ts`（既有檔）；驗收切 English 無殘留中文（專案慣例）。
- SDK `language` 跟隨介面語言。
- 寄信內容：第一版一封信內「繁中在上、英文在下」，因為目前沒有可靠的「使用者偏好語言」伺服器欄位（不確定，開工時查）。

---

## 6. 一人一次試用

- 網站試用：綁卡成功時寫 `web_trial_usage(source='web')`（與轉 `trialing` 同一 transaction）。
- Apple 試用：RevenueCat webhook 事件有 `period_type`（`TRIAL`／`INTRO`／`NORMAL`／`PROMOTIONAL`／`PREPAID`，來源 revenuecat.com/docs/integrations/webhooks/event-types-and-fields，2026-10-02 讀取）。在 `supabase/functions/revenuecat-webhook/core.mjs` 對 `period_type in ('TRIAL','INTRO')` 且為正式環境的事件，對 `subscriberIds(event)` 的每個 user id 寫 `web_trial_usage(source='apple')`（`on conflict do nothing`，與 `apply_billing_snapshot` 同一個 RPC 交易）。
- **限制（要老闆知道）**：
  1. 只能記到「上線這段程式之後」發生的 Apple 試用。iOS 內購尚未上線，所以只要**這段改動跟 iOS 內購同時或更早上線**，就不會漏。若 iOS 先上線，之前的試用者只能靠 RevenueCat 後台匯出補登。
  2. 反方向擋不住：用過網站試用的人，Apple 仍可能依 Apple ID 給他 App 試用（Apple 決定，我們無法關閉）。對消費者有利，不違約，只是少收一點。
  3. 同一人換新 Huddle 帳號（或刪帳號重辦）可以再試用一次；同卡綁多帳號是否能辨識要問 SLP（第 9 節 Q16）。
  4. 營運系統的「新戶體驗」贈送（`huddle_ops.grants` source=`trial`，`security_hardening.sql:159`）**不算**用過試用——那是贈送，不是付費試用。

---

## 7. 開工前風險審查

嚴重度：高＝可能錯扣錢、違約或打壞線上；中＝功能失效但可補救；低＝體驗或統計問題。

| # | 風險 | 嚴重度 | 具體失敗情境 | 對策 |
|---|---|---|---|---|
| R1 | 無人在場扣款被要求 3D／CVC | 高 | 試用到期，發卡行回 4900，客人沒看信，7 天後訂閱結束，營收流失；客人以為還在訂 | 補付流程（§2.2）；失敗信＋站內橫幅；事前問 SLP 失敗率與 MIT 豁免（Q3）；sandbox 用 3 的倍數金額測 3D 路徑 |
| R2 | 重複扣款 | 高 | 排程 tick 重疊、或 SLP 回應逾時後下一 tick 又發一次，同一期扣兩次 | §4.3 三層防線；unknown 不重試；每日檢查「同期兩筆成功」進異常清單；R9 一定退 |
| R3 | 漏扣／永久免費 | 中 | 排程停擺，`access_until` 不再延長 | 權限靠時間戳自然到期（最多多 1 天）；心跳監控；漏扣不追收（條款也不追收） |
| R4 | 改 has_pro／dispatch 打壞既有 Pro 判斷 | 高 | 複製 dispatch 時漏一行，正式站會員頁或後台壞掉；或 has_pro 寫錯讓所有人變 Pro／變免費 | 正式庫函式定義讀回比對；DB 測試斷言差異行數；網站表空時的等價測試（固定一組使用者，新舊函式結果逐一相等）；既有 4 份 DB 測試全過 |
| R5 | iOS 購買卡誤判 | 高 | 網站訂閱者在 App 看到購買按鈕而重複購買；或若把網站混進 `paid_until`，App 顯示「已訂閱、請到 Apple 管理」但 Apple 根本沒訂閱 | `paid_until` 鍵維持 Apple only；新增 `web_paid_until`；iOS 分支改購買卡（§1.4 表） |
| R6 | Webhook 偽造／重放 | 高 | 攻擊者 POST 假的 `trade.succeeded` 讓自己免費開通；或重送舊事件 | HMAC＋5 分鐘時間窗＋事件 id 去重；更重要的是**不信任 payload，一律回查 SLP**，所以就算簽章金鑰外洩也偽造不出成功付款 |
| R7 | 越權 | 高 | A 用 B 的訂閱 id 呼叫取消／退款 | user id 只取自 JWT；DB 函式以 `user_id = 呼叫者` 為條件；表無 authenticated 權限；RLS 測試 |
| R8 | 金鑰外洩 | 高 | `SHOPLINE_API_KEY` 進前端 bundle 或 log → 他人可對我們的客人扣款／退款 | 只放 Edge Function secret；前端只有可公開的 `clientKey`；CI grep bundle 不得出現 apiKey 前綴；log 白名單 |
| R9 | 金額單位錯 | 高 | 寫成 150 而不是 15000，扣 NT$1.50；或 ×100 兩次扣 NT$15,000 | 欄位一律 `_minor`；core.mjs 單一換算函式＋測試；DB check `amount_minor in (價格表值)`；sandbox 對帳 |
| R10 | CSP 擋 3D 驗證或 SDK | 中 | 正式站 3D 跳轉被 `form-action 'self'` 擋，客人卡在付款中 | `/billing/*` 專屬 CSP；sandbox 用 3 的倍數金額實測 3D；上線後以 console CSP 錯誤數為驗收項（lessons 2026-09-28） |
| R11 | 時區錯 | 中 | 用 UTC 算錨點日，台北 00:30 開始試用的人扣款日差一天；31 號錨點漂移成 28 號 | §2.3 規則＋邊界測試 |
| R12 | sandbox 共用帳號 | 中 | 共用特店的 webhook URL 被別人改掉，收不到事件或收到別人的事件；共用帳號沒開通 Recurring，根本無法測 | 前綴過濾；`status` 動作與排程都會主動查詢不依賴 webhook；問 SLP 能否給專屬沙盒（Q7） |
| R13 | 無固定出口 IP | 中 | SLP 要求 API IP 白名單，或 `client.ip` 需固定，Supabase Edge Function 沒有固定 IP | 問 SLP（Q4）；若必須白名單，需加一台固定 IP 代理（另議，成本 M＋月費） |
| R14 | 信件寄不到 | 中 | 用 Apple「隱藏我的 Email」登入的人，信被 Apple 轉寄服務擋下 → 收不到收據、提醒、失敗通知，等於違約 | Apple Developer 後台登記寄件網域與寄件地址（老闆操作）；lazy72.com 設 SPF／DKIM／DMARC；sandbox 寄到測試信箱實收 |
| R15 | 刪帳號抹掉帳務紀錄 | 中 | 直接 `on delete cascade`，刪帳號後扣款紀錄消失，之後拒付或稅務查核無憑證 | §1.5 `on delete set null`；DB 測試刪人後紀錄仍在 |
| R16 | 取消與扣款競態 | 中 | 客人在扣款送出那一秒按取消，結果被扣款 | 同列鎖；已送出則本期有效；仍發生則列異常並依 R9 退 |
| R17 | 退款濫用 | 低 | 同一人反覆「訂→用 6 天→退」 | D3：第二次起人工；每次都沒有試用（試用只有一次） |
| R18 | 排程超時 | 中 | 免費方案 150 秒上限，一批扣款太多被砍，紀錄停在 pending | 每 tick 上限＋總時限；pending 由對帳處理 |
| R19 | 隱私說明不符 | 低 | 為了「卡片快到期提醒」存了有效期限，但隱私說明沒列 | 第一版不存；要做先改隱私說明 |
| R20 | 價格不一致 | 中 | 網站 149、App 150；收據、條款、SDK 金額各說各話 | D7；價格只放 `web_billing_config` 一處 |
| R21 | 稅務門檻 | 中（非技術） | 年繳 990 讓某月營收衝過 5 萬，需立即辦稅籍、公開統編；收據格式可能要改 | 交給會計師（HANDOFF 2026-10-01 地雷 ③）；收據模板可改 |
| R22 | 網站先於 App 開賣 | 高（審查） | Apple 3.1.3(b)：App 解鎖網站買的 Pro，前提是 App 內也能買；網站先開會讓 App 審查出問題 | `checkout_mode` 只在 iOS 內購上線後才開（P6 前置條件） |
| R23 | Scope 膨脹 | 中 | 邊做邊加「換方案、優惠碼折抵、發票」，時程失控 | D10 第一版不做換方案；優惠碼與發票明列不在本範圍 |

**測試策略**
- 單元（`node --test scripts/tests/web-billing-*.test.mjs`）：驗簽（自造向量＋SLP 實際 webhook 樣本）、時間窗、訂單號（≤32、決定性、前綴）、日期（§2.3 清單）、退款截止、狀態轉換表、錯誤碼對照、金額換算。
- DB（新增 `scripts/tests/web-billing-database.sh`，照 `billing-database.sh` 用拋棄式本機 PG，**不讀任何專案連線字串**）：所有 migration 依序套用；網站表空時 `has_pro`／`pro_until`／`give_days`／`defer_gifts`／dispatch 與改前等價；RLS（他人讀不到、client 不能寫）；兩個 session 同時 claim 不會產生兩筆 pending；同期兩筆成功被唯一約束擋下；webhook 重放冪等；刪人後帳務紀錄保留；開關關閉時 claim 回 0 筆；既有 4 份 DB 測試照跑。
- Sandbox E2E（在 D8 的測試專案）：Playwright 跑購買頁（Visa／MC／JCB 測試卡、3D 成功／失敗、非 3D 失敗用偶數金額）；排程用「測試專用時間平移」（只在 `SHOPLINE_API_BASE` 為 sandbox 時允許的 DB 函式，把 `trial_end` 拉到現在）測首扣、失敗、重試、寬限結束、退款；寄信寄到測試信箱實收。
- sandbox 限制：共用帳號、webhook 可能被覆蓋、「3 的倍數」規則以元或分計不確定、Recurring 是否已開通未知 → 這些測不到的部分，P6 用老闆本人真卡在正式環境實刷 NT$150＋立刻退款收尾。

**回滾**
- 前端：`NEXT_PUBLIC_WEB_BILLING_ENABLED` 移除即隱藏全部入口（需重新部署）。
- 伺服器：`checkout_mode='off'` 立即停新購買；`renewals_enabled=false` 停扣款（不需部署）。
- 排程：`select cron.unschedule('web-billing-tick')`。
- Migration：每支附 `supabase/rollback/<同名>_down.sql`（恢復 has_pro／pro_until／give_days／defer_gifts／dispatch 的舊定義、drop 新觸發器；新表保留不刪，避免帳務資料遺失）；DB 測試要跑「up → down → 與原定義逐字比對」。
- **已有付費客人後才回滾**是商業決定：要嘛繼續扣款到客人自行取消，要嘛全部取消並按比例退款＋30 天通知（T21）。屆時必問老闆。

---

## 8. 分階段施工計畫

每階段一個 PR、可獨立合併。「線上行為不變」的論證寫在每階段的驗收條件裡。

| 階段 | 內容 | 規模／最大不確定 | 驗收條件 | 必問老闆／正式環境操作 |
|---|---|---|---|---|
| P0 | 本文件拍板；SLP 問題送出；開測試 Supabase 專案；Resend 帳號與 DNS | S／SLP 回覆時間 | D1–D10 有答案；SLP 至少回 Q1–Q5 | 開專案、DNS、Resend 註冊都是老闆帳號操作 |
| P1 | DB：新表、`paid_until`、改 has_pro／pro_until／give_days／defer_gifts／dispatch、`my_web_billing`、config 預設全關、rollback 檔、DB 測試 | L／正式庫 dispatch 定義是否與 repo 一致 | 新舊 4 份 DB 測試全過；等價測試通過；up/down/up 逐字比對通過；`tsc` 0（前端型別加欄位） | **套用到正式庫必問**（套用前印 DB host／project ref 核對身分，lessons 2026-07-29）。網站表空，線上行為不變；'self' 只多一個值為 null 的鍵 |
| P2 | Edge Functions `web-billing`、`web-billing-webhook`＋core.mjs＋單元測試；只部署到測試專案 | L／SLP Recurring 必填欄位與回應格式 | 單元測試全過；測試專案以 sandbox 卡完成綁卡→trialing、直購→active；webhook 驗簽用真實 sandbox 事件通過 | 無（只碰測試專案）。正式部署留到 P6 |
| P3 | 前端 `/billing/*`、設定→訂閱分頁、`/billing` 專屬 CSP、i18n、原生防線、會員頁／公告／後台小改 | L／CSP 與 3D 跳轉 | 旗標關：Playwright 對主要頁面截圖與改前比對無差異，`/billing` 顯示不可用；旗標開（測試專案）：390px 與桌面完成購買、English 無中文殘留；`build:cap` 的 `out/` 無購買文字 | **合併上線必問**（旗標關，`/billing` 只顯示不可用、CSP 只影響該路由） |
| P4 | `web-billing-cron`、pg_cron／pg_net（測試專案）、扣款／重試／寬限／對帳、寄信佇列＋Resend、收據與提醒信 | L／pg_net＋Vault 實際行為、Resend 網域驗證 | 時間平移跑完：首扣成功、首扣失敗→寬限→重試成功、寬限結束、取消後不扣、兩 tick 並行不重扣；信件實收 | 無（測試專案） |
| P5 | 退款（自助＋後台）、換卡、補付、刪除帳號整合、後台最小版、RevenueCat 記錄 Apple 試用、iOS 購買卡隱藏 | L／SLP 退款事件格式、部分退款 | 7 天內退款成功、第 8 天按鈕消失、退款後 Pro 停；刪帳號時訂閱停＋紀錄保留；冒用暫停後不扣；iOS 分支網站訂閱者看不到購買按鈕 | `delete-account`、`revenuecat-webhook` 部署到正式**必問**（網站表空時為 no-op） |
| P6 | 上線：SLP 正式特店開通綁卡／Recurring、正式 secret、webhook URL 登記、Apple 隱私轉寄登記、正式庫啟用 pg_cron/pg_net＋Vault＋排程、條款「尚未開放」字樣改版、`checkout_mode='testers'` → 老闆真卡實刷＋退款 → `'on'` | M／SLP 開通時程 | 前置：**iOS 內購已上線**（R22）；老闆真卡完成：試用綁卡、手動平移後首扣、收到收據、申請退款、收到退款信；正式站 `/billing` console 無 CSP 錯誤 | **全部必問**：每一步都是正式環境、金流或對外 |
| P7 | 漲價工具、比例退款計算、帳務紀錄保存期清除、群發服務通知 | M／會計師對保存年限的答覆 | 漲價：通知不足 30 天的訂閱不漲（測試） | 任何漲價前必須完成；執行漲價必問 |

總規模：XL（約 3–4 週）。最大不確定：SLP 正式特店的綁卡／Recurring 開通時程與無人在場扣款失敗率。

---

## 9. 待向 SLP 窗口確認的問題（老闆可直接轉貼）

> 您好，我們是 Huddle（個人經營者），準備用 SHOPLINE Payments 內嵌式付款做網站訂閱（月繳 NT$150／年繳 NT$990，2 週免費試用需綁卡，試用結束自動扣款）。想請教以下問題：
>
> 1. 我們的特店要怎麼開通「綁卡」與「定期扣款（Recurring）」？需要另外簽約或審核嗎？大約多久？
> 2. 個人戶（非公司）可以使用綁卡與定期扣款嗎？
> 3. 定期扣款（持卡人不在場）被發卡行要求 3D 驗證或 CVC（錯誤碼 4900／4901）的情況常見嗎？綁卡時如果已做過 3D 驗證，之後的定期扣款是否會被視為商店發起交易而免 3D？
> 4. API 呼叫是否需要 IP 白名單？定期扣款的 `client.ip` 應該填什麼？我們的伺服器在雲端，沒有固定 IP。
> 5. 建立交易時如果網路逾時、沒拿到 tradeOrderId，可以用我們的 referenceOrderId 查詢結果嗎？同一個 referenceOrderId 重送會發生什麼事（回 1001 嗎）？`idempotentKey` 的作用與有效期？
> 6. 定期扣款的建立交易回應，是否一定是最終結果？status／subStatus 的完整列表可以提供嗎？
> 7. 沙盒共用特店帳號是否已開通綁卡與定期扣款？webhook 網址是否共用、會被其他開發者覆蓋？可否申請我們專屬的沙盒帳號？
> 8. Webhook 簽章 `sign` 是小寫十六進位字串嗎？timestamp 建議容許多少誤差？
> 9. 退款：可以部分退款嗎？退款時原交易的手續費會退還嗎？退款多久會回到持卡人帳上？退款失敗的常見原因？
> 10. 綁卡的 1 元授權，持卡人會收到簡訊或在帳單看到嗎？綁卡是否一定會走 3D 驗證？
> 11. 卡片到期或換發時，是否有卡號自動更新服務？付款工具狀態改變時會發 `customer.instrument.updated` 嗎？
> 12. 定期扣款時，`order`、`billing`、`shipping`、`returnUrl` 這些欄位是否必填？我們是線上服務沒有寄送，shipping 該怎麼填？
> 13. 持卡人拒付（chargeback）的通知方式與處理流程？每筆拒付是否另收費用？
> 14. API 速率限制是多少？
> 15. 持卡人帳單上顯示的商店名稱是什麼？可以設定成「HUDDLE」嗎？
> 16. 同一張卡綁在多個會員帳號是否允許？是否提供可辨識同一張卡的識別碼（用於限制每人一次試用）？
> 17. 沙盒「金額為 3 的倍數走 3D」的規則，是以「元」還是「分」計算？
> 18. 年繳 NT$990 一次扣款、月繳 NT$150，金額上有沒有限制？
> 19. `customerToken` 的有效期多久？
> 20. 網站上是否需要放特定的「定期扣款代扣協議」文字？SDK 顯示的 subscribeAgreement 文字內容是什麼？
> 21. 未來如需開立電子發票，SHOPLINE Payments 有沒有合作方案？
>
> 謝謝！

---

## 10. 不確定之處（開工前要補）
- SLP 文件矛盾（SLP 筆記 §12）與第 9 節問題的答案，會影響 §2 的事件名稱、§4.3 的重送行為、§5.3 的 CSP 網域。
- Supabase 專案是免費或付費方案（影響 Edge Function 時限與 pg_cron 用量）——未查。
- 使用者偏好語言是否有伺服器端欄位——未查，暫定雙語同封。
- 帳務紀錄保存年限（建議 5 年）——要問會計師。
- Next.js `headers()` 多規則覆蓋順序對 CSP 的實際效果——要實測。
- `delete-account` 實際錯誤處理與前端提示的接法——P5 時讀全檔再定。
