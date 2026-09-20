# 本週上架實作與驗證結果

2026-09-21。整合分支已推送，草稿 PR：https://github.com/dropout-tech/waddle/pull/55 。不能視為正式環境啟用。

## 已完成本機實作

- 會員／推薦設定、原生購買與恢復入口、權威權益確認。
- RevenueCat 即時與定期校準（持久queue、lease、重試）。
- 推薦唯一綁定、驗證與上限、雙方3個月「待商店兌換」ledger；活動關閉。
- 會議3／50場、2／10人以及共享2／20人伺服器限制，開關關閉、舊帳號保留。
- Google獨立OAuth、加密token、專屬日曆、單向更新／刪除／衝突／分批及可選前景自動同步。
- Android/API36實際專案、靜態打包、12個Capacitor插件同步；未產生可驗證APK/AAB。
- 刪帳清理本人圖片、Google撤銷結果提示、刪除期間及過期帳號JWT上傳限制；Apple重授權流程未完成，明確阻止誤刪並提示。

## 驗證

最終web production build、Capacitor static export及Android cap sync通過。中英文桌面／手機會員和Google流程36項、會議54項通過。Billing/reconciliation 26項、Google handler17項／foreground12項、刪帳handler10項通過；另有Google核心重複規則/時區斷言與各個隔離PostgreSQL實际角色/鎖/額度/刪帳policy測試。

所有API／Email／付款／Google事件測試均mock或本機資料庫，沒有寄出真實邀請、收款或修改真實日曆／帳號。測試通過不代替商店沙盒和真機驗收。

## 尚未啟用與明確阻擋

目前Supabase connector對Huddle專案jnikcndiexjojgvicohf明確無權限，無法執行正式migration/Edge發布。正式寄信、GoogleOAuth、RevenueCat商品/官方推薦優惠仍需後台設定。推薦商品發放與權威兌換同步、Apple刪帳重授權、原生Google授權返回、AndroidSDK與簽章／真機、商店申報仍需完成，不能稱全部上架完成。推薦防刪帳重領的資料留存與風控政策需定稿再開活動。

Google同步在瀏覽器/hosted desktop可執行，原生App授權入口停用；關閉App後的背景同步未提供。SDK授權問題已向使用者提出，目前未接受條款或安裝。

## 官網獨立發布

官網影片/字幕/英文產品圖以PR54單獨發布：https://github.com/dropout-tech/waddle/pull/54 。本地107項測試通過，安全檢查通過。已合併main：1a50f3a2db0bd053040abefcf2959c4c3525cd68。最終provider與live狀態依另一份release紀錄；不能只依merge宣稱上線。

## 必要部署順序

先取得Huddle專案存取權並在staging驗證既有billing和meeting migration；再依版本序部署新增referral、Google、quota、queue、sharing、account deletion guard。刪帳guard migration必須先於新delete-account function。設定server secrets後部署functions，最後發布前端。付款/推薦/額度flags各自有明確驗收後才開啟。

正式上架核對清單、日期與定價理由見2026-09-21-week-launch-plan.md與2026-09-21-launch-readiness.md。
