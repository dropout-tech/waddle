# Google 登入顯示 Huddle：設定紀錄（2026-10-02／10-03）

## 結果
Google 選帳號畫面從「繼續使用 jnikcndiexjojgvicohf.supabase.co」變成「繼續使用 Huddle」
（10-03 在 localhost 用老闆帳號實測確認）。全程免費。

## 設定在哪（全部在老闆個人帳號 lazydragon0247 的 Google Cloud 專案「Huddle Calendar」）
- 專案：huddle-calendar-510304（編號 959162587714），發布狀態已改「實際運作中」（老闆同意）。
- 品牌：App 名稱 Huddle、首頁 https://huddle.lazy72.com/about、隱私 /privacy、條款 /terms、
  授權網域 lazy72.com、waddle.zeabur.app。**沒上傳標誌**——上傳標誌會觸發 Google 審核。
- 用戶端「Huddle Web Login」（網頁）：959162587714-dt5s9ullq0c40sk5172v3jtove1bcrcv…
  重新導向 URI：https://huddle.lazy72.com/auth/google、https://waddle.zeabur.app/auth/google、
  http://localhost:3000/auth/google。
- 用戶端「Huddle iOS Login」（iPhone）：959162587714-54uj7jis0t0b4hk0hgbs71usj4bvm5d1…
  （Bundle com.lazylazy.huddle、Team PQZ8V7ZAXU）。
- 同一個專案也管 Google 日曆連結（「huddle web」用戶端）。

## Supabase（正式專案 penguinflow）
Google provider 的 Client IDs 是逗號清單，**第一個必須維持舊的 507405611281-d0pm…**——
桌面版與舊版 iPhone App 的轉址登入用的是第一個（含它的 Client Secret）。
新的兩個接在後面。⚠️ 用 Management API 改 `external_google_additional_client_ids`
會把整串寫進主欄位、蓋掉第一個（10-02 16:17 UTC 實際發生，約 1～2 分鐘後改回，無使用者受影響）；
要改請直接 PATCH `external_google_client_id` 寫完整清單，改完立刻驗
`/auth/v1/authorize?provider=google` 轉去的 client_id 仍是 507405611281。

## 舊設定
專案 507405611281（不知道屬於哪個帳號，老闆的 Chrome 帳號都打不開）仍是 Supabase 的主要 Google 設定，
桌面版用它，畫面仍顯示 supabase.co。不要刪 Supabase 裡的它。

## 之後（選做）
- 品牌驗證／上傳標誌：要的話在「品牌」頁上傳 120×120 標誌並送審（需 Search Console 驗證 lazy72.com）。
- Google 日曆的敏感權限審核：未通過前，其他使用者連日曆會看到「未驗證」警告、上限 100 人。
