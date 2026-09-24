# Huddle 本週上架與定價驗收清單

查核日期：2026-09-21（Asia/Taipei）。查核基線本機 `888d2c4`；本文件是 read-only audit，其他 agent 正在新增功能，合併後須更新驗收結果。未登入商店後台、未送審、未寄信、未修改正式資料。

## 發布決策

本週優先完成 Web 更新與原生測試版，商店公開日期以帳號資格、實機驗證及審查結果為準，不能承諾本週必定通過。若 Google Play 是 2023-11-13 之後建立的個人帳號且尚未完成封閉測試，須至少 12 位測試者連續加入 14 天，之後再申請正式發布權限；本週新開始無法完成此門檻。[Google 官方測試要求](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

首發售價沿用已同意的 NT$149／月、NT$1,290／年。免費可用與付費開通分別驗收；商店與伺服器權益未完成真實沙盒驗證前不開購買。不要把本機完成寫成正式已上線。

## 實際準備度

| 項目 | 本次證據 | 尚需完成 / 驗收 |
|---|---|---|
| 正式 Web | GitHub Zeabur deployment `6551561504`，SHA `98aa974044f935a58013c4c2ff3fa9ae57b65edf`，2026-09-20 10:07:19 UTC 成功；`/about`、`/en/about`、`/privacy`、`/terms`、`/refunds`、`/support` 均 HTTP 200 且含 Huddle | HTTP 200 不是功能驗收；本機較新邀請/字幕等 commit 未由此部署證明。發版逐一核對目標 SHA、provider 成功、真實登入與核心行為 |
| iOS 原生專案 | `ios/App/App.xcodeproj` 已存在；app ID `com.lazylazy.huddle` 與 `lib/native-config.ts`、Capacitor 一致；本機 Xcode 26.6 | Archive/簽章/真機/TestFlight/商店 app record 未驗證。`docs/IOS_SETUP.md` 中 com.huddle.app、尚未建立 iOS 的敘述已過時，不可照抄 |
| Apple 登入 | 程式有 Apple sign-in 依賴；Xcode 有 team 欄位 | 未找到 app entitlements、CODE_SIGN_ENTITLEMENTS 或 Apple capability；須帳號端及原生 entitlement 一致，真機測 Google/Apple 登入、取消、深連結與換帳號 |
| Android | 基線未有 `android/` 專案 | 建立 Capacitor Android、API 36、release AAB、upload key/Play App Signing、測試裝置。不能把 iOS build 當 Android 完成 |
| SDK / 隱私 manifest | Xcode 26.6 可提供所需 SDK；未找到專案自有 PrivacyInfo.xcprivacy | 依實際 SDK/API 彙整 archive privacy report，補所需理由；App Privacy 與 Data safety 依實際資料流填寫，不可猜「不蒐集資料」 |
| 刪除帳號 | `supabase/functions/delete-account/index.ts` 驗 JWT 後 admin.deleteUser | 函式未見 Apple token revoke、Storage 刪除；記事本/白板會上傳 notebook-images，不能假設 auth cascade 清掉檔案。測完整刪除及失敗恢復，補清楚的 web 刪帳入口；取消商店訂閱須另說明 |
| 訂閱 | adapter、RevenueCat driver、webhook、migration 在 repo | 商店商品、RevenueCat keys、正式 migration、reconciliation、原生沙盒購買/恢复/退款/帳號轉移證據尚缺。此 audit 不將並行新程式當已驗證 |
| 推薦三個月 | 基線已有方案文件，並行 foundation migration WIP | 活動日期、受益對象、官方優惠或延後扣款與實際生效日須一致。不可只延長本地 Pro 卻讓商店照扣 |
| 邀請 / Email | 本機有邀請 API、UI 與寄信函式 | 正式 migration、Resend verified sender/secrets、測試信與錯誤監控；不主動寄給真實朋友 |
| Google Calendar | 基線只有設計，並行實作中 | Google Cloud client、scope、正式 callback、token storage、撤銷、重試與真實帳號驗證。Google 登入不等於日曆授權 |
| 法律/客服 | 正式雙語法律路由可載入 | 營運者法定名稱、公開聯絡方式、地址（依實際需求）、刪除/保留期限、供應商及新增日曆/Email/推薦資料使用說明待確認 |

Apple 現行最低上傳要求為 iOS 26 SDK 或更新（2026-04-28 起），本機 Xcode 版本不代表已產出合規 archive。[Apple SDK 要求](https://developer.apple.com/news/?id=ueeok6yw) Google 現行新 app / 更新 target Android 16 API 36（2026-08-31 起）。[Google target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

App 有 Google 等第三方主要登入時須檢查 Apple 4.8 的等效隱私登入條件及適用例外；Huddle 應完成已設計的 Sign in with Apple，而不是僅藏掉錯誤按鈕。[Apple 審核指南](https://developer.apple.com/app-store/review/guidelines/) 需帳號刪除入口與 Apple token 撤銷；Google 同時要求 app 內及可存取的網頁刪除路徑。[Apple 刪帳](https://developer.apple.com/support/offering-account-deletion-in-your-app)／[Google 刪帳](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) Required Reason API 應按真正用途填 manifest，不套用無依據的通用理由。[Apple manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)

## 定價邏輯與收入界線

- 定位：免費讓個人完整整理生活；Pro 提供更多協作容量。保留任務、排程、專注、記事本、白板等基本價值，不用未完成的路線圖撐價格。
- 免費/Pro 建議：共享夥伴 2/20 人；主辦邀請 3/50 場每月；每場邀請 2/10 人。回覆邀請不收費。已建立內容與舊用戶共享不中斷；只對新增超額動作限制，且後端 enforce。
- 月繳全年 NT$1,788，年繳省 NT$498，即約 27.85%；可寫「年繳省約 28%」。年繳主要金額必須是「每年一次 NT$1,290」，不可只凸顯 NT$107.50／月而淡化一次扣款。
- 用 15% 商店費率作情境時：月繳扣商店費後 NT$126.65、年繳 NT$1,096.50；用 30% 情境時是 NT$104.30、NT$903。以上尚未扣稅、退款、RevenueCat、雲端、Email 與客服成本，不是淨利。Apple 費率依參與方案與交易条件；Google 自動續訂標準 service fee 為 15%。[Apple 合約](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)／[Google 費率](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
- 3 個月牌價 NT$447，若雙方各得合計 NT$894，這只是名目優惠不是現金成本。活動先限 90 天、推薦人最多 4 次/12 個月作建議；追蹤兌換率、有效新用戶、試用後付費、續訂及實際服務成本，再決定延長。上述活動邊界仍需產品最終確認。
- 商店商品回傳的本地化價格才是付款 UI 權威；此金額表是台灣市場方案基準，不可假設其他區域稅額、幣別或所有 price points 一致。

## 本週順序與交付證據

### 今天：解除帳號與資訊缺口

- [ ] 確認 Apple Developer / App Store Connect 可操作角色及付費合約、收款、稅務、正式 app record。
- [ ] 確認 Google Play 帳號類型、建立日期、生產發布權限；新個人帳號立即安排合法真實封閉測試。
- [ ] 確認營運者公開資料、客服信箱、寄件網域；金鑰放平台 secrets，不放聊天或 repo。
- [ ] 確認正式 Supabase project、Google Cloud OAuth client、RevenueCat project 與商店商品對應。

### 程式 / staging 完成後

- [ ] Web build + 原生 static export 分別通過；不把 Web build 結果代替 iOS/Android。
- [ ] DB migration 在 staging 執行並驗 RLS、資料升級、回復步驟；正式環境不 reset。
- [ ] 推薦 self/repeat/concurrency/cap/expiry；商店優惠不重扣；月/年/既有訂閱分別測。
- [ ] 原生購買、pending、取消、恢復、退款、到期、換帳號、跨裝置、重複/亂序 webhook 及校準。
- [ ] Google OAuth cancellation/retry、斷線、撤銷、重複同步、刪除事件與時區；實機 Google/Apple 登入。
- [ ] 刪帳號涵蓋資料、檔案、provider tokens，保留依法必須保留資料時於隱私頁說明。
- [ ] 真機繁中/英文、深連結、通知拒絕、慢網路與重開 app；截圖不能帶真實個資。

### 商店提交包

- [ ] App 名稱/副標題/描述/keywords 繁中與英文；未上線功能標示規劃，不寫已可用。
- [ ] 實際 iPhone/iPad（如支援）與 Android screenshots、icon、分類、年齡分級、support/privacy URLs。
- [ ] App Privacy / Google Data safety / ads declaration（依真實 SDK）/ content rating / app access。
- [ ] Review demo account 或完整 demo mode，含 Google/Apple 以外可供審核登入的操作資料，正式 backend 可用。
- [ ] 訂閱價格、期間、自動續訂、取消、恢復購買、terms/privacy 連結及推薦活動 review notes。
- [ ] TestFlight / Play internal或closed實測，記錄 build number、版本、測試者與結果，再提交 production。

### 發布後

- [ ] 記錄 local commit → remote push → main merge → provider部署 → production UI 的每一份證據。
- [ ] 每項 feature gate 只在相依服務已驗證時開啟；退款、權益、寄信失敗及 OAuth錯誤有可見監控。
- [ ] 先小量推出，出錯可回退前端或關閉新購買；不因回退刪除已建立資料與有效權益。

本文件不是法律意見或商店核准保證。外部帳號設定、審核時間、正式商品與簽章不能由本機通過測試推定完成。
