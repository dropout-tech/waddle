# Huddle 官網與桌面測試版 0.1.1

## 這次發布

- 官網固定網址 `/about`，未登入訪客首頁顯示官網，已登入者繼續使用工作面板。
- 功能介紹、使用情境、Mac Apple Silicon / Intel 下載、常見問題、資料與隱私說明。
- Google / Apple 桌面 OAuth 改用系統瀏覽器，完成後點「開啟 Huddle」返回程式，附取消與逾時處理。
- 官網公布預定 Pro 方案：NT$149／月、NT$1,290／年；明確標示尚未開放購買。
- RevenueCat Capacitor SDK adapter、訂閱權限 schema、驗證 webhook 與操作文件已準備。

## 安装及限制

下載對應晶片的 DMG，把 Huddle 放入「應用程式」。既有 0.1.0 桌面程式沒有自動更新功能，需要下載 0.1.1 重新安裝才能取得新的登入流程。網頁功能仍由正式站提供。

這是尚未使用 Developer ID 簽署及 Apple 公證的 macOS 測試版。尚未宣稱 Mac App Store / iOS App Store / Google Play 上架；Windows 安裝包也不在本次已驗證發布範圍。

Google 真實帳號同意畫面尚須使用者實際完成驗證。自動測試可證明 Electron 啟動、PKCE 交換、深層連結、安全邊界與模擬 session；不能代表真實 Google consent 已完成。

## 訂閱尚未啟用

目前核心功能仍免費。沒有支付 UI 或自動扣款；production migration / Edge Function 尚未套用。仍需商店帳號與收款資料、商店商品、RevenueCat credentials、原生建置同步、訂閱 UI、後端定期校準與真實沙盒驗證。詳細順序見 `docs/billing/launch-checklist.md`。

## 驗證

- Next.js production build / TypeScript。
- 桌面 OAuth 與 navigation 單元測試 6 項；真實 Electron runtime 整合 8 項，包含獨立 process 重啟與 PKCE 持久化。
- RevenueCat adapter / webhook 測試 13 項，另有隔離 PostgreSQL migration / RLS / 退款 / 亂序測試。
- 官網及 callback 瀏覽器回歸 23 項，包含 320 / 390 / 1440 寬度。
- Supabase production 模擬取消回跳證明 desktop state 可保留；沒有向 Google 登入或更改正式資料。
