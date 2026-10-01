# 內購上線：老闆操作清單（RevenueCat／Xcode／Apple）— 2026-10-01

規矩：密碼、金鑰、銀行資料一律老闆本人貼；工程師只給步驟與變數名。任何「提交以供審查」都不按。
官方來源見 `2026-10-01-revenuecat-research-notes.md`。

## 一、註冊 RevenueCat（老闆本人，約 10 分鐘）
1. 到 https://app.revenuecat.com 用 email 註冊（建議用公司信箱，之後可邀請工程師進來）。
2. 信用卡：註冊時會問，**可以先跳過**。每月營收 US$2,500 以下免費；超過收 1%，沒綁卡時部分功能會被鎖。
3. 建立專案：左上 Projects 下拉 →「+ Create new project」→ 名稱填 `Huddle`。新專案自動附一個 **Test Store**（假商店，不用等 Apple 協議就能測）。
4. 邀請工程師：在專案設定的成員／Collaborators 頁（名稱以畫面為準）用 Admin 權限邀請（之後專案設定可由工程師帶著做）。
5. 做完跟工程師說「RevenueCat 註冊好了」。**不要把任何金鑰貼在對話裡。**

## 二、專案設定（工程師帶著做；金鑰由老闆貼）
| 步驟 | 在哪 | 誰貼 | 放到哪 |
|---|---|---|---|
| 建 entitlement `pro`、offering `default`、package `$rc_monthly`／`$rc_annual` | RevenueCat → Product catalog | 工程師可操作 | — |
| Test Store 建兩個測試商品（月／年） | RevenueCat → Test Store | 工程師可操作 | — |
| Test Store 公開金鑰（`test_` 開頭） | Project settings → API keys | 老闆 | 只放本機 `.env.local` 的 `NEXT_PUBLIC_REVENUECAT_IOS_KEY`，**絕不進 TestFlight／正式版**（Release 版會故意當機） |
| 後端密鑰（V1，`sk_` 開頭） | Project settings → API keys → 新增 secret key，選 **V1** | 老闆 | Supabase secrets：`REVENUECAT_SECRET_API_KEY` |
| Webhook | Integrations → Webhooks → Add new configuration；網址 `https://<Supabase專案代號>.supabase.co/functions/v1/revenuecat-webhook`；Authorization header 自訂一串長亂碼；環境依 E1 方案選 | 老闆貼亂碼 | 同一串放 Supabase secrets：`REVENUECAT_WEBHOOK_AUTHORIZATION` |
| Entitlement ID | 上面建的 `pro` | 工程師 | `REVENUECAT_PRO_ENTITLEMENT_ID` |
| App ID（`app` 開頭的識別碼） | Project settings → Apps | 工程師 | `REVENUECAT_APP_IDS`（Test Store 與 App Store 兩個都放，逗號分隔） |
※ 設 Supabase secrets、部署 webhook 前，工程師會先問你。

## 三、Apple 那邊（只有老闆本人能做）
1. **簽付費 App 協議**：App Store Connect → 商務（Business）→ 協議。現在狀態「新」＝還沒簽。
2. **銀行帳戶與稅務表格**：同一頁。**先問會計師**：台灣稅籍編號送出後不能自己改；美國預扣稅（W-8BEN）怎麼填要會計師確認。狀態要變成「Clear」沙盒才抓得到商品。
3. 簽完協議後申請 **小型企業方案**（抽成 30%→15%）。
4. 產生 **In-App Purchase Key（.p8）**：Users and Access → Integrations → In-App Purchase → 產生。**只能下載一次**，下載後本人上傳到 RevenueCat（App Store app 設定頁，連同 Issuer ID）。
5. 在 RevenueCat 新增 App Store app：Bundle ID `com.lazylazy.huddle`。加完會產生正式公開金鑰（`appl_` 開頭）→ TestFlight／正式版用這把。
6. 建商品（工程師可帶）：訂閱群組＋`huddle_pro_monthly`（NT$149）、`huddle_pro_annual`（NT$990），各加 2 週免費試用（Introductory Offer）。第一個訂閱要**跟 App 版本一起送審**。

## 四、Xcode 加 In-App Purchase（老闆本人，約 3 分鐘）
指令列沒有 Apple 帳號（會報 No Accounts），所以這步要在 Xcode 視窗做。
1. 在終端機貼這行打開專案（工程師的工作資料夾，避免改到主資料夾目前的分支）：
   `open "/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui/.claude/worktrees/ecstatic-mahavira-1e4469/ios/App/App.xcodeproj"`
2. Xcode 選單 Xcode → Settings → Accounts：確認有登入你的 Apple 開發者帳號（Team PQZ8V7ZAXU）。
3. 左邊點最上面藍色的 **App** 專案 → 中間 TARGETS 選 **App**（不是 HuddleWidgets／HuddleWatch）。
4. 上方分頁 **Signing & Capabilities** → 左上「**+ Capability**」→ 搜尋 **In-App Purchase** → 雙擊加入。
5. 看到清單多了一塊「In-App Purchase」就完成，按 ⌘S 存檔、關掉 Xcode，跟工程師說「加好了」。
   工程師會用 git diff 確認改了什麼並收進購買畫面分支。
（不用按 Build、不用 Archive、不用上傳。）

## 五、恢復購買的帳號轉移政策（RevenueCat → Project settings → General → Restore behavior）
情境：同一個 Apple ID，先在 Huddle 帳號 A 買了 Pro，後來登入帳號 B 按「恢復購買」。
| 選項 | 會發生什麼 | 適合 |
|---|---|---|
| **Transfer to new App User ID（預設，建議）** | Pro 轉到 B，A 失去 Pro；同一時間只有一個帳號是 Pro | 刪帳號後重辦、換信箱的人都能自助找回訂閱，客服最少 |
| Transfer if there are no active subscriptions | A 的訂閱還有效就不轉，B 會失敗 | 想防止一份訂閱在多個帳號輪流用 |
| Keep with original App User ID | 永遠綁 A；B 按恢復直接報錯 | 最嚴格；刪了 A 的人會永遠找不回，客服負擔大 |
| Share between App User IDs (legacy) | 新專案不能選 | — |

建議用預設：符合「免費版要好用、不刁難用戶」原則；Apple 要求 App 能刪帳號，刪了重辦的人也能找回訂閱；
最壞情況只是一份訂閱在自己的幾個帳號間搬來搬去，不會變成多人同時用。webhook 已處理 `TRANSFER` 事件。
另有「沙盒用不同政策」的開關，維持跟正式一樣即可。
