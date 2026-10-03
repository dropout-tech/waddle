# 網站訂閱（SHOPLINE Payments）文件審查（2026-10-03）

- 審查範圍：`docs/billing/` 的 SLP 筆記、設計文件、介面合約、老闆清單、SLP 問題、launch-checklist；`docs/legal/2026-10-01-shopline-website-disclosures-draft.md`。對照程式：`supabase/functions/web-billing*`、`supabase/functions/_shared/web-billing/*`、`supabase/migrations/20261003020100～020300`、`app/terms|refunds|support|privacy`、`components/billing/billing-views.tsx`、`lib/legal/operator.ts`（main dbf3c8c）。
- 官方核對方式：以 WebFetch 重讀 docs.shoplinepayments.com 約 15 頁（讀取經摘要模型、頁面無日期）。逐頁結果寫在 `2026-10-02-shopline-api-notes.md` §13。
- 規則：文件錯誤已直接修改（同一個 commit）；程式不一致只列出、**沒有改程式**。法遵項目為風險盤點，**不是法律意見**，紅黃項建議諮詢律師。

## 一句話結論

文件骨架可靠：端點、金額以分計、簽章演算法、重送策略、錯誤碼、狀態機、退款／寬限／提醒的數字，與官方文件和程式大致吻合。但有 **3 個高嚴重度問題**（沙盒直接用正式庫衍生的價格與測試資料風險、「金額必須等於價目表」的防線設計有寫但程式沒做、網站還沒揭露營運者本名／Email／地址），另有 6 個中度的程式／文件不一致。

## 嚴重度定義
高＝可能收錯錢、重複扣款或法遵紅牌；中＝功能失效或違反條款承諾但可補救；低＝體驗、統計或文件措辭。

## A. 對官方文件核實（面向 1）

| # | 項目 | 結論 | 官方 URL | 處理 |
|---|---|---|---|---|
| A1 | Sandbox／Production base、create 端點、必填 header、`amount` 以分計、`referenceOrderId` String(32) | 一致 | https://docs.shoplinepayments.com/api/trade/create/ | — |
| A2 | 付款查詢只能用 `tradeOrderId`，不能用我方訂單號 | 一致（筆記原本就寫 tradeOrderId 必填）；佐證「建立逾時拿不到 tradeOrderId 時無法自己查」→ 程式把它標 unknown、不重試是對的 | https://docs.shoplinepayments.com/api/trade/query/ | 筆記 §13 補記 |
| A3 | Webhook 簽章：`HMAC-SHA256(timestamp + "." + body, signKey)`、hex、範例 sign 32 碼 | 一致；時間容許度官方沒有數字（5 分鐘是第三方建議） | https://docs.shoplinepayments.com/api/event/model/ | — |
| A4 | Webhook 重送 16 次與間隔、回 200 即停 | 一致 | https://docs.shoplinepayments.com/api/event/model/payment/ | — |
| A5 | Webhook header 是否帶 `merchantId` | **官方兩頁互相矛盾**：event/model 只列 apiVersion／timestamp／sign；model/payment 另列 merchantId、requestId | 同上兩頁 | 筆記 §12-7 新增；SLP 問題第 9 題補問；程式風險見 C3 |
| A6 | 退款事件名稱 | event/model 清單為 `trade.refund.succeeded/failed`；程式兩種寫法都接 | https://docs.shoplinepayments.com/api/event/model/ | — |
| A7 | CardBind 固定 1 元授權後自動取消 | 一致 | https://docs.shoplinepayments.com/guide/quick/ | — |
| A8 | 「停止對付款工具扣款」的觸發條件 | **筆記寫錯**：原寫「失敗時應停止」；官方明文是收到 `customer.instrument.unbinded` 或工具狀態變 DISABLED／FAILED 時停止並請顧客重綁，且建議每次扣款前查工具為 SUCCESSED 且 expired=false | https://docs.shoplinepayments.com/guide/quick/ | **已修**（筆記 §5、§13；設計 §2.2） |
| A9 | 退款 API 欄位、退款 180 天、部分退款 | 欄位一致；180 天在 guide/quick；**部分退款與累計上限官方未載明** | https://docs.shoplinepayments.com/api/trade/refund/ | 仍待 SLP 第 16 題 |
| A10 | customerToken `expireTime` | 以秒計，範例 7200（2 小時）；`customerId` 欄位說明是「特店顧客唯一識別碼」，與 guide 流程傳 SLP 會員 ID 的矛盾仍在 | https://docs.shoplinepayments.com/api/customer-paymentInstrument/customer/getToken/ | **已修**（筆記 §4 補範例值） |
| A11 | 付款工具查詢回 `referenceCustomerId`、卡片 first/last/brand/expired/issuerCountry | 一致 | https://docs.shoplinepayments.com/api/customer-paymentInstrument/paymentInstrument/query/ | — |
| A12 | 付款查詢回應中卡片與付款工具 ID 的位置 | query 頁列在**頂層** `payment.creditCard`、`payment.paymentInstrument`，範例 JSON 用 `lastPayment`；筆記與程式用的是 `order.payment.*` | https://docs.shoplinepayments.com/api/trade/query/ | 筆記 §12-8 新增；程式見 C4 |
| A13 | SDK：CDN、npm 名稱、init 參數、`textType` 與 `protocol` 並列 | 一致 | https://docs.shoplinepayments.com/sdk/payment/ 、https://docs.shoplinepayments.com/sdk/initData/ | — |
| A14 | 錯誤碼 1001／1013／1200／1201／1203／1904／4410／4900／4901／4902 | 一致；另有 4454 餘額不足、4459 卡片過期、4461 超額 | https://docs.shoplinepayments.com/appendix/errorCode/ | 筆記 §13 補記 |
| A15 | 1026（舊瀏覽器 TLS） | 錯誤碼頁沒有此碼，可能在 SDK 錯誤碼頁，**無法以官方來源確認** | — | 列為不確定 |
| A16 | 沙盒帳號、測試卡、3 的倍數進 3D、去 00 後單數成功雙數失敗 | 規則一致；**筆記用舊價 149 推論的結果是錯的**：150 與 990 都是 3 的倍數 → 沙盒一律進 3D | https://docs.shoplinepayments.com/overview/sandboxResource/ | **已修**（筆記 §8；設計 §7 測試策略） |
| A17 | 沙盒共用帳號是否開通綁卡／Recurring、`idempotentKey` 語意、status 完整列舉、IP 白名單 | **無法以官方來源確認**（官方頁沒寫） | — | 維持在 SLP 問題清單 |

## B. 嚴重問題（高）

| # | 問題 | 位置 | 失敗情境 | 狀態 |
|---|---|---|---|---|
| B1 | 沙盒測試直接在正式庫做，但正式價格在沙盒測不到扣款成功 | owner-checklist A3（用正式庫）；`20261003020100_web_billing_foundation.sql:69-70`（價格 15000／99000）；SLP 筆記 §8 | 為了測 Recurring 成功，必須把**正式庫**的 `web_billing_config` 價格改成 151／991 之類；測完忘記改回 → 開賣後新訂閱以 NT$151 鎖價、每期照錯價扣款（價格鎖在訂閱列，事後改設定也救不回已建的訂閱）。另外 `hs` 前綴的測試訂閱若沒清掉，切到正式金鑰（前綴 `hp`）後，排程會用 `hp` 訂單號拿沙盒卡號去打正式 API → 失敗並寄「扣款失敗」信給測試者 | **待決**（老闆＋工程）：建議沙盒測完跑一支「價格還原＋終止所有 hs 訂閱」的收尾 SQL，並把它列進 P6 上線清單 |
| B2 | 「金額必須等於價目表」的防線，文件說有、程式沒有 | 設計 §1.2／R9 寫「DB check amount_minor in (價格表值)」；設計 §8 P1 紀錄第 6 點說「改在 P2 轉換函式內檢查」；實際 `20261003020300_web_billing_transitions.sql:96-97` `web_amount_ok` 只檢查 1～200000 分（NT$0.01～2,000） | 設定被誤改（例如輸入 1500 想表示 NT$150，或 B1 的測試價沒改回），排程與購買都會照錯的金額向客人收錢，沒有任何一層攔下 | **待工程**：在 `web_start_checkout`／`web_claim_due` 加「金額 ∈ {目前月繳價, 年繳價, 已通知的新價}」檢查；或至少開賣前加 DB 測試斷言 config＝15000／99000 |
| B3 | 網站沒有揭露營運者本名、Email、地址 | `components/legal/legal-page.tsx:36-41`、`:52-75`（只顯示「個人經營者」＋電話）；`lib/legal/operator.ts:5-8` 註明本名與 Email 尚未在頁面使用；地址未提供 | 🔴 消保法§18 I(1) 要求通訊交易揭露「名稱、代表人、事務所或營業所、電話或電子郵件」；SHOPLINE 支付服務條款要求網站揭露客服電話及 Email。開賣時缺這些，SLP 審核不過，且七日解除期可能延後起算（消保法§19 III） | **待老闆**：給地址；**待工程**：開賣開關打開前把本名、Email、地址放上條款／支援頁（已在 owner-checklist B 與揭露稿狀態更新註明）。建議諮詢律師 |

## C. 程式與文件不一致（需工程處理，本次未改程式）

| # | 嚴重度 | 文件 | 程式 | 失敗情境 |
|---|---|---|---|---|
| C1 | 中 | 條款承諾「年繳續訂前至少 7 天寄信提醒」（`app/terms/page.tsx:19` web-billing 段）；設計 T15 | `20261003020200_web_billing_email.sql:73-74` 只在「到期前 7～8 天」這 24 小時窗內入列；`20261003020300_web_billing_transitions.sql:630-645` 扣款不檢查提醒信是否已寄出 | 排程在那 24 小時內停擺、或 Resend 連續失敗 5 次標 failed，客人就沒收到提醒卻照樣被扣 NT$990 → 違反條款承諾（設計 T19 漲價有「沒寄到就不漲」的保護，年繳提醒沒有） |
| C2 | 中 | 設計 §1.2／§2.2 寫 claim 會檢查付款工具；SLP 官方要求工具解綁／DISABLED／FAILED 時立即停扣（筆記 §13） | `web-billing-webhook/handler.mjs:20-25` 不處理 `customer.instrument.unbinded`／`updated`；`core.mjs:150-152` 只在綁卡時判斷可用；扣款前不查工具狀態 | 客人在銀行端停卡或 SLP 停用工具後，我們仍會發起 1 次扣款＋3 次重試，違反 SLP 指示；長期可能影響特店風控評分 |
| C3 | 中 | SLP 筆記 §7 header 表含 `merchantId` | `web-billing-webhook/handler.mjs:43` 沒有 merchantId header 就回 403 | 若實際通知不帶 merchantId（官方 event/model 頁就沒列），**所有** webhook 都被拒、SLP 重送 16 次後放棄；開通與扣款結果改靠 `status` 輪詢與 15 分鐘對帳，會變慢但不會錯。沙盒首次收 webhook 必驗 |
| C4 | 低 | 官方 query 頁：卡片與工具 ID 在頂層 `payment.*`（範例為 `lastPayment`） | `core.mjs:180-188` 只讀 `order.payment.*`、`paymentInstrument`、`confirm.*` | 讀不到時改用付款工具查詢補；同一會員有多張「新」卡時會判 unmatched，綁卡卡在 pending 直到 1 小時後放棄，客人要重來 |
| C5 | 中 | 官方 create 頁 `client.ip` 為 String(32) | `core.mjs:380-383` 接受最長 45 字元 | 完整 IPv6（例如 39 字元，台灣行動網路常見）若被 SLP 依長度拒絕，該客人的試用／付款一律失敗（slp_error）。沙盒用 IPv6 實測；必要時截斷或改送 IPv4 |
| C6 | 低 | 設計 D9-A：沒試用直接購買的首扣也可 7 天退款 | 程式有給（`20261003020300_web_billing_transitions.sql:431-432`）；但 `app/refunds/page.tsx` web-refund 段只寫「試用結束後第一次扣款」 | 揭露比實際窄（對客人有利，不會收錯錢），但用過試用、直接購買的人看條款會以為不能退 → 見 E2 |
| C7 | 低（文件已修） | 設計 §4.3 寫訂單號 25 碼、§2.2 寫 `web_claim_due(limit 20)` | `core.mjs:23-28` 為 26 碼；`web-billing-cron/handler.mjs:140-151` 一次 claim 1 筆、每 tick ≤10 | 只是文件誤植；**已修** |

已核對一致（不需處理）：價格 15000／99000（`foundation.sql:69-70`）；試用 14×24 小時、錨點＝試用結束（`transitions.sql:438-440`）；寬限 168 小時、重試 +1／+3／+6 天共 3 次、4900–4902 不重試、1201 五分鐘後重試不計次（`transitions.sql:525-572`）；首扣與年繳續扣才有 7 天退款、截止＝台北日期 +8 天 00:00（`transitions.sql:585-588`、`:73-79`）；退款完成期限＝申請隔天起 15 天（`:75`）；每 tick 120 秒上限（`cron/handler.mjs:14`）；試用提醒 2 天前（`email.sql:54`）；月底與 2/29 從錨點算（`transitions.sql:63-71`）；決定性訂單號＋`idempotentKey` 同值、逾時與 1001 標 unknown 不重試（`core.mjs:205-216`、`cron/handler.mjs:151`）；同期唯一成功與唯一未決的索引（`foundation.sql:193-196`）；金額由伺服器決定（`transitions.sql:216,232,260`，前端只用於 SDK 顯示）；webhook 不信任內容、一律回查 SLP（`core.mjs:275-289`）。

## D. 文件之間互相一致（面向 3）

| # | 問題 | 位置 | 狀態 |
|---|---|---|---|
| D1 | 月繳寫 NT$149（14900） | SLP 筆記 :31、:134、:146、:246、:264 | **已修** → 150／15000 |
| D2 | 月繳 149、年繳 1,290、「官網仍寫 1,290」 | launch-checklist :3、:19 | **已修**（加註現價，保留歷史；已 grep 確認官網與條款無 1,290） |
| D3 | 設計狀態仍寫「草案，待拍板」、D7「尚未合併」、P1／P2–P5「未套任何遠端」 | 設計 :3、:39、:478、:492 | **已修**（migration 已套正式庫，PR #166 已合併） |
| D4 | 設計 D8 寫開測試專案，實際老闆決定用正式庫 | 設計決策紀錄 | **已修**（加 D8 改決定註記） |
| D5 | 老闆清單 C7／A2 寫「貼進 Supabase 測試專案」 | owner-checklist :8、:18 | **已修** → 正式庫 penguinflow |
| D6 | 老闆清單漏列電話與法院、地址狀態過時、W-8BEN 與稅籍已決定仍列待辦 | owner-checklist B、D | **已修** |
| D7 | 揭露稿 D2 建議「網站沒有試用」、退款寫「首次付款後 7 天」、結帳文案只有「今天扣款」版、法院範例臺北、回覆時效佔位、稅務待辦、企鵝造型寫進 Pro | 揭露稿 0-3、0-4、0-5、2-3、7-1、7-2 | **已修**：檔頭加「2026-10-03 狀態更新」覆蓋表；7-1、7-2 結帳文案改成試用／直購兩版與正確退款起算 |
| D8 | 營運者資訊 | 本名 廖思明／Liao Sih-Ming、hi@lazy72.com、寄件 billing@lazy72.com、網域 lazy72.com、新北地院：各文件與 `lib/legal/operator.ts`、`email.mjs:12-13` 一致 | 一致 |
| D9 | 試用長度 | 文件與條款寫「2 週」、程式 14 天、購買頁寫「免費試用 14 天」（`billing-views.tsx:152`）；pro-scope 決定的是 App 端顯示「2 週」 | 一致（同義）；是否網站也統一寫「2 週」屬文案品味，待老闆 |

## E. 法遵揭露（面向 5，非法律意見）

| 燈號 | 項目 | 說明 | 建議 |
|---|---|---|---|
| 🔴 | 營運者本名、地址、Email 未上網站 | 見 B3（消保法§18 I(1)） | 開賣前補齊；建議諮詢律師 |
| 🔴 | 開賣當天「尚未開放購買」字樣要一起拿掉 | `legal-page.tsx:28`、`app/terms`、`app/refunds`、`app/support` 多處；現在寫是正確的，開賣當天不改就變不實表示（公平法§21） | 綁同一個開賣開關（揭露稿第 9 節清單仍有效，但行號已過時） |
| 🟡 | 7 天退款條款沒寫「直購首扣」 | C6；消保法§19 對直購同樣適用 | 改 refunds 頁一句；建議諮詢律師 |
| 🟡 | 年繳提醒「至少 7 天」寫了但程式無保證 | C1；寫了就是義務（消保法§22 同理） | 程式補保護，或條款改成「原則上」不建議——先補程式 |
| 🟡 | 結帳頁沒有就地寫 7 天退款規則與營運者身分（只有連結） | `billing-views.tsx:148-171` | 連結＋收據信可能已足，請律師確認；保守做法照揭露稿 7-1 加兩行 |
| 🟡 | 隱私說明沒列寄信服務 Resend | `app/privacy/page.tsx` 列 Supabase、Zeabur、SLP，無 Resend；Resend 會收到 Email 與收據內容（個資法§8 I(4) 利用對象與地區） | 隱私頁加一句；建議諮詢律師 |
| 🟡 | 月繳續扣不給 7 天、年繳逾 7 天不按比例退 | 揭露稿 0-6 黃 4 既有判斷，未變 | 維持律師確認 |
| 🟢 | 自動續訂告知、取消方式（線上＋電話）、扣款失敗處理、漲價 30 天、帳號冒用暫停、刪帳號停訂、管轄保留§47 與小額訴訟 | 條款頁 web-billing 段、law 段都有，且與程式行為一致 | — |
| 🟢 | 試用期內取消不扣款、試用期間七日解除權 | 試用期不收費，首扣後再給 7 天，比法定寬 | — |
| 🟢 | 只存卡別、發卡國家、末四碼 | 隱私頁與 `foundation.sql:85-94` 一致 | — |

## F. 過時內容（面向 6）
已修：migration 已套正式庫（設計 §8 兩段標題）、Resend 網域 Verified 與 Apple 寄件登記已完成（設計 D1）、W-8BEN 已填與稅籍先不辦（老闆清單 D）、PR #128 已合併（設計 D7）、價格 149／1,290（筆記、launch-checklist）、D8 測試專案（設計、老闆清單）、揭露稿多項決定（檔頭狀態更新）。

## G. 需要問 SLP 窗口或老闆決定
- SLP（已在 `2026-10-02-slp-questions-to-send.md`）：第 1–7 題仍最急；本次補問第 4 題（`client.ip` 能否傳 IPv6）、第 9 題（webhook 是否一定帶 merchantId）、第 14 題（150／990 都是 3 的倍數，沙盒怎麼測定期扣款成功）。
- 老闆：(1) 聯絡地址（不給不能開賣）；(2) 同意沙盒測試期間暫改正式庫價格設定，並在切正式前清掉測試訂閱（B1）；(3) 網站寫「14 天」還是「2 週」。

## H. 驗證與限制
- 官方核對：WebFetch 讀取 docs.shoplinepayments.com 約 15 頁，經摘要模型轉述，個別字句可能有轉述誤差；沒有登入後台、沒有打任何 API。
- 程式核對：以 grep 與逐段閱讀，**沒有執行測試**、沒有碰任何資料庫。
- 沒做到：SDK 錯誤碼頁、theme 頁、爭議事件細節未讀；揭露稿 848 行只針對與現行決定衝突處修正，未逐句重寫（狀態更新表覆蓋下文）。
