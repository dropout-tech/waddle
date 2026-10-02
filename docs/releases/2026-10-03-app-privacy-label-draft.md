# Huddle Planner — App 隱私權問卷（Privacy Nutrition Label）勾選對照表

建立：2026-10-03。**草稿，待老闆審後由老闆本人在 App Store Connect →「App 隱私權」填寫。**
依據是 repo 程式（main dbf3c8c）實際送出的資料，每項附 檔案:行號。若之後新增 SDK 或資料欄位，這張表要跟著改。
同一份結論也寫進了 App 內的隱私清單 `ios/App/App/PrivacyInfo.xcprivacy`（NSPrivacyCollectedDataTypes），兩邊要一致。

Apple 對「收集」的定義：資料離開裝置，且你或第三方夥伴能在「即時處理該次請求」之後繼續存取。只在當下轉送、不保存的不算收集。

## 第一題：你或第三方夥伴是否從這個 App 收集資料？
**是。**

## 第二題：追蹤（Tracking）
**全部選「否，不用於追蹤」。** 依據：沒有廣告 SDK、沒有資料仲介；`@vercel/analytics` 雖列在 package.json:89，但 app／components／lib 內沒有任何 import（grep 0 筆），不會進 App；Sentry 與 RevenueCat 只收帳號 uuid，不收 IDFA。

## 第三題：逐項勾選

「連結到使用者」＝資料會跟帳號綁在一起。用途欄 Apple 選項中只勾「App 功能」（App Functionality：含驗證身分、提供功能、減少當機、客服）。

| Apple 類別 → 項目 | 勾？ | 連結使用者 | 追蹤 | 用途 | 程式依據 |
|---|---|---|---|---|---|
| 聯絡資訊 → 電子郵件地址 | ✅ 收集 | 是 | 否 | App 功能 | 帳號登入：`app/(auth)/login/page.tsx:105`（signInWithPassword）；Google／Apple 登入取得 email |
| 聯絡資訊 → 姓名 | ✅ 收集 | 是 | 否 | App 功能 | 登入供應商回傳的 full_name 存於帳號資料並顯示：`components/user-menu.tsx:82`；協作時顯示 display_name：`lib/assignments.ts:140` |
| 聯絡資訊 → 電話、實體地址、其他 | 不勾 | | | | App 內沒有收電話或地址的欄位 |
| 健康與健身、財務資訊、位置、敏感資訊、通訊錄 | 不勾 | | | | 沒有 HealthKit、沒有定位 API（grep `navigator.geolocation` 0 筆）、不讀通訊錄；付款由 Apple 處理，App 拿不到卡號（`app/privacy/page.tsx:17`） |
| 使用者內容 → 照片或影片 | ✅ 收集 | 是 | 否 | App 功能 | 使用者上傳的圖片存到 notebook-images：`components/notebook/upload-image.ts:18`、`components/modals/task-detail-modal.tsx:1374`、`components/scratchpad/scratchpad-canvas.tsx:421` |
| 使用者內容 → 其他使用者內容 | ✅ 收集 | 是 | 否 | App 功能 | 任務、行程、筆記、白板、專注紀錄同步到 Supabase；會議逐字稿存 DB 並送 OpenAI 整理：`supabase/migrations/20260925081959_meeting_imports.sql:47`、`supabase/functions/meeting-import/index.ts:221` |
| 使用者內容 → 音訊 | 不勾 | | | | 會議匯入只收文字檔（`components/meetings/meeting-workspace.tsx:437` accept=.txt,.md,.srt,.vtt），App 不錄音 |
| 使用者內容 → 電子郵件或訊息、遊戲內容、客服 | 不勾 | | | | 會議邀請只走 App 內通知（`supabase/functions/send-meeting-invitations/index.ts:13` email_disabled）；客服走電話／Email，不在 App 內 |
| 瀏覽記錄、搜尋記錄 | 不勾 | | | | 沒有收集 |
| 識別碼 → 使用者 ID | ✅ 收集 | 是 | 否 | App 功能 | 帳號 uuid 傳給 Sentry（`lib/monitoring/sentry.ts:93` setUser）與 RevenueCat（`lib/billing/revenuecat-driver.ts:34`、`:36` appUserID） |
| 識別碼 → 裝置 ID | 不勾 | | | | 沒呼叫 RevenueCat `collectDeviceIdentifiers`（lib/billing grep 0 筆）；不讀 IDFA |
| 購買項目 → 購買記錄 | ✅ 收集 | 是 | 否 | App 功能 | RevenueCat 向 Apple 取得訂閱方案、期間、交易編號：`app/privacy/page.tsx:17`；webhook 寫入權益表（PR #150） |
| 使用資料（產品互動、廣告資料、其他） | 不勾 | | | | 沒有分析 SDK；Sentry 只在出錯時送報告，導覽路徑麵包屑只當診斷用（歸在下方「其他診斷資料」） |
| 診斷 → 當機資料 | ✅ 收集 | 是 | 否 | App 功能 | Sentry 錯誤報告（只收錯誤，`lib/monitoring/sentry.ts:12`），並附帳號 uuid（`:93`） |
| 診斷 → 效能資料 | 不勾 | | | | 未開 tracing（`lib/monitoring/sentry.ts:73`） |
| 診斷 → 其他診斷資料 | ✅ 收集 | 是 | 否 | App 功能 | Sentry 報告內含頁面路徑（已遮蔽）、裝置／瀏覽器版本、網路麵包屑（`lib/monitoring/sentry.ts:78`、`:83` scrubEvent） |
| 其他資料 | 不勾 | | | | |

**要勾的共 8 項**：電子郵件地址、姓名、照片或影片、其他使用者內容、使用者 ID、購買記錄、當機資料、其他診斷資料。全部「連結到使用者：是」、「追蹤：否」、用途「App 功能」。

## 需要老闆知道的判斷點（信心不足 8 成的地方）

1. **Google 日曆事件：本表判定「不勾」**，信心約 7 成。理由：事件內容由伺服器即時向 Google 讀取後回傳，不存進我們的資料庫（`app/privacy/page.tsx` Google 日曆段落；伺服器只存加密的 refresh token：`supabase/functions/google-calendar/index.ts:150`），符合 Apple「只即時處理不算收集」的例外。若老闆想保守，可在「其他使用者內容」裡涵蓋，不影響其他勾選。要不要找第二意見？
2. **Sentry 的 IP 位址**：SDK 的 dataCollection 已全關（`lib/monitoring/sentry.ts:60`），但 Sentry 伺服器預設可能記錄連線 IP。建議老闆在 Sentry 專案設定開「Prevent Storing of IP Addresses」，就不用另外勾「大略位置」。這項沒有在後台驗證過。
3. **OpenAI**：逐字稿由 OpenAI 保留最長 30 天防濫用（隱私頁已揭露）。Apple 的問卷是問「資料類型」不是問「給誰」，所以已涵蓋在「其他使用者內容」，不需另勾。
4. 第一版 iOS 不含 Apple Watch；若之後加回 Watch，資料類型不變（Watch 只讀手機同步過去的資料）。
