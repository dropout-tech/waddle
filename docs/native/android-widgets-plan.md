# Huddle Android 小工具與鎖定畫面規劃

更新：2026-09-21。狀態：研究與實作規格，尚未開發／打包／上架。配合 iPhone 版提供同一組五項核心能力，但遵守 Android 實際可用介面，不承諾每台手機都有鎖屏小工具。

## 已確認的專案起點

- Capacitor Android 專案 `android/`，applicationId `com.lazylazy.huddle`，min SDK 24、compile/target SDK 36。MainActivity 目前只是 BridgeActivity；沒有原生 AppWidget provider、Glance、widget 資料橋接。
- 現有 manifest 只有 `huddle://auth/callback` 外部連結；小工具目的地須另增明確路由，不能借用 OAuth callback。
- `lib/water-reminder.ts` 是裝置 localStorage 的提醒設定，非飲水紀錄服務；新增喝水量、每日目標不能宣稱已存在。
- 專注計時已有開始時間、暫停時間等 Web 狀態；原生需搬移權威狀態，不能讓 Web 與 widget 各跑一套互相覆蓋。
- 現有 Android 打包仍有 SDK／簽署等準備工作；本文件沒有產生 APK/AAB。這些是原生功能，單次網站部署不會安裝到手機。

## 五項必備功能

| 功能 | 主畫面小工具 | 可支援的鎖屏呈現 | 點擊／操作 |
|---|---|---|---|
| 行事曆 | 今天／接下來 3–4 筆，較大尺寸可切月曆 | 預設只顯示下個行程時間、忙碌狀態 | 開啟對應日期／行程；新增需進 App |
| 專注計時 | 開始、暫停、繼續、結束；剩餘時間／今日摘要 | 進行中通知與系統倒數；支援機型再顯示 widget | 原生記錄狀態，App 關閉仍可恢復；結束不重複寫紀錄 |
| 記事本 | 固定一本筆記的標題、摘要或前三個 checklist 項目 | 預設只有「開啟記事本」及待辦數 | 主畫面可勾選；文字輸入、完整編輯解鎖進 App |
| 白板 | 固定白板的安全縮圖／標題、最近更新時間 | 預設只有白板入口，無內容縮圖 | 進指定白板續編；完整拖曳／畫圖保留在 App |
| 喝水提醒 | 下次提醒、已喝／稍後；第二階段增杯量與每日進度 | 喝水通知、稍後提醒；支援機型可放簡化 widget | 先對齊既有提醒；新增飲水紀錄後可 +250 ml／自訂量 |

尺寸以 2×2、4×2、4×3 起做，依 launcher 可用 dp 動態排版；繁中／英文、深淺色、字體放大、系統動態色彩均需驗收。企鵝可用少量靜態狀態插畫，不做持續動畫耗電。可額外提供「今日總覽」及快速新增入口，但不擠掉以上五項。

## 平台能力邊界

1. 主畫面使用原生 AppWidget，列表／卡片優先 Kotlin + Jetpack Glance；它不是 WebView，也不能直接重用 React 編輯器。操作用明確 Activity intent 或 ActionCallback。參考 [Glance 建立小工具](https://developer.android.com/develop/ui/compose/glance/create-app-widget) 與 [互動 API](https://developer.android.com/develop/ui/compose/glance/user-interaction)。
2. App 內「加入主畫面」在 API 26+ 且 launcher 支援時呼叫 requestPinAppWidget；仍由使用者確認。其他情況顯示長按桌面加入的教學，不假報加入成功。參考 [Widget discoverability](https://developer.android.com/develop/ui/views/appwidgets/discoverability)。
3. Android 官方將新版鎖屏 widget 能力列為 Android 16 QPR1 起的 AOSP 能力；OEM 是否提供、入口與充電／底座條件可能不同。因此不可只檢查 API 36 就宣稱可放。Pixel Tablet 官方已有支援案例，但仍須按本次實機 OS／OEM 驗收。一般手機缺少入口時使用鎖屏通知／App 快捷入口。參考 [官方鎖屏 FAQ](https://android-developers.googleblog.com/2025/03/widgets-on-lock-screen-faq.html)。
4. 私密筆記、白板縮圖與完整行程另做「僅主畫面」provider，在 `res/xml-v36` 設定 `not_keyguard`；鎖屏版本只輸出安全摘要。不要靠辨識 host 或裝置現在是否鎖住才遮掩，避免快取洩漏。App Activity 不設 showWhenLocked；編輯／敏感操作先解鎖。
5. 專注中的 ongoing notification 是基本能力。Live Updates 僅作符合使用情境且系統允許時的增強，不保證 Samsung Now Bar 或每種廠商介面。它需要進行中、使用者主動開始且具時間敏感性的活動；待辦推廣、喝水常駐入口不符合此設計。參考 [Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update)。

## 共用資料與 Capacitor 橋接

Web → `HuddleWidgets` 原生 plugin → app-private Room／DataStore snapshot → Glance render。Widget 操作 → 原生交易與 outbox → 登入有效時同步 → 回傳 canonical revision → Web 更新。

- 共用 envelope：schemaVersion、accountId、accountEpoch、revision、generatedAt、locale、timeZone、privacyMode、各模組安全摘要。命名與 iOS 最終共用規格統一後再落碼。
- 每個 widget instance 儲存它的類型、固定資源 ID、顯示偏好；重新配置可換筆記／白板，刪除小工具只刪設定，不刪使用者內容。
- 首版資料刷新以 App 同步完成及原生操作觸發為主；離線顯示最後更新時間。背景雲端更新是另一步，需受控原生使用者 session 管理，不能把 service key 或 refresh token 放在 widget payload、intent、日誌。
- 原生 action 必須含 actionId、accountId、accountEpoch、resourceId、expectedRevision；本機先去重，再服務端冪等。伺服器拒絕權限／資源已刪除時回復畫面並提示，不能永久假勾選成功。
- 帳號切換／登出先撤銷操作、清掉 snapshot、outbox、縮圖與通知，再顯示「開啟 Huddle 登入」；舊帳號排程不可寫新帳號。取消分享／刪除筆記同步時刪相關快取。
- Android 內部 widget 用 explicit immutable PendingIntent 指定 MainActivity 與允許目的地；共用深連結規格建議 `huddle://open/calendar?date=...`、`/notebook?id=...`、`/whiteboard?id=...`、`/focus`、`/water`。只接受已知參數並驗證資源權限，不接受任意 URL。冷啟動／登入後保留目的地。

## 計時、提醒與更新策略

- 不用每秒網路請求或每秒 WorkManager 更新 widget。一般 snapshot 事件驅動；官方 updatePeriodMillis 最短 30 分鐘，WorkManager 週期工作最短 15 分鐘且不是準時保證。參考 [Glance 更新](https://developer.android.com/develop/ui/compose/glance/glance-app-widget)。
- 專注以持久化結束時間／暫停餘時及 monotonic clock 基準運算；通知使用系統 Chronometer 倒數。需要 widget 秒數時驗證 RemoteViews Chronometer 的 host 相容性；不支援則顯示結束時間與分鐘級摘要，不用假秒數。
- 暫停／停止取消舊鬧鐘；重新開機、換時區、調整時鐘後重建狀態與提醒，完成紀錄按 sessionId 去重。
- 既有 `lib/notifications/index.ts` 的 `syncMeetingReminders` 會清除所有待送通知；加入喝水／專注前，必須先改為依 reminder kind 命名與取消，避免功能互相刪掉排程。
- 喝水採非精準提醒、安靜時段、稍後五分鐘；不要為一般喝水提醒索取精準鬧鐘權限。專注結束若需精準通知，在 Android 對應版本檢查可否排 exact alarm，清楚說明權限用途，拒絕後提供可能延遲的替代。Android 13+ 另處理通知權限。參考 [AlarmManager](https://developer.android.com/develop/background-work/services/alarms)。
- 倒數本身不需要長駐 foreground service。只有真正符合系統服務類型且有使用者可見長工作才評估使用；不可濫用 dataSync／mediaPlayback 來保活。背景啟動受限制，widget 點擊例外也非無限常駐許可。參考 [前景服務限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)。

## 分期與驗收

第一階段：建立共用 snapshot、原生橋接、身份清除與冷啟動路由；交付五項主畫面小工具的可讀摘要／有效入口，以及專注、喝水的基本原生通知。兩種語言都能操作，預設鎖屏安全摘要。喝水先延續提醒，不虛構既有 ml 紀錄。

第二階段：checklist 原地勾選、專注原生狀態機、喝水紀錄／自訂量與 outbox；測試離線、衝突與帳號切換。完整白板和筆記編輯仍在 App，保留手勢與鍵盤空間。

第三階段：支援機型鎖屏 widget／Live Updates、背景同步與今日總覽，完成真機與商店素材。若首週上架時間不足，先上已驗收的核心 App，不在商店截圖假示未交付 widget。

必要驗收：

- API 24／26／31／33／36 分層測試；至少 Pixel 手機、實際支援鎖屏 widgets 的設備、Samsung 實機各一。OEM 沒有入口時教學／替代功能正確。
- 程序被殺、重啟、離線、Doze、通知拒絕、精準鬧鐘拒絕、大字體、英文長標題、系統時區/DST、widget 重新調尺寸。
- 快速連點不重複加水／勾選；兩個 widget 指同筆記一致；登出與帳號切換不殘留文字／縮圖；舊 PendingIntent 失效；鎖屏不可看到私密內容。
- Native unit tests 覆蓋狀態機／snapshot版本／冪等／accountEpoch；instrumentation 驗證 widget receivers、route 冷啟動與通知。最後生成已簽署 APK/AAB，在 Play internal testing 實機安裝，才能標記 Android 小工具完成。

商業方案：先保持這五項基本小工具免費，讓桌面與手機資料入口一致；多版型／多組個人化可後續討論。此為建議，沒有改動現有付費權限或已確定 Pro 價格。
