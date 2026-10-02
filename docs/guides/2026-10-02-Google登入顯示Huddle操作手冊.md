# Google 登入顯示 Huddle：老闆操作手冊（2026-10-02）

目標：Google 登入畫面從「繼續使用 jnikcndiexjojgvicohf.supabase.co」改成
「繼續使用 huddle.lazy72.com」，品牌驗證通過後再變成「Huddle」。全程不花錢。

程式已寫好（分支 `feat/google-idtoken-login`），**但要先做完下面第一段，網頁版才能上線**，
否則新的登入方式會被 Google 擋下（畫面出現 redirect_uri_mismatch 錯誤）。

---

## 一、網頁版：在 Google 登記新的「回來網址」（約 3 分鐘，上線前必做）

1. 開 https://console.cloud.google.com ，左上角切到專案編號 **507405611281** 的那個專案。
2. 左邊選單 →「Google Auth Platform」→「Clients（用戶端）」。
3. 點開類型是「Web application（網頁應用程式）」、ID 開頭是 `507405611281-d0pm…` 的那一個。
4. 找到「Authorized redirect URIs（已授權的重新導向 URI）」，按「新增 URI」，**新增這三筆**：
   - `https://huddle.lazy72.com/auth/google`
   - `https://waddle.zeabur.app/auth/google`
   - `http://localhost:3000/auth/google`
5. ⚠️ 原本那筆 `https://jnikcndiexjojgvicohf.supabase.co/auth/v1/callback` **不要刪**——
   桌面版和還沒更新的 iPhone App 還在用它。
6. 按「儲存」。Google 說生效可能要 5 分鐘到幾小時。

做完跟我說一聲，我會用程式確認 Google 已經接受新網址，再請你點頭上線。

## 二、iPhone App：建立 iOS 專用的登入身分（約 3 分鐘）

1. 同一個專案 →「Google Auth Platform」→「Clients」→「＋ Create client（建立用戶端）」。
2. Application type 選「**iOS**」。
3. Name：`Huddle iOS`
4. Bundle ID：`com.lazylazy.huddle`
5. Team ID（若有欄位）：`PQZ8V7ZAXU`
6. 按「Create」，畫面會出現一串 **Client ID**（長得像 `507405611281-xxxx.apps.googleusercontent.com`）。
   **把這串傳給我**（這串是公開資訊，不是密碼，可以直接貼在對話裡）。

收到後我會：填進程式、在 Supabase 登記這個 iOS 身分（會先問你）、裝到你的 iPhone 實測。

## 三、品牌驗證：讓畫面顯示「Huddle」（免費，Google 審 2–3 個工作天）

步驟、要準備的東西、英文說明文字都已寫在
`docs/guides/2026-10-01-新網域收尾操作手冊.md` 第四段（分支 claude/musing-proskuriakova-1a31a5），重點：

1. Search Console 驗證 `lazy72.com`（在 Cloudflare 加一筆 TXT，不影響收信）。
2. Google Auth Platform →「Branding」：App name 填 `Huddle`、首頁 `https://huddle.lazy72.com/about`、
   隱私權 `https://huddle.lazy72.com/en/privacy`、條款 `https://huddle.lazy72.com/en/terms`、
   Authorized domains 加 `lazy72.com`。
3. 送出驗證。Google 寄信來問問題時，轉給我一起回。

**已知風險（先講清楚）**：Authorized domains 清單裡如果還有 `supabase.co`（桌面版要用），
Google 有可能以「網域不是你的」為由退件。網路上有人遇過，但沒有 Google 官方說法。
真的被退的話，解法是把桌面版的登入搬到另一個 Google 專案，屆時我再處理，你不用先做。

---

## 做完會變成怎樣

| | 網頁版 | iPhone App | 桌面版 |
|---|---|---|---|
| 第一段做完＋上線 | 顯示 huddle.lazy72.com | 不變 | 不變（仍顯示 supabase.co） |
| 第二段做完＋App 更新 | — | 原生 Google 登入視窗 | 不變 |
| 第三段通過 | 顯示 Huddle | 顯示 Huddle | 不變 |

桌面版暫時不改：它是從電腦瀏覽器登入完再跳回桌面程式，換新做法需要把登入憑證傳過程式之間，
安全上比較麻煩；而且已經裝好的舊桌面版本來就不會自動更新。
