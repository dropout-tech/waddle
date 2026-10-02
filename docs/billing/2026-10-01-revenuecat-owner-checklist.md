# 內購上線：老闆操作清單（RevenueCat／Xcode／Apple）— 2026-10-01

規矩：密碼、金鑰、銀行資料一律老闆本人貼；工程師只給步驟與變數名。任何「提交以供審查」都不按。
官方來源見 `2026-10-01-revenuecat-research-notes.md`。

## 現況（2026-10-02 更新，依另一個 session 的交接紀錄）
- ✅ 老闆本人已做：付費 App 協議「有效」（至 2027-09-28）、銀行（TWD）、台灣稅務表、W-8BEN、小型企業方案已送出（等 Email）、RevenueCat 已註冊、In-App Purchase Key（.p8）已上傳 RevenueCat。
- ✅ 已建：App Store Connect 訂閱群組 Huddle Pro＋`huddle_pro_monthly`（已設 NT$150）、`huddle_pro_annual`；兩商品已掛到 RevenueCat 權益 **`huddle_planner_pro`**（注意：不是 `pro`）。
- ⬜ 老闆待做：年繳設價 NT$990、兩商品設「免費 2 週」試賣優惠、RevenueCat Offering `default` 加入 `$rc_monthly`／`$rc_annual`、點 RevenueCat 驗證信、Xcode 加 In-App Purchase（第四節）。
- ⬜ 工程待做（要先問老闆）：E1 沙盒方案實作、部署 webhook、設 4 把 Supabase secret（`REVENUECAT_PRO_ENTITLEMENT_ID` 要填 `huddle_planner_pro`）。
→ 下面第一、三節大部分已完成，保留作紀錄。

## 一、註冊 RevenueCat（老闆本人，約 10 分鐘）
1. 到 https://app.revenuecat.com 用 email 註冊（建議用公司信箱，之後可邀請工程師進來）。
2. 信用卡：註冊時會問，**可以先跳過**。每月營收 US$2,500 以下免費；超過收 1%，沒綁卡時部分功能會被鎖。
3. 建立專案：左上 Projects 下拉 →「+ Create new project」→ 名稱填 `Huddle`。新專案自動附一個 **Test Store**（假商店，不用等 Apple 協議就能測）。
4. 邀請工程師：在專案設定的成員／Collaborators 頁（名稱以畫面為準）用 Admin 權限邀請（之後專案設定可由工程師帶著做）。
5. 做完跟工程師說「RevenueCat 註冊好了」。**不要把任何金鑰貼在對話裡。**

## 二、專案設定（工程師帶著做；金鑰由老闆貼）
| 步驟 | 在哪 | 誰貼 | 放到哪 |
|---|---|---|---|
| 建 entitlement（實際已建為 `huddle_planner_pro`）、offering `default`、package `$rc_monthly`／`$rc_annual` | RevenueCat → Product catalog | 工程師可操作 | — |
| Test Store 建兩個測試商品（月／年） | RevenueCat → Test Store | 工程師可操作 | — |
| Test Store 公開金鑰（`test_` 開頭） | Project settings → API keys | 老闆 | 只放本機 `.env.local` 的 `NEXT_PUBLIC_REVENUECAT_IOS_KEY`，**絕不進 TestFlight／正式版**（Release 版會故意當機） |
| 後端密鑰（V1，`sk_` 開頭） | Project settings → API keys → 新增 secret key，選 **V1** | 老闆 | Supabase secrets：`REVENUECAT_SECRET_API_KEY` |
| Webhook | Integrations → Webhooks → Add new configuration；網址 `https://<Supabase專案代號>.supabase.co/functions/v1/revenuecat-webhook`；Authorization header 自訂一串長亂碼；環境依 E1 方案選 | 老闆貼亂碼 | 同一串放 Supabase secrets：`REVENUECAT_WEBHOOK_AUTHORIZATION` |
| Entitlement ID | `huddle_planner_pro` | 工程師 | `REVENUECAT_PRO_ENTITLEMENT_ID` |
| App ID（`app` 開頭的識別碼） | Project settings → Apps | 工程師 | `REVENUECAT_APP_IDS`（Test Store 與 App Store 兩個都放，逗號分隔） |
※ 設 Supabase secrets、部署 webhook 前，工程師會先問你。

## 三、Apple 那邊（只有老闆本人能做）
1. **簽付費 App 協議**：App Store Connect → 商務（Business）→ 協議。現在狀態「新」＝還沒簽。
2. **銀行帳戶與稅務表格**：同一頁。**先問會計師**：台灣稅籍編號送出後不能自己改；美國預扣稅（W-8BEN）怎麼填要會計師確認。狀態要變成「Clear」沙盒才抓得到商品。
3. 簽完協議後申請 **小型企業方案**（抽成 30%→15%）。
4. 產生 **In-App Purchase Key（.p8）**：Users and Access → Integrations → In-App Purchase → 產生。**只能下載一次**，下載後本人上傳到 RevenueCat（App Store app 設定頁，連同 Issuer ID）。
5. 在 RevenueCat 新增 App Store app：Bundle ID `com.lazylazy.huddle`。加完會產生正式公開金鑰（`appl_` 開頭）→ TestFlight／正式版用這把。
6. 建商品（工程師可帶）：訂閱群組＋`huddle_pro_monthly`（NT$150）、`huddle_pro_annual`（NT$990），各加 2 週免費試用（Introductory Offer）。第一個訂閱要**跟 App 版本一起送審**。

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
**老闆 2026-10-02 拍板：「綁原帳號，不給換」→ 選 `Keep with original App User ID`。**（之前建議的預設 Transfer 不採用。）
- 效果：訂閱永遠屬於第一次購買的 Huddle 帳號；同一個 Apple ID 在別的 Huddle 帳號購買或按「恢復購買」，RevenueCat 會拒絕（錯誤碼 7／13）。
- App 已處理（PR #140，cfdfc60）：這時購買卡顯示「這個 Apple ID 的 Huddle Pro 訂閱已綁定另一個 Huddle 帳號，無法轉移。請登出後改用當初購買時的帳號登入；需要協助請聯絡客服。」
- 待老闆本人在 RevenueCat 後台把 Restore behavior 改成這個選項（沙盒用同一政策即可）。
- 已知代價：刪了舊帳號再重辦的人，買過的訂閱找不回來（RevenueCat 仍綁在已刪帳號）。建議補強：刪帳號時順便刪除 RevenueCat 上的顧客紀錄，訂閱就能在新帳號恢復；要改 delete-account 並部署，先問老闆。
