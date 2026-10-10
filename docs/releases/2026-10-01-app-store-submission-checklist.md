# Huddle Planner — App Store 送審前準備清單

建立：2026-10-01。**2026-10-03 盤點更新**（分支 chore/ios-submission-gaps，基於 main dbf3c8c；改了什麼見文末〈2026-10-03 更新紀錄〉）。
**老闆規定：不急著送審，送審前他要親自大檢查一遍；任何人（含 AI）不得自行按「提交以供審查」。銀行稅務不可代填。**
App Store Connect：Apple ID 6818073462、SKU huddle-ios-001、套件識別碼 com.lazylazy.huddle。
狀態標記：✅ 完成並驗過／🟡 進行中／⬜ 未做／🧑 要老闆本人做或決定。
「依交接紀錄」＝後台設定，repo 內無法驗證，送審前請老闆在後台目視確認一次。

## 一、商店資料（App Store Connect）

| 項目 | 狀態 | 備註 |
|---|---|---|
| App 紀錄、名稱 | ✅ | 英文 Huddle Planner；繁中 Huddle 企鵝計畫 |
| 副標題 | ✅ | Tasks, Focus & a Penguin／任務、專注、行事曆 |
| 主要類別 | ✅ | 生產力工具（重新載入後確認） |
| 年齡分級問卷 | 🧑 | App 資訊頁。注意：App 有「使用者自建內容＋分享／組織協作」，問卷「使用者產生內容」相關題要照實答 |
| 內容版權聲明 | 🧑 | App 資訊頁（App 內音樂／圖片若非自製要能說明來源） |
| App 隱私權問卷＋隱私權政策網址 | 🧑 | **勾選對照表已備**：`docs/releases/2026-10-03-app-privacy-label-draft.md`（勾 8 項，全「連結使用者、不追蹤、App 功能」）。政策網址 https://huddle.lazy72.com/privacy 。老闆審後本人填 |
| 定價與供應狀況（App 本體免費、上架國家） | ✅ | 依交接紀錄：175 國扣歐盟 27 國已設 |
| 歐盟《數位服務法》貿易商聲明 | ✅ | 第一版不上歐盟，不需聲明（日後加回歐盟再處理） |
| 描述、關鍵字、宣傳文字、支援／行銷網址（英文＋繁中） | 🧑 | **草稿已備**：`docs/releases/2026-10-03-app-store-metadata-draft.md`（字數已實算在上限內），待老闆審後貼上 |
| 截圖（iPhone 6.9 吋必備） | ⬜ | 2026-10-03 老闆決定**只做 iPhone**：App 與小工具 `TARGETED_DEVICE_FAMILY = 1`（ad5a496），iPad 截圖不需要。要用新版 App（含購買畫面）實機或模擬器截 |
| App 審查資訊（測試帳號、聯絡人、備註） | 🧑 | 審查備註英文稿已備（同 metadata 草稿第 5 節）；**審查帳號要老闆本人在 Supabase 建立**後填入帳密 |
| 加密出口聲明 | ✅ | 2026-10-03 Info.plist 加 `ITSAppUsesNonExemptEncryption = false`（只用 HTTPS 標準加密）；上傳後後台不會再逐版詢問 |

## 二、收款與訂閱

| 項目 | 狀態 | 備註 |
|---|---|---|
| 付費 App 協議 | ✅ | 2026-10-01 老闆本人簽署，後台狀態「有效」（老闆截圖確認）；效期至 2027-09-28，與開發者會員年費同步，到期前須續費 |
| 銀行帳戶、稅務表格 | ✅ | 2026-10-01 老闆本人填完送出：台灣稅務表（公民 ID）、美國 W-8BEN（Part II 租稅協定刻意留空）、Apple 美國外國身分聲明（Title=Owner）、銀行帳戶。**待問會計師**：美國用戶收入的預扣比例、台美租稅協定是否生效（生效可補交新 W-8BEN） |
| 小型企業方案（抽成 15%） | 🟡 | 2026-10-01 老闆已送出申請，等 Apple Email 通知核准 |
| RevenueCat 帳號與設定 | ✅ | 老闆已註冊並建 App；webhook 已部署並打通（TEST 事件 200）。Offering `default`：2026-10-03 已把 $rc_monthly 掛 huddle_pro_monthly、$rc_annual 掛 huddle_pro_annual，儲存後讀回確認（依交接紀錄 HANDOFF.md「iOS 內購線」段）；Restore＝Transfer |
| 訂閱群組＋月繳 NT$150、年繳 NT$990 | ✅ | 群組「Huddle Pro」ID 22431318；月繳 huddle_pro_monthly（6818206890）、年繳 huddle_pro_annual（6818208288）；價格依交接紀錄已設（月 150／年 990）。家人共享未開（開了不能關，待老闆決定） |
| 14 天免費試用（Introductory Offer 2 週） | ✅ | 依交接紀錄已設 |
| 訂閱的審查用截圖與審查備註 | 🧑 | 每個訂閱商品要上傳一張購買畫面截圖（審查專用）；**第一個訂閱必須跟 App 版本一起送審**（版本頁「App 內購買項目與訂閱」區塊勾選兩個商品） |
| Apple 沙盒實際購買測試 | ⬜ | 尚未測。要老闆用沙盒測試員帳號在新版 App 走：購買 → 恢復購買 → 取消 |

## 三、App 本體

| 項目 | 狀態 | 備註 |
|---|---|---|
| 購買畫面（含恢復購買、條款連結、自動續訂說明、試用顯示、到期日） | ✅ | PR #140 已合併。恢復購買 `components/billing/pro-purchase-card.tsx:266`；條款／隱私連結 `:270`、`:271`；自動續訂說明 `lib/billing/paywall-copy.ts:39`、`:48`；入口：頭像選單 →「會員與推薦」`components/user-menu.tsx:219` |
| iOS 打包時要開計費開關 | 🟡 | 已加防呆：`pnpm cap:sync:release` 會先跑 `scripts/ios-release-preflight.mjs`，開關沒開、RevenueCat 不是 `appl_` 正式金鑰、版本不一致、iPad／Watch 又被打開時直接中止（ad5a496；正反測試皆通過）。2026-10-08 補兩道：preflight 多檢查 `NEXT_PUBLIC_SUPABASE_URL`（須是正式專案 `jnikcndiexjojgvicohf`）與 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 有值（在沒有 .env.local 的 worktree 打包會讓 App 一開就卡「出了點小狀況」；在 worktree 打包請先從主資料夾複製 .env.local）；打包完再由 `scripts/ios-bundle-check.mjs` 確認包裡真的含正式 Supabase 網址，沒有就中止。**剩下**：老闆在本機 .env.local 填 `NEXT_PUBLIC_BILLING_ENABLED=true`、`NEXT_PUBLIC_REVENUECAT_IOS_KEY=appl_…`、`NEXT_PUBLIC_SENTRY_DSN` |
| iOS 隱藏優惠碼／推薦碼輸入 | ✅ | 隨 #140 合併（main 的 WebOnly 機制） |
| 網站購買頁在 App 內不可達 | ✅ | `/billing` 原生殼內直接導回首頁（`components/billing/billing-route.tsx:32`、`:36`）；設定的訂閱分頁原生不顯示（`components/modals/settings-modal.tsx:186`）；條款／隱私頁的 SHOPLINE 段落包在 WebOnly，App 內掛載後移除（`components/legal/web-only.tsx`） |
| 條款頁「回到官網」會把 App 內使用者帶到行銷頁 | ✅ | App 建置時頁首品牌與頁尾改指 `/`、文字「回到 Huddle」，網站版不變（b2b10ce；`components/legal/legal-page.tsx:14`、`:38`） |
| 條款／隱私頁仍寫「目前沒有可購買的 Pro 訂閱」 | ✅ | App 建置＋`NEXT_PUBLIC_BILLING_ENABLED=true` 時 8 頁（中英）換成 App Store 開賣版；退款頁加入老闆 10-02 拍板的「Apple 7 天內不退由我們匯款退」（R4 版本 A）。網站版一字不變。驗證 `scripts/e2e/legal-iap-copy-verify.mjs` 三種建置 86 PASS／0 FAIL，反向測試 18 FAIL（b2b10ce＋後續 commit）。**文案待老闆審** |
| 後端同步（webhook 部署、金鑰、定期對帳） | ✅ | 依交接紀錄 webhook 已部署打通 |
| 審查員用測試購買時要能生效 | ✅ | PR #150（commit 3425bb5）：沙盒購買最多開通 Pro 24 小時 |
| 六項 Pro 功能實際上鎖 | 🟡 | 用量門檻已做（#141 等）；送審前請以實機確認購買卡片列出的 5 項 Pro 內容（`pro-purchase-card.tsx:184`）都真的「免費版受限、Pro 解鎖」，否則 2.3 文不符實 |
| 正式簽章（付費團隊）、App Group | ✅ | 四個 target 皆 `DEVELOPMENT_TEAM = PQZ8V7ZAXU`（付費團隊，commit b89f22a）；App 與小工具都有 `group.com.lazylazy.huddle`（`ios/App/App/App.entitlements`、`ios/App/HuddleWidgets/HuddleWidgets.entitlements`）。App 沒用遠端推播（無 @capacitor/push-notifications），不需 aps-environment |
| iOS 的 Apple 登入權限宣告＋實機驗證 | ✅ | PR #117 已合併；老闆 iPhone 14 實機登入成功 |
| Apple 與 Google 登入並列、審查員 Email 登入入口 | ✅ | `app/(auth)/login/page.tsx:169`（Google）、`:184`（Apple）；App 內「用 Email 登入」`:275`（PR #155） |
| Xcode In-App Purchase 設定 | ✅ | PR #160（StoreKit.framework 已連結，`project.pbxproj` App target Frameworks） |
| 版本號統一 | ✅ | 2026-10-03：小工具 0.1.0 → 1.0，與 App、Watch 一致（MARKETING_VERSION 1.0／build 1）。package.json 0.1.3 是桌面版版本，與 iOS 無關、不動。**若後台版本頁建的不是「1.0」**，要把 Xcode 的 MARKETING_VERSION 改成一致 |
| 權限說明字串（相機／相簿） | ✅ | 2026-10-03 新增 NSCameraUsageDescription、NSPhotoLibraryUsageDescription、NSPhotoLibraryAddUsageDescription（`ios/App/App/Info.plist`）。原因：App 內選圖用 `<input type=file accept=image/*>`（任務、白板、工作區、記事本），iOS 會出現「拍照」選項，沒有相機說明字串一按就閃退；行事曆匯出圖片走分享單，「儲存影像」需要寫入相簿說明 |
| Privacy Manifest（必要理由 API） | ✅ | 2026-10-03 新增 `ios/App/App/PrivacyInfo.xcprivacy` 並加入 App target 資源：UserDefaults（CA92.1，Preferences／Apple 登入／社群登入外掛用）、檔案時間戳（C617.1，Filesystem 外掛用）。Capacitor 本體與 RevenueCat SDK 自帶清單；小工具 target 原生碼沒用到必要理由 API，不需另加 |
| Apple Watch 不打包進 iOS App | ✅ | App 不再相依與嵌入 HuddleWatch（Watch target 保留，日後可加回）（ad5a496）。Release 模擬器建置 BUILD SUCCEEDED，產出 App.app 無 Watch 資料夾、UIDeviceFamily=[1]、App／小工具版本 1.0／1.0、含 PrivacyInfo.xcprivacy |
| 背景音訊模式 | 🟡 | Info.plist `UIBackgroundModes = audio`（commit 57fb80d，專注計時背景音樂與浮動倒數）。合理用途，但審查常問，已寫進審查備註 |
| Apple Watch | ✅ | 老闆決定第一版不帶（工程端移除見上一列） |
| 刪除帳號、離線可用、原生功能 | ✅ | 2026-09-26 已做；刪帳號入口 `components/user-menu.tsx:337`、`components/modals/settings-modal.tsx:1093`；連動刪 RevenueCat PR #152 |
| Sentry（iOS） | 🧑 | 網頁版已上線（PR #167）。iOS 要在打包前把 DSN 放進本機 .env.local；隱私問卷已含「當機資料／其他診斷資料，連結使用者」 |
| iOS 新版打包上傳 | ⬜ | 尚未打包。順序：設好 .env.local（計費開關、RevenueCat iOS key、Sentry DSN）→ `pnpm cap:sync:release`（先自動檢查）→ Xcode Archive → 上傳 |

## 四、對外文案與法遵

| 項目 | 狀態 | 備註 |
|---|---|---|
| 官網、條款頁年繳價改 990 | ✅ | **已上線**（PR #119，main 0651e20，2026-10-01） |
| 條款／隱私權／退款／客服「開賣版」文案 | 🧑 | RevenueCat 揭露已上（PR #154）、Sentry 揭露已上（PR #167）；但條款／隱私頁仍是「尚未開放購買」版本（見第三節新缺口）。開賣版草稿 `docs/legal/2026-10-01-pro-launch-copy-draft.md` 待老闆審 |
| 官網行銷頁「尚未開放購買」字樣 | ⬜ | 開賣當天會變不實表示，要另出文案並綁開賣開關；另見第三節「回到官網」缺口 |
| 營運者資訊（名稱、地址、客服信箱） | ✅ | 名稱、客服電話、信箱已在 `lib/legal/operator.ts:10`–`:12`（10-02 老闆提供） |
| 律師、會計師確認 | 🧑 | 退款條款、稅務 |

## 五、已知問題（送審前建議處理）

- ✅ 單一帳號任務超過 1,000 筆會從畫面消失——已修（PR #116，commit 8484920，已在 main）。
- ✅ 行事曆「更多 → 日記」打字不會存檔——日記入口已全部藏起（PR #134，commit b4ba9d4，`components/layout/main-layout.tsx:512`）。
- 用量門檻、AI 免費次數：老闆 10-01 已拍板（積極版、AI 免費 5 次）。

## 六、送審閘門

1. 上面一～四全部 ✅。
2. 真機走完：註冊 → 試用 → 購買 → 恢復購買 → 取消，沙盒實購通過。
3. **老闆親自大檢查並明確說「可以送審」。**

## 2026-10-03 更新紀錄

- 依 repo 現況與 10-03 交接紀錄，把已完成項改 ✅ 並附依據（PR 編號或 檔案:行號）；「依交接紀錄」者為後台設定，repo 無法佐證。
- 本分支實際改動：`ios/App/App/Info.plist`（加密聲明、相機／相簿說明）、新增 `ios/App/App/PrivacyInfo.xcprivacy` 並加入 Xcode 專案、小工具版本號 0.1.0 → 1.0。
- 新發現缺口：App 內可經條款頁「回到官網」看到網站信用卡購買說明；條款／隱私頁仍寫不能購買；Watch 仍被打包；iPad 截圖必填；送審版要開計費開關。
- 新增文件：商店文字草稿、隱私問卷對照表（docs/releases/2026-10-03-*）。
