# iOS 內購第一階段：開工前風險審查（2026-10-01）

**判定：go。** security-risk 自評 4／5（碰金流畫面，但全在功能旗標後面、不部署、不動正式庫，回滾明確）。

## 範圍
- 動：`lib/billing/*`、`components/operations/membership.tsx`、新增 `components/billing/*`、`lib/i18n/dict/*`、對應測試與 e2e 腳本。
- 不碰：`supabase/migrations`、`supabase/functions`、正式資料庫、任何部署、`.env*` 真金鑰、
  `ios/App/App.xcodeproj/project.pbxproj`、`*.entitlements`（Apple 登入的權限宣告是另一件待辦）、
  `hooks/use-waddle-data.ts`（並行 session 在改）。

## 風險表
| 項目 | 風險 | 緩解 |
|---|---|---|
| 安全 | 用戶端自己判定「已是 Pro」 | Pro 身分只認伺服器 `billing_entitlements`／`pro_until`；購買成功後顯示「同步中」，不在前端放行 |
| 安全 | 金鑰外洩 | 只用 RevenueCat 公開 SDK key（`NEXT_PUBLIC_`）；server secret 不進前端；不裝新套件 |
| 資料 | 無 schema 變更 | — |
| 權限 | 購買掛到錯的帳號 | RevenueCat App User ID 一律用登入後的 Supabase user id；登出／換帳號時釋放舊 session |
| 相容 | 網頁版／桌面版會員頁被改壞 | 旗標未開時畫面與現況一致，前後各截圖比對 |
| 相容 | iOS 隱藏優惠碼／推薦碼輸入框 | 圓桌決議 #6（Apple 3.1.1）；只在原生 iOS 隱藏，網頁版不變 |
| 審查 | 訂閱畫面缺 Apple 3.1.2 必要資訊 | 畫面必含：方案名稱、週期、SDK 回傳的在地化價格、自動續訂說明、條款與隱私權連結、恢復購買 |
| 回滾 | — | `NEXT_PUBLIC_BILLING_ENABLED` 不設即整段不啟動；分支未合併前不影響任何人 |

## 完成時要跑的驗證（現在先寫死）
1. 購買流程狀態的單元測試（假 driver）：未設定／載入商品／購買中／使用者取消／失敗／待處理／成功待同步／恢復購買。
2. Playwright 390px：旗標開＋假 driver 的購買畫面截圖；旗標關的會員頁截圖與改動前一致。
3. 切 English 無殘留中文。
4. `pnpm build` 與 `pnpm build:cap` 通過。

## 假設（未驗證，錯了要回頭改）
- 結帳價格一律用 SDK 回傳值；150／990 只是參考（2026-10-02 月繳改 150）。
- 商品 ID 草案 `huddle_pro_monthly`／`huddle_pro_annual`，RevenueCat entitlement `pro`、package `$rc_monthly`／`$rc_annual`。
- 沙盒要能抓到商品，App Store Connect 的「付費 App 協議」與銀行、稅務資料需先生效。
- App Store 上「Huddle」這個名稱是否可用，未查。
- 第二階段（部署 webhook、設 4 把 secret、伺服器對帳、沙盒實購）需要 RevenueCat 帳號與老闆同意後才做。
