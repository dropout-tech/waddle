# SHOPLINE Payments（SLP）API 實作筆記：Huddle 網站訂閱

查證日：2026-10-02。來源：docs.shoplinepayments.com（官方，頁面本身皆無日期標示，一律視為「日期不明、2026-10-02 讀取」，頁尾版權 2026）。
第三方交叉來源：GitHub boyonglin/shopline-payments-skill、Ya19880104/ys-shopline-via-woocommerce（非官方，只作交叉比對）。

## 0. 讀這份筆記的注意事項

- 只做了文件閱讀，沒有登入任何後台、沒有打任何 API。所有欄位以「官方頁面所載」為準，下面標 [官方] / [第三方] / [推測]。
- 文件讀取經過摘要模型，個別頁面（附錄狀態碼）抓不到全文；抓不到的寫「文件未載明（本次未取得）」，工程師首次接 sandbox 時要以實際回應校正。
- 官方文件內部有幾處前後不一致，已集中列在第 12 節，實作時以 sandbox 實測為準。

## 1. 信心與結論摘要

- 能否不靠我們自己的商家帳號先在 sandbox 開發：可以一半。官方公開了共用的沙盒特店帳號（登入沙盒後台後自行取得 apiKey/clientKey/signKey），不需要我們自己的商家審核。但：(a) 該共用帳號是否已開通綁卡／定期扣款，文件未載明；(b) 共用帳號的 Webhook URL 與金鑰是多人共用，webhook 會互相覆蓋 [推測]。信心約 7 成。
- 最大技術卡點：無人在場的定期扣款可能被發卡行要求 3DS 或 CVC 而失敗（官方錯誤碼 4900 Need 3DS、4901 Need cvs，說明為「顧客不在場無法完成」）。免費試用綁卡時的 1 元授權如果有走 3DS，不保證 14 天後的首扣可免 3DS。必須設計「扣款失敗 → 通知用戶回站內用已綁卡做有人在場的快捷付款（QuickPayment，SDK 可走 3DS）」的補救流程。
- 試用綁卡可行：純綁卡（CardBind）固定以 1 元授權、成功後自動取消授權，不實際扣款。

## 2. 認證、環境、通用規則（題 7、9）

| 項目 | 內容 | 來源 |
|---|---|---|
| Sandbox API base | `https://api-sandbox.shoplinepayments.com` | https://docs.shoplinepayments.com/api/trade/create/ |
| Production API base | `https://api.shoplinepayments.com` | 同上 |
| 所有 Server API | 皆為 POST（唯一例外：guide/quick 頁寫會員查詢為 GET，見第 12 節） | 各 API 頁 |
| 必要 header | `Content-Type: application/json`、`merchantId`、`apiKey`、`requestId`(String 32，每個 HTTP 請求唯一) | 各 API 頁 |
| 選用 header | `idempotentKey`(String 32)、`platformId`（僅平台特店） | 各 API 頁 |
| apiKey | 呼叫 Server API 的憑證 | https://docs.shoplinepayments.com/overview/vocabulary/ |
| clientKey | 前端 SDK 的憑證（會出現在瀏覽器，可公開） | 同上 |
| signKey | 驗證 Webhook(Event) 簽章的憑證；每個 Webhook URL 對應一把 signKey | 同上、https://docs.shoplinepayments.com/api/event/ |
| 金鑰取得 | 登入 SLP 後台「設定 → 開發者管理」 | https://docs.shoplinepayments.com/overview/intergrationGuide/ |
| 金額單位 | 以「分」：TWD × 100（NT$149 → 14900；NT$990 → 99000）。create/refund/capture/SDK init/webhook 皆如此 | create、refund、sdk/payment、guide/normal 頁 |
| 幣別 | `TWD`（目前僅支援） | create 頁、sdk/initData |
| 速率限制 | 文件未載明數字；僅有錯誤碼 1904「Requests are too frequent」與 HTTP 429 | https://docs.shoplinepayments.com/appendix/errorCode/ |
| 時區／時間格式 | 文件未載明（createTime 只標 String(32)；webhook `timestamp` 為毫秒 Unix） | create 頁 |
| 錯誤回應 | HTTP 400/429/500，body `{ "code": "...", "msg": "..." }` | 各 API 頁 |
| IP 白名單 | 文件未載明 | — |

requestId / idempotentKey 語意：requestId 欄位說明為「請求流水號，每個 HTTP 請求唯一」；idempotentKey 只標選填 32 碼，沒有重複請求行為、有效期說明（文件未載明）。實務建議 [推測]：requestId 用去連字號 UUID（剛好 32 字）；真正的防重複靠「決定性的 referenceOrderId」（見第 6 節）。

## 3. 前端 SDK（題 1）

來源：https://docs.shoplinepayments.com/sdk/payment/ 、https://docs.shoplinepayments.com/sdk/initData/ 、https://docs.shoplinepayments.com/sdk/example/CreditCard/

- 載入：CDN `https://cdn.shoplinepayments.com/sdk/v1/payment-web.js`（全域 `window.ShoplinePayments`），或 npm `@shoplinepayments/payment-web`（`import ShoplinePayments from '@shoplinepayments/payment-web'`）。
- 初始化：`const { payment, error } = await ShoplinePayments({...})`

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| clientKey | string | 是 | SDK 憑證 |
| merchantId | string | 是 | SLP 特店 ID |
| paymentMethod | string | 是 | 信用卡填 `CreditCard` |
| currency | string | 是 | `TWD` |
| amount | number | 是 | 分（TWD×100）；文件說明「後期不再更改」，但 `payment.update()` 可改金額與語系 |
| element | string | 是 | 容器 selector，如 `#paymentContainer`，需先存在於 DOM |
| env | string | 否 | `production`（預設）或 `sandbox` |
| language | string | 否 | 預設瀏覽器語系 |
| countryCode | string | 否 | 目前僅 `TW` |
| customerToken | string | 否 | 會員授權 token，傳入後 SDK 自動載入該會員已綁卡片 |
| theme | object | 否 | UI 客製，見 https://docs.shoplinepayments.com/sdk/theme/（本次未讀） |
| paymentInstrument.bindCard.enable | boolean | 否 | 預設 false；要綁卡必須 true |
| ...bindCard.protocol.switchVisible | boolean | 否 | 是否顯示「綁卡」勾選框，預設 false |
| ...bindCard.protocol.defaultSwitchStatus | boolean | 否 | 預設是否勾選，預設 true |
| ...bindCard.protocol.mustAccept | boolean | 否 | 是否必須勾選，預設 false |
| ...bindCard.textType.paymentAgreement | boolean | 否 | 顯示「信用卡交易」協議文字，預設 true |
| ...bindCard.textType.subscribeAgreement | boolean | 否 | 顯示「定期購物信用卡代扣協議」文字，預設 true |

（textType 在 guide/quick 頁寫在 protocol 之內，在 sdk/initData 頁是與 protocol 並列，見第 12 節。）

- 方法：
  - `payment.createPayment()` → `{ paySession, error }`。顧客填完卡片後呼叫；SDK 先驗證卡片欄位完整性。`paySession` 是不透明字串，不可解析，原樣傳給後端。
  - `payment.pay(nextAction)` → 成功回 `undefined`，失敗回 `{ error }`。`nextAction` 取自後端「建立付款交易」的回應，同樣不可解析。SDK 在需要時自動導 3DS。
  - `payment.update(config)`、`payment.getCurrentCardInfo()`（bin/brand/issuer/type）、`payment.destroy()`。
- 回傳給後端的是：`paySession`（加上我們自己的 referenceCustomerId／方案資訊）。沒有 token / paymentInstrumentId 直接回前端；綁卡結果由後端 API 回應與 webhook 取得。
- 3DS：SDK 依風控自動導向銀行 3DS 頁，再回 `returnUrl`；文件說特店「無體感」。重要限制：不可把銀行 3D 頁放在 iframe 內。測試必須在 HTTPS 環境。
- 瀏覽器相容：TLS 1.2 不支援的舊瀏覽器會報錯碼 1026。
- 靜態匯出相容性 [推測]：SDK 純前端、金鑰 clientKey 可公開，與 Next.js 靜態匯出相容；所有需 apiKey 的呼叫放 Supabase Edge Function。

## 4. 顧客與綁卡（題 2、3）

四種情境（paymentBehavior）— https://docs.shoplinepayments.com/guide/quick/

| 情境 | paymentBehavior | 顧客在場 | savePaymentInstrument | autoConfirm | paymentCustomerId | paymentInstrumentId | 要 SDK |
|---|---|---|---|---|---|---|---|
| 純綁卡 | CardBind | 是 | true（必填） | false | 不需要 | 不需要 | 是 |
| 付款並綁卡 | CardBindPayment | 是 | true（必填） | false | 不需要 | 不需要 | 是 |
| 快捷付款 | QuickPayment | 是 | 否 | false | 必填 | 否 | 是 |
| 定期扣款 | Recurring | 否 | 否 | true | 必填 | 必填 | 否 |

三個容易混的 ID（同頁）：
- `referenceCustomerId`：我方自訂的會員 ID（建議用 Supabase user id 去連字號，剛好 32 字，create trade 頁限 String(32) [推測]）。
- `customerId` / `paymentCustomerId`：SLP 的會員 ID（建交易時若不存在由 SLP 自動建立，見 create 頁 customer.customerId 說明）。
- `customerToken`：給 SDK 用的臨時授權 token，有時效。

API 一覽（皆 POST，路徑接在 base URL 後）：

| 用途 | 路徑 | 來源 |
|---|---|---|
| 建立會員 | `/api/v1/customer/create` | https://docs.shoplinepayments.com/api/customer-paymentInstrument/customer/create/ |
| 會員查詢 | guide/quick 寫 `GET /api/v1/customer/query?referenceCustomerId=`（獨立 API 頁本次未能取得） | guide/quick |
| 產生 customerToken | `/api/v1/customer/token` | https://docs.shoplinepayments.com/api/customer-paymentInstrument/customer/getToken/ |
| 查付款工具(已綁卡)列表 | `/api/v1/customer/paymentInstrument/query` | https://docs.shoplinepayments.com/api/customer-paymentInstrument/paymentInstrument/query/ |
| 解綁付款工具 | `/api/v1/customer/paymentInstrument/unbind` | https://docs.shoplinepayments.com/api/customer-paymentInstrument/paymentInstrument/unbind/ |
| 直接建立付款工具 | 不提供（官方：出於卡資安，無直接建立 API，需走建立付款交易＋SDK） | https://docs.shoplinepayments.com/api/customer-paymentInstrument/paymentInstrument/create/ |

欄位表：
- customer/create body：`referenceCustomerId`(必)、`customer.email` 與 `customer.phoneNumber`(至少一個，電話含國碼如 +886…)、`shipping`(選)、`personalInfo`(選)、`attachData`(選)。回：`customerId`(32)、`referenceCustomerId`、`attachData`。
- customer/token body：`customerId`（必，String 128。欄位說明寫「特店唯一客戶識別」，但 guide/quick 流程是傳 SLP 的 customerId，見第 12 節）。回：`customerId`、`customerToken`(String 64)、`expireTime`(整數，秒；具體時間文件未載明預設值)。
- paymentInstrument/query body：`customerId`(必)、選填 `paymentInstrument.instrumentId` / `instrumentType` / `instrumentStatus` / `instrumentStatusList`。回：`customerId`、`referenceCustomerId`、`paymentInstruments[]`，每筆 `instrumentId`、`instrumentType`、`instrumentStatus`、`instrumentCard{type,brand,holder,first(前6),last(後4),expireMonth,expireYear,expired,issuer,issuerCountry}`，另有選用 billing/descriptor。
- unbind body：`customerId`(必)、`paymentInstrumentId`(必)。回：`customerId`、`paymentInstrumentId`、`unbindTime`。
- 付款工具狀態：guide/quick 列 `SUCCESSED`（可用於快捷／定期）、`CREATED`（綁定中）、`DISABLED`（已解綁或系統停用）、`FAILED`；query API 頁列 `CREATED / ENABLED / SUCCESSED / DISABLED`。判斷「可扣款」以 `SUCCESSED` 為準，`ENABLED` 的語意文件未載明。

綁卡流程（首次）[官方 guide/quick 頁整理]：
1. 後端建立付款交易：`paymentBehavior=CardBind`、`confirm.paymentInstrument.savePaymentInstrument=true`、`customer.referenceCustomerId`、amount 任填（系統固定以 1 元執行）。
2. 前端 SDK 以 `bindCard.enable=true` 初始化，顧客輸入卡片 → `createPayment()` 取 `paySession` → 傳後端 → 後端建交易回 `nextAction` → `payment.pay(nextAction)`（必要時自動 3DS）。
3. 綁卡成功：收 webhook `customer.instrument.binded`（內含 `data.customerId`、`data.referenceCustomerId`、`data.paymentInstrument.instrumentId`）。也可用 paymentInstrument/query 補查。官方明示要保存回傳的 customerId。
4. 取得 paymentInstrumentId：官方說「可透過付款工具列表查詢取得」；webhook payload 範例中也帶 instrumentId。建立交易回應的 `order.payment.paymentInstrument.paymentInstrumentId` 欄位存在（create 頁回應欄位），是否一定有值文件未載明。
5. 官方注意：即使後端帶 `savePaymentInstrument:true`，若 SDK 端 `bindCard.enable` 為 false，實際不會綁卡 [第三方轉述官方行為，待實測]。

換卡：文件沒有「換卡」專用流程。可行做法 [推測]：再跑一次 CardBind 綁新卡 → 成功後 unbind 舊卡 → 我方訂閱記錄改指新 instrumentId。已綁卡列表以 customerToken 載入 SDK 時會顯示在 UI。

免費試用（題 3）：
- 官方明文：純綁卡「無論特店傳入什麼金額，系統固定以 1 元進行綁卡作業，授權成功後自動取消授權」。（guide/quick 頁；兩次讀取一致）所以不需要我們另外做「1 元授權再取消」。
- 3DS 是否在綁卡時發生：文件未載明，只說 SDK 依風控自動處理。
- 第三方提醒（ys-shopline-via-woocommerce 外掛）：sandbox 上純綁卡的 placeholder 金額用 10100（NT$101）而不是 0，才符合 sandbox 奇偶規則 [第三方，待實測]。

## 5. 定期扣款（題 4）

端點：`POST /api/v1/trade/payment/create`（與一般付款同一支，靠 `paymentBehavior=Recurring` 區分）。來源：https://docs.shoplinepayments.com/api/trade/create/ 、https://docs.shoplinepayments.com/guide/quick/

官方 guide/quick 的 Recurring 範例（精簡）：
```json
{
  "paySession": {},
  "amount": { "value": 14900, "currency": "TWD" },
  "confirm": {
    "paymentMethod": "CreditCard",
    "paymentBehavior": "Recurring",
    "autoConfirm": true,
    "paymentCustomerId": "<SLP customerId>",
    "paymentInstrument": { "paymentInstrumentId": "<instrumentId>" }
  },
  "customer": { "referenceCustomerId": "<我方會員ID>" },
  "client": { "ip": "<我方伺服器IP>" }
}
```
（範例的金額換成我們的 14900，原範例是 10000。）

create 頁欄位表標示為「必填」的頂層欄位：`acquirerType`(固定 `SDK`)、`referenceOrderId`(String 32)、`language`、`amount{value,currency}`、`returnUrl`(String 256)、`paySession`、`order`(含 products 與 shipping)、`confirm`、`customer`(`referenceCustomerId`、`personalInfo.lastName`)、`billing`(personalInfo、address)、`client.ip`。但 guide/quick 的 Recurring 範例省略了其中大部分（order、billing、returnUrl…）。哪些在 Recurring 可省略，文件未載明 → sandbox 實測，建議先把全部必填欄位都補上（數位商品 shipping 也要塞一個合理值，需向 SLP 確認），再逐項試著拿掉。

confirm 內關鍵欄位：
- `paymentMethod`(`CreditCard`)、`paymentBehavior`(Regular/Recurring/CardBind/CardBindPayment/QuickPayment)
- `autoConfirm`：官方「僅 Recurring 時應設 true」
- `paymentCustomerId`：快捷與定期必填
- `paymentInstrument.paymentInstrumentId`：定期必填
- `autoCapture` 預設 true（自動請款）、`autoSettle` 預設 true（僅平台特店）
- `client.ip`：Recurring 填我方伺服器／辦公室 IP 即可（官方明說）

merchant-initiated 標記：沒有獨立旗標，等於 `paymentBehavior=Recurring` + `autoConfirm=true`。

回應（HTTP 200）關鍵欄位：`referenceOrderId`、`tradeOrderId`、`status`、`subStatus`、`amount`、`paidAmount`、`paymentMsg{code,msg}`、`actionType`、`nextAction{type,url,method}`、`order.payment.*`（`creditCard.bin/last4/brand/issuer…`、`isSettle`…）。範例回應曾出現 `status: SUCCEEDED`、`subStatus: AUTHORIZED`。status／subStatus 完整列舉本次未取得（附錄頁抓不到），文件未載明（本次未取得）。

同步 vs 非同步：Recurring 回應是否保證終態文件未載明。官方要求「所有場景必接交易結果 Webhook」，並提供「付款交易查詢」做保底。實作應：以 webhook 為主、回應同步結果為輔，無終態時用 query 輪詢補查。

冪等／重複：
- `referenceOrderId` 需唯一（特店訂單號，≤32 字）；重複時預期回錯誤碼 1001「Order exist」[錯誤碼表有此碼，但 create 頁未明說對應此情境，屬推測]。
- 建議（推測）：用「訂閱ID＋計費週期」編碼成決定性 referenceOrderId（≤32 字），重送時先 query 再決定，避免重複扣款。
- idempotentKey 行為文件未載明，不要單靠它。

Recurring 失敗相關錯誤碼 [官方 errorCode 頁]：4900 Need 3DS、4901 Need cvs、4902 Saved card payment other error（皆為顧客不在場無法完成）。官方 guide/quick 提醒：失敗時應停止對該付款工具再發起快捷與定期扣款（具體重試次數／節奏文件未載明）。另 1201 Card is cloning（綁卡後處理中，5 分鐘後重試）、1203 Card verification failed、4410 Duplicate payment。

## 6. 退款、取消、查詢（題 5）

| 功能 | 路徑 | 重點欄位 | 來源 |
|---|---|---|---|
| 退款 | `/api/v1/trade/refund/create` | body：`referenceOrderId`(退款單號，≤32，必)、`tradeOrderId`(必)、`amount.value`/`currency`(必)、`reason`(≤256)、`additionalData`；回：`refundOrderId`、`status`、`refundMsg`、`destinationDetails` | https://docs.shoplinepayments.com/api/trade/refund/ |
| 退款查詢 | `/api/v1/trade/refund/get` | body：`refundOrderId`；status 範例值 `SUCCEEDED`；第三方整理出 `PROCESSING/SUCCEEDED/FAILED` | https://docs.shoplinepayments.com/api/trade/refundQuery/ |
| 付款查詢 | `/api/v1/trade/payment/get` | body：`tradeOrderId`(必)；回應結構同建立交易 | https://docs.shoplinepayments.com/api/trade/query/ |
| 取消授權 | `/api/v1/trade/payment/cancel` | body：`referenceOrderId`、`tradeOrderId`、`additionalData`；回：`tradeOrderId`、`status`(範例 `PROCESSING`) | https://docs.shoplinepayments.com/api/trade/cancel/ |
| 請款 | `/api/v1/trade/payment/capture` | 僅 autoCapture=false 時需要；`amount`、擇一 `referenceOrderId`/`tradeOrderId` | https://docs.shoplinepayments.com/api/trade/capture/ |

- 退款：金額欄位可填部分金額，故支援部分退款是合理推論，但「部分退款規則、累計上限」官方 refund 頁未載明；guide/quick 寫「退款可於交易後 180 天內」。退款失敗的錯誤碼有 1013（退款請求已存在）。
- 取消 vs 退款：取消僅適用請款前（第三方整理，官方 cancel 頁未直接寫此規則）；我們預設 autoCapture=true，所以訂閱扣款後要退款走 refund。純綁卡的 1 元由系統自動取消，我們不必處理。
- 退款結果也有 webhook（第 7 節）。

## 7. Webhook（題 6）

來源：https://docs.shoplinepayments.com/api/event/ 、https://docs.shoplinepayments.com/api/event/model/ 、…/model/payment/ 、…/model/refund/ 、…/model/instrument/

設定：SLP 後台「設定 → 開發者管理」為每個 webhook URL 設定，一個 URL 對應一把 signKey。要求 HTTPS（第三方；官方稱 HTTPS 請求）。

Header：`apiVersion`（如 V1.2）、`merchantId`、`requestId`、`timestamp`(毫秒 Unix)、`sign`、`Content-Type: application/json`（`platformId`/`idempotentKey` 視情況）。
Body：`id`(事件ID，≤35)、`type`、`created`(毫秒時間戳)、`data`(依事件而異)。

簽章驗證（官方）：
1. 取 header 的 `timestamp` 與 `sign`。
2. `payload = timestamp + "." + 原始 body 字串`（必須用未經重新序列化的原始位元組）。
3. `expected = HMAC-SHA256(payload, signKey)`，UTF-8。
4. 比對 `sign`；官方同時要求驗證 timestamp 在容許區間內以防重放。
- 輸出編碼：官方範例看起來是十六進位字串（但範例值只有 32 位 hex，不是 SHA-256 的 64 位，疑為示意值）；第三方實作用 `digest('hex')`。請在 sandbox 用真實 webhook 驗證編碼。
- 時間容許度：官方未載明具體數字；第三方 skill 用 5 分鐘（|now − timestamp| ≤ 300000 ms），屬第三方建議。
- Edge Function（Deno）可用 Web Crypto `crypto.subtle` 做 HMAC，記得用常數時間比較 [推測]。

回應與重送：回 HTTP 200 即停止通知；非 200 共重送 16 次，間隔 15s/15s/30s/3m/10m/20m/30m/1h/1h/2h/3h/6h/6h/6h/12h/12h。回應 body 格式文件未載明（200 即可）。可能重複送達，須以 event `id` 去重。建議先回 200 再非同步處理 [第三方建議]。

事件種類（官方 event/model 頁清單）：
- Session：`session.created / expired / pending / succeeded`
- 付款：`trade.succeeded / failed / expired / processing / cancelled / customer_action`
- 退款：`trade.refund.succeeded / trade.refund.failed`（model 頁清單寫法；refund 頁範例寫 `refund.succeeded`，兩者不一致，程式請同時接受）
- 會員：`customer.created / updated / deleted`
- 付款工具：`customer.instrument.binded / updated / unbinded`
- 爭議：`dispute.*`（約 16 種，chargeback/pre-chargeback/fraud/retrieval，頁面 …/model/dispute/）
- 平台：`trade.settled`、`merchant.kyc.audit`、`trade.split.*`

payload 範例：
- 付款工具綁定（來自 guide/quick 頁範例，欄位為官方）：
```json
{
  "id": "<event id>",
  "type": "customer.instrument.binded",
  "created": 1718551769058,
  "data": {
    "customerId": "<SLP customerId>",
    "referenceCustomerId": "<我方會員ID>",
    "paymentInstrument": {
      "instrumentId": "<paymentInstrumentId>",
      "instrumentType": "CreditCard",
      "instrumentStatus": "SUCCESSED",
      "instrumentCard": { "type": "CREDIT", "brand": "Visa", "first": "400000", "last": "1234",
                          "expireYear": "2027", "expireMonth": "12", "expired": false, "issuer": "XX Bank" }
    }
  }
}
```
- 付款事件 `trade.succeeded` 的 data：欄位同「建立付款交易」回應（`referenceOrderId`、`tradeOrderId`、`status`、`subStatus`、`paymentMsg`、`amount`、`paidAmount`、`order`…）。payment 事件頁沒有完整 JSON 範例（文件未載明），以上為欄位表整理，非原文範例。
- 退款事件 data：`refundOrderId`、`referenceOrderId`、`tradeOrderId`、`amount`、`status`、`refundMsg`、`destinationDetails`。

## 8. Sandbox（題 8）

來源：https://docs.shoplinepayments.com/overview/sandboxResource/

- 官方公開共用沙盒特店帳號（登入 SLP 沙盒後台後，在「設定 → 開發者管理」取得 apiKey / clientKey / signKey）。一般特店：帳號 slpsandbox2@shopline.com，Merchant ID `2652289079513847808`；另有平台特店與平台子特店帳號（用於 Connect，與我們無關，ID 兩次讀取不一致，不採用）。密碼寫在該頁（兩次讀取一致），這裡不重抄，工程師自己開頁取得。
- 這是多人共用帳號 [推測風險]：金鑰與 webhook URL 設定是共用的，我方設定的 webhook URL 可能被別人覆蓋或收到別人的事件；開發期務必用唯一 referenceOrderId 前綴並過濾事件。
- 測試卡（到期 03/30）：Visa 4147633700198405 / CVC 638；MasterCard 5149147700000300 / CVC 231；JCB 3565586700000200 / CVC 484。
- 3DS 規則：金額為 3 的倍數 → 固定進 3D 流程，導到沙盒模擬頁手動選成功／失敗。
- 非 3D 規則：把 TWD 金額去掉最小單位的「00」後，單數 → 成功，雙數 → 失敗（400 失敗、401 成功）。
- 套到我們的價格 [推測，需實測]：NT$149（14900 分）不是 3 的倍數，去 00 得 149 為單數 → 成功路徑；NT$990 是 3 的倍數 → 走 3D 模擬頁。想測非 3D 的失敗路徑，用不是 3 的倍數的偶數金額（如 NT$200 → 去 00 後為 2 → 失敗）。「3 的倍數」是以元還是分判定，頁面未明說。
- Apple Pay 沙盒：需 macOS 10.14.1+ 或 iOS 12.1+，使用沙盒 Apple ID（見該頁），測試卡見 Apple 官方清單 https://developer.apple.com/apple-pay/sandbox-testing/（本次與訂閱無關）。
- 其他方式（LINE Pay、街口、ATM）導向沙盒模擬頁選結果。
- Sandbox 的 Webhook 是否會真的發送到我們設定的 URL：文件未載明，預期會 [推測]。
- 共用帳號是否已開通綁卡／Recurring：文件未載明。

## 9. 需另外申請開通的功能（題 10）

- 文件完全沒有「綁卡／定期扣款需另外申請」的明文，也沒有申請方式。官方只說綁卡、快捷、定期、分期屬於「進階信用卡服務」，僅支援內嵌式串接（https://docs.shoplinepayments.com/overview/supportedPaymentMethod/CreditCard/ 、…/overview/intergrationGuide/）。
- 錯誤碼 1200「Card binding is not support currently」顯示功能可能有開關或暫時不可用，但原因文件未載明 [推測：可能與特店是否開通有關]。
- 商家申請頁（https://docs.shoplinepayments.com/kyc/kycOverview/）只區分平台特店與直連特店，沒有審核細項、行業限制、時程。
- 結論：正式上線前必須向 SLP 業務／窗口書面確認：(1) 我們的特店帳號是否開通綁卡與 Recurring；(2) 訂閱／數位服務行業是否在可收範圍；(3) 無人在場扣款的 3DS/CVC 豁免政策；(4) 是否需要簽署額外的定期扣款契約。

## 10. 對應 Huddle 流程的最小呼叫序列 [整理自上述，非官方範例]

1. 使用者選方案 → Edge Function：建 SLP 會員（可略，建交易會自動建）→ 建交易 `CardBind`（referenceCustomerId = 使用者 ID）。
2. 前端 SDK（bindCard.enable=true）→ `createPayment()` → Edge Function 轉 `paySession` 建交易 → 回 `nextAction` → `payment.pay()`。
3. 收 `customer.instrument.binded` → 存 customerId、instrumentId、卡末四碼；訂閱狀態 = 試用中，trial_end = 現在 + 14 天。
4. 試用到期日：排程 Edge Function 呼叫 Recurring（金額 14900 或 99000，referenceOrderId = 決定性編碼）→ 收 `trade.succeeded` → 訂閱啟用；失敗（4900/4901/4902 等）→ 通知使用者回站內用 QuickPayment 補付。
5. 之後每期同樣 Recurring；取消訂閱 → 停止排程，必要時 unbind。退款走 refund API。

## 11. 本次查證統計

官方頁面實際讀取約 30 頁（api/trade/create、refund、refundQuery、query、cancel、capture；customer create/getToken、paymentInstrument query/unbind/create；event 總覽與 model、payment、refund、instrument；sdk/payment、initData、example/CreditCard；guide/quick、guide/normal；overview 三頁；appendix errorCode、paymentMethod、sessionStatus、sdkErrorCode；kyc 概覽）。第三方：GitHub 兩個專案共 6 個檔。
未能取得：付款狀態／subStatus／退款狀態完整列舉、會員查詢獨立 API 頁、爭議事件細節、theme 頁。

## 12. 官方文件內部不一致（實作以 sandbox 實測為準）

1. 退款事件型別：event/model 頁清單 `trade.refund.succeeded`，refund 事件頁範例 `refund.succeeded`。
2. 付款工具狀態：guide/quick 列 `SUCCESSED/CREATED/DISABLED/FAILED`；query API 頁列 `CREATED/ENABLED/SUCCESSED/DISABLED`。
3. `bindCard.textType` 位置：guide/quick 在 protocol 內；sdk/initData 為與 protocol 並列。
4. Recurring 範例精簡，但 create 頁欄位表標註大量必填（order、billing、returnUrl、language、acquirerType）。
5. customer/token 的 `customerId` 欄位說明（特店唯一客戶識別，String 128）與流程（傳 SLP 會員 ID，回傳 String 32）不一致。
6. 會員查詢在 guide/quick 為 GET，其餘 API 全為 POST。
