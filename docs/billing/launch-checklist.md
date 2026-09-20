# Huddle 訂閱準備與啟用檢查

更新：2026-09-20。核定提案：免費版 + Pro，參考 NT$149／月、NT$1,290／年。這些是產品定價方向，實際商品 ID、可售區域、稅務、商店可用價位與本地化價格仍待管理後台設定。現有免費功能不變；沒有付款 UI 上線，也沒有開始收費。

## 已準備的程式

- `lib/billing/plans.ts`：方案參考值、明確未開啟購買狀態。不得將參考金額當成結帳價格。
- `lib/billing/native-adapter.ts`：供原生 SDK 接入的登入／商品／購買／恢復／登出介面。未注入 SDK、未設定公開 key、未明確啟用時一律回傳 `not_configured`，不模擬成功。收到商店完成結果只代表待後端同步。
- `lib/billing/revenuecat-driver.ts` 與 `load-native-session.ts`：已實作官方 Capacitor SDK driver，原生平台且環境旗標啟用、公開 key 與登入存在才動態 import SDK。購買與恢復只在明確呼叫時執行，SDK 返回的價格才可供結帳顯示。
- `supabase/functions/revenuecat-webhook`：可信 webhook 觸發 RevenueCat GET subscriber，再將權威狀態原子寫入；不信任 webhook 裡的金額或到期欄位。驗證 Authorization，app allowlist，正式 endpoint 忽略 SANDBOX。TRANSFER 同步轉出與轉入的 UUID。
- migration `20260920082633_billing_entitlements.sql`：使用者只能讀自己的權限；只能 service role 寫入。事件 ID 去重與快照伺服器時間排序在同一 transaction。既有帳號刪除可 cascade；已刪除的 transfer alias 不阻擋其他帳號同步。
- 到期時間每次讀取必須與伺服器現在時間比較；取消續訂仍可使用至到期；退款/移除 entitlement 撤銷，允許 RevenueCat 明確給出的寬限期。只支援有到期日的 recurring production 訂閱。

這次 **未套用 production migration、未部署 Edge Function、未建立商店商品、未啟用原生購買流程**。Web 部署不會自動完成這些步驟。

## 啟用順序與缺少項目

1. Apple Developer / App Store Connect 與 Google Play Console 帳號、合約、收款與稅務資料；確認 app bundle/package ID。Android 專案與商店版本仍需建立／驗證。
2. 建立兩個商店的月繳、年繳自動續訂商品；Apple 放在同一 subscription group，Google 設定對應 base plan。確認本地化價格、取消與隱私條款。商品 ID 草案可採 iOS `huddle_pro_monthly` / `huddle_pro_annual`、Android subscription `huddle_pro` 搭 `monthly` / `annual` base plan；RevenueCat offering 使用 `$rc_monthly` / `$rc_annual` package。這些只供建立商品時確認，沒有寫死到付款程式，也不是已存在的商店商品。
3. RevenueCat 建專案與兩個 app，連商店 server credentials，建立 Pro entitlement 與 offering，將所有已核准商品掛到同一 entitlement。所有平台 App User ID 必須是登入後 Supabase `auth.users.id`；不可 email、device ID 或 anonymous 購買。決定並測試 restore transfer policy，避免不同 Huddle 帳號共享同一商店購買。
4. 已鎖版官方 `@revenuecat/purchases-capacitor@13.6.0` 並完成實際 driver；還需 `npx cap sync` 和 iOS In-App Purchase capability，Android launchMode 應為 standard 或 singleTop。在登出/換帳號時 dispose 舊 session，再初始化新帳號。購買按鈕只顯示 SDK 返回的 localized price，不用上面的參考數字。driver 已區分使用者取消與失敗；仍需購買／pending／恢復／管理訂閱 UI 與原生裝置驗證。設定 `NEXT_PUBLIC_REVENUECAT_IOS_KEY`、`NEXT_PUBLIC_REVENUECAT_ANDROID_KEY`（僅 RevenueCat 公開 SDK key）；沙盒測試完成後才能將 `NEXT_PUBLIC_BILLING_ENABLED=true` 加進正式 build，沒有設定時維持不可購買。
5. 在隔離 staging 套用 migration、部署 webhook。正式環境啟用前執行 RLS advisors、備份與 staging 流程測試。先確認 target project；不要對正式庫執行 reset。
6. 在 Edge secrets 設定：`REVENUECAT_SECRET_API_KEY`（server secret）、`REVENUECAT_WEBHOOK_AUTHORIZATION`（長随机完整 header，例如 `Bearer ...`）、`REVENUECAT_PRO_ENTITLEMENT_ID`、`REVENUECAT_APP_IDS`（逗號分隔 RevenueCat app IDs）。Supabase 自動注入 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`。以上 server secrets 不得加 NEXT_PUBLIC。
7. 用 CLI `supabase functions deploy revenuecat-webhook --no-verify-jwt --project-ref <confirmed-project>` 部署。這個 webhook 不使用 Supabase JWT，函式自己驗證強 secret。RevenueCat webhook Authorization 必須完全一致，只訂閱 production。無設定時 endpoint 回 503；測試 webhook 僅檢查連通性，不授權。
8. 此 endpoint 刻意拒絕 sandbox 權益。要做端到端沙盒，先在獨立 staging project 配置專用 sandbox 版環境策略並驗證隔離；不得解除 production 的 sandbox 限制。上架前必須補完真正沙盒購買／恢復測試，目前 mock 測試不能取代。
9. 補上有驗證的 server reconciliation（定時校準及使用者購買/恢復後同步，帳號來源只能驗 JWT 得到的 user.id）。RevenueCat retry 次數有限，不能只靠 webhook 保證永久一致；監控 401/503、失敗重試與同步延遲。此項尚未實作，因此目前不可開正式收費。
10. 定義 Pro 額度與既有使用者遷移，不回收原本可用功能；到期保留閱讀/匯出/刪除。任何 paid server action 都要後端驗證 user_id + expires_at，不能只信 client helper、metadata 或 SDK。現有功能沒有任何 entitlement enforcement。
11. 完成兩個商店 sandbox 購買、續訂、付款失敗/寬限期、取消、到期、退款、restore、帳號切換、轉移、跨裝置、重複/亂序 webhook、離線恢復、刪帳號測試後，才明確 enable 購買。

## 本地驗證

```
node --experimental-strip-types --test scripts/tests/billing-*.test.mjs
bash scripts/tests/billing-database.sh
```

DB script 使用全新本機 PostgreSQL cluster / 私有 Unix socket，結束刪除，不讀任何專案連線字串。涵蓋 migration 真實執行、RLS 隔離、service-only 寫入、重複事件、亂序快照、撤銷與已刪帳號。

## 官方依據

- [RevenueCat webhook](https://www.revenuecat.com/docs/integrations/webhooks)：Authorization、重試、GET subscriber 權威同步。
- [RevenueCat REST API](https://www.revenuecat.com/docs/api-v1)：subscriber / entitlement 狀態。
- [RevenueCat Capacitor](https://www.revenuecat.com/docs/getting-started/installation/capacitor)：原生 SDK 安裝。
- [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth)：外部 webhook 認證邊界。
