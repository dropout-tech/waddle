# 網站訂閱：模組間介面合約（P2–P5 平行施工用）

依據：`2026-10-02-web-billing-design.md`（下稱「設計」）。本檔只定「誰提供什麼、長什麼樣」，
行為細節以設計為準。要改本檔的介面，必須同時改所有使用方。

## 0. 分工與檔案歸屬

| 模組 | 擁有的檔案 | 不可碰 |
|---|---|---|
| 伺服器／扣款（A） | `supabase/migrations/20261002230300_web_billing_transitions.sql`（＋rollback）、`supabase/functions/_shared/web-billing/core.mjs`、`slp.mjs`、`web-billing/`、`web-billing-webhook/`、`web-billing-cron/`、`scripts/tests/web-billing-transitions.*`、`supabase/functions/_shared/web-billing/*.test.mjs`（core／slp 的） | 前端、`email.mjs`、寄信 migration |
| 寄信／提醒（C） | `supabase/migrations/20261002230200_web_billing_email.sql`（＋rollback）、`supabase/functions/_shared/web-billing/email.mjs`、`email.test.mjs`、`scripts/tests/web-billing-email.*` | 扣款邏輯、前端、`core.mjs` |
| 前端（B） | `app/billing/**`、`components/billing/**`、`lib/billing/web-billing-client.ts`、`lib/i18n/dict/billing.ts`（只加鍵）、`components/modals/settings-modal.tsx`（只加分頁接線）、`next.config.mjs`（只加 `/billing/:path*` CSP） | `supabase/**` |

migration 順序：P1 `20261002230100` → C `20261002230200` → A `20261002230300`。
A 的 migration 可呼叫 C 的函式；C 的 migration 只依賴 P1。

## 1. Edge Function `web-billing`（A 提供，B 使用）

- 呼叫：`supabase.functions.invoke('web-billing', { body: { action, ...params } })`，帶使用者 JWT。
- 回應一律 JSON：成功 `{ ok: true, ...data }`；失敗 HTTP 4xx/5xx＋`{ ok: false, error: <code> }`。
- 錯誤碼（B 必須逐一有雙語文案）：`unauthorized`、`disabled`（開關關／不在白名單）、`native_not_allowed`、
  `apple_active`、`already_subscribed`、`trial_used`、`not_found`、`not_refundable`、`payment_in_progress`、
  `rate_limited`、`slp_error`、`invalid_input`、`unavailable`（缺 secret／503）。

| action | 請求參數 | 成功回應（`ok:true` 之外的欄位） |
|---|---|---|
| `status` | — | `billing`：與 `my_web_billing()` 相同結構；若有未決綁卡／付款，會先向 SLP 查一次再回 |
| `start` | `plan: 'monthly'\|'annual'`、`paySession: string`、`locale: 'zh-TW'\|'en'` | `subscription_id`、`next_action: string\|null`（交給 SDK `payment.pay()`；null＝已完成） |
| `card_start` | `paySession`、`locale` | `next_action` |
| `customer_token` | — | `customer_token`、`expires_at`（ISO） |
| `pay_now` | `paySession`、`locale` | `next_action` |
| `cancel` | — | `billing` |
| `resume` | — | `billing` |
| `refund` | `payment_id: uuid` | `refund_status: 'processing'\|'needs_review'`、`billing` |

- `returnUrl`（3D 驗證回來）：`{WEB_BILLING_SITE_URL}/billing/return?ref={order_ref}&k={start|card|pay}`。
- SDK 初始化需要的公開值（`clientKey`、環境、金額）由前端環境變數提供：
  `NEXT_PUBLIC_SHOPLINE_CLIENT_KEY`、`NEXT_PUBLIC_SHOPLINE_ENV`（`sandbox`／`production`）；
  金額取自 `my_web_billing().prices`。前端旗標：`NEXT_PUBLIC_WEB_BILLING_ENABLED==='true'`。

## 2. 寄信佇列 `public.web_email_outbox`（P1 已建表）

入列方式：`insert ... on conflict (dedupe_key) do nothing`，在**與狀態轉換同一個 transaction** 內。
`to_email` 取入列當下的 `auth.users.email`；沒有 email 就不入列。金額一律「分」（`amount_minor`，TWD×100）。
時間一律 ISO 8601 字串（UTC），顯示時由模板轉 Asia/Taipei。

| kind | 誰入列 | dedupe_key | payload 欄位 |
|---|---|---|---|
| `receipt` | A（扣款成功、直購成功） | `receipt:{payment_attempt_id}` | `plan, amount_minor, paid_at, period_start, period_end, card_brand, card_last4, reference_order_id, refund_deadline\|null` |
| `trial_ending` | C（提醒入列） | `trial_ending:{subscription_id}` | `plan, amount_minor, trial_end, first_charge_at, card_last4` |
| `renewal_reminder` | C（年繳前 7 天） | `renewal:{subscription_id}:{cycle}` | `plan:'annual', amount_minor, renews_at, card_last4` |
| `payment_failed` | A（首次失敗） | `payment_failed:{subscription_id}:{cycle}` | `plan, amount_minor, failed_at, grace_until, next_retry_at\|null` |
| `action_required` | A（4900/4901/4902） | `action_required:{subscription_id}:{cycle}` | `plan, amount_minor, grace_until` |
| `refund_done` | A（退款成功） | `refund_done:{refund_id}` | `amount_minor, refunded_at, reference_order_id` |
| `canceled` | A（取消續訂／寬限用完／刪帳號以外的終止） | `canceled:{subscription_id}:{reason}:{cycle}` | `plan, access_until, reason`（`user`／`grace_exhausted`／`admin`／`refund`） |
| `price_change`、`service_notice` | P7 再做 | — | 模板先回 `null`＝不寄 |

信中連結一律由模板以 `siteUrl` 組：設定→訂閱＝`{siteUrl}/?settings=subscription`；補付＝`{siteUrl}/billing/pay`；
換卡＝`{siteUrl}/billing/card`。信件第一版「繁中在上、英文在下」同一封（設計 §5.4）。

## 3. C 提供給 A 的資料庫函式（`huddle_ops` schema，只 grant service_role）

- `huddle_ops.web_enqueue_reminders(p_now timestamptz default now()) returns integer`：
  入列 `trial_ending`（`trial_end` 在 p_now 之後 2 天內、`status='trialing'`、未取消）與
  `renewal_reminder`（`plan='annual'`、`status in ('active')`、未取消、`current_period_end` 在 p_now 後 7–8 天）。回入列數。
- `huddle_ops.web_claim_outbox(p_limit integer default 30) returns setof public.web_email_outbox`：
  `for update skip locked` 挑 `status='queued'` 最舊的 N 筆，`attempts+1` 後回傳。
- `huddle_ops.web_finish_outbox(p_id uuid, p_ok boolean, p_provider_id text default null, p_skip boolean default false) returns void`：
  成功→`sent`＋`sent_at`；`p_skip`→`skipped`；失敗且 `attempts>=5`→`failed`，否則回 `queued`。

## 4. C 提供給 A 的 JS 模組 `supabase/functions/_shared/web-billing/email.mjs`

純 JS、無依賴、Deno 與 Node 皆可 import：
- `renderEmail(kind, payload, { siteUrl }) -> { subject, html, text } | null`（null＝不寄，例如 P7 類）
- `async sendEmail(fetchFn, { apiKey, from, to, subject, html, text, idempotencyKey }) -> { ok, providerId?, error?, retryable }`
  （Resend `POST https://api.resend.com/emails`，`Idempotency-Key` header＝outbox id）
- `async processOutbox({ claim, finish, send, render, siteUrl, max }) -> { sent, failed, skipped }`
  （`claim`/`finish` 由呼叫端注入，方便單元測試；A 的 cron 在 tick 第 7 步呼叫它）

## 5. A 提供的資料庫函式名稱（給 C、B 參考，不直接呼叫）

`web_start_checkout`、`web_apply_bind_result`、`web_claim_due`、`web_apply_payment_result`、`web_cancel`、
`web_resume`、`web_request_refund`、`web_apply_refund_result`、`web_expire_due`、`web_take_runner_lease`、
`web_release_runner_lease`、`web_account_closing`（皆在 `huddle_ops`，只 grant service_role）。
