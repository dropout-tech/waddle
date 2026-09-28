# Huddle Apple Watch

2026-09-26。watchOS App（SwiftUI）＋錶面複雜功能／Smart Stack（WidgetKit），隨 iOS App 一起安裝。
本文件是規劃與實作說明；「驗證狀態」一節列出哪些真的跑過、哪些還沒有。

## MVP 範圍

| 功能 | 手錶上 | 理由 |
|---|---|---|
| 今日任務 | 清單（標題、時間或到期日、分類）；可勾選完成 | 與 iPhone 小工具同一份任務、同一條完成佇列 |
| 專注計時 | 顯示倒數／碼表；開始、暫停、繼續 | 計時邏輯在 App 的 JS（focus-timer-provider），手錶只送指令 |
| 每日簽到 | 顯示今天是否已簽到、點數 | 簽到要打 Supabase RPC，只在 iPhone 做 |
| 複雜功能 | 圓形／角落／行內／長方形：剩幾件、下一件任務、計時倒數 | 計時進行中提高 Smart Stack 相關度 |

刻意不做（本版）：
- 手錶不直接連 Supabase、不存登入 token。現有架構的安全邊界是「iPhone 驗證登入者＋任務 revision 後才寫入」，手錶走同一條路最省風險。
- 手錶上簽到、新增任務、記事、白板、喝水：要嘛需要雲端寫入，要嘛手錶上輸入體驗差。
- 重複任務與會議不可在手錶勾選（沿用小工具規則 `actionable`），顯示「請在 iPhone 完成」。
- 手錶獨立運作（沒有 iPhone 時）：`WKRunsIndependentlyOfCompanionApp = NO`。

## 資料流

```
Web(JS) WidgetSync ──publish──▶ HuddleWidgetsPlugin ─▶ App Group widgets.json（既有）
                                        │
                                        └─▶ WatchBridge.push()
                                              └─ WCSession.updateApplicationContext（最新一份覆蓋舊的）
                                                     ▼
                                          HuddleWatch App（WatchModel）
                                              ├─ 存到手錶自己的 App Group（WatchLocalStore）
                                              └─ 通知複雜功能 reload
手錶「完成任務」─ sendMessage（連不到時 transferUserInfo 排隊）─▶ WatchBridge
      └─ WidgetStore.complete(taskId, accountId, epoch) ← 與小工具勾選同一個函式
      └─ 觸發 JS `huddle-widget-refresh` → WidgetSync 以 revision 比對後寫入 Supabase
手錶「開始／暫停／繼續」─ sendMessage（只在 iPhone 可達時）─▶ WatchBridge
      └─ widgets.json 的 focusCommand（帶時間戳）→ JS WidgetSync 讀取並呼叫 pause/resume/startTimer
         → acknowledge 清除；超過 2 分鐘的指令直接丟棄，不延後套用
```

- 推送時機：小工具快照發布、`setAccount`（登入／登出／換帳號）、`acknowledge`、手錶指令處理後、手錶配對狀態改變。
- 簽到狀態：WidgetSync 每 5 分鐘（或台北日期換日時）呼叫一次 `get_daily_check_in_status`，放進快照的選填欄位 `checkIn`。

## 隱私與帳號規則

- 手錶只收到任務標題（≤80 字）、分類、時間、完成狀態，以及專注標題／秒數與簽到狀態。**不送**筆記、白板、專注記事內文、任務 revision、token。測試 `ios/App/WatchTests/main.swift` 有斷言。
- 每份 context 都帶 `accountId`＋`epoch`，且完整覆蓋舊資料：登出送 `signedOut`、換帳號送 `waiting`，手錶立刻清掉上一個帳號的任務。
- 手錶送回的指令在 iPhone 端重新比對目前 App Group 的 `accountId`／`epoch`，不符就拒絕（回 `rejected`）。任務 ID 用與深連結相同的白名單規則。
- 完成仍是「只設定完成、不做 toggle」，且以 `updated_at` revision 防止覆寫；手錶離線排隊的完成指令晚到也安全。
- 複雜功能的任務標題與計時標題加 `privacySensitive()`，手腕放下／錶面鎖定時遮蔽。

## 檔案

- `ios/App/WatchShared/WatchModels.swift`：快照、信封、指令格式與計時換算（iPhone、手錶、複雜功能、測試共用；只依賴 Foundation）。
- `ios/App/WatchShared/WatchLocalStore.swift`：手錶端快取。`Localizable.xcstrings`：英文＋繁中。
- `ios/App/App/WatchBridge.swift`：iPhone 端 WCSession。`HuddleWidgetsPlugin.swift` 於 publish／setAccount／acknowledge 後推送，並把手錶指令轉成 JS 事件。
- `ios/App/HuddleWatch/`：watchOS App（今日任務／專注／簽到三頁，垂直分頁）。
- `ios/App/HuddleWatchWidgets/`：複雜功能與 Smart Stack。
- `ios/App/scripts/add-watch-targets.rb`、`add-watch-schemes.rb`：用 xcodeproj gem 產生 target 與共享 scheme 的一次性腳本（留作紀錄）。
- JS：`lib/widgets/model.ts`（`checkIn` 選填欄位）、`lib/widgets/native.ts`（`focusCommand` 型別）、`components/widgets/widget-sync.tsx`（套用手錶計時指令、讀簽到狀態）。

Target 與 bundle id：`HuddleWatch` = `com.lazylazy.huddle.watchkitapp`（watchOS 10.0+），`HuddleWatchWidgets` = `com.lazylazy.huddle.watchkitapp.widgets`，DEVELOPMENT_TEAM 同 iOS App。兩者 entitlements 使用 `group.com.lazylazy.huddle`（手錶上是獨立的容器，不與 iPhone 共用）。

## 建置與測試

```sh
# 手錶 App（含複雜功能）
xcodebuild -project ios/App/App.xcodeproj -scheme HuddleWatch -destination 'generic/platform=watchOS Simulator' CODE_SIGNING_ALLOWED=NO build
# iOS App（內嵌手錶 App）— 注意：不要再加 -sdk iphonesimulator，它會強迫手錶 target 用 iOS SDK 編譯而失敗
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
# 共用邏輯測試（macOS 上直接編譯執行）
sh ios/App/WatchTests/run.sh
```

新增了共享 scheme（App、HuddleWidgets、HuddleWatch、HuddleWatchWidgets）。原因：Xcode 自動產生的 HuddleWatch scheme 會把 iOS App 一起拉進 watchOS 建置而失敗；一旦有共享 scheme，Xcode 就不再自動產生其他 scheme，所以四個都寫出來。

## 驗證狀態（2026-09-26）

- 已跑過：HuddleWatch 對 watchOS Simulator build 成功；App 對 iOS Simulator 與 generic iOS（未簽章）build 成功，產物內含 `App.app/Watch/HuddleWatch.app/PlugIns/HuddleWatchWidgets.appex`，手錶 App 的 Info.plist 有 `WKApplication`、`WKCompanionAppBundleIdentifier = com.lazylazy.huddle`、繁中 `zh-Hant.lproj`；共用邏輯測試 32/32 通過；`pnpm exec tsc --noEmit`、相關 ESLint、`scripts/tests/widgets.test.mjs` 7/7 通過。
- 沒跑過：本機沒有 watchOS 模擬器 runtime（也沒有下載），所以**手錶畫面沒有實際開過**；WatchConnectivity 的傳輸、複雜功能顯示、JS 套用計時指令都只經過編譯，沒有端對端驗證。需要配對的實機（或下載 watchOS 模擬器 runtime）才能驗收。

## 上線前需要的事

1. 付費 Apple Developer 帳號：為 `com.lazylazy.huddle.watchkitapp`、`.watchkitapp.widgets` 建 App ID，並開啟 App Group `group.com.lazylazy.huddle`（免費 Personal Team 對 App Group／擴充元件的簽章限制較多，可能無法裝到手錶）。
2. 手錶 App 圖示目前直接沿用 iOS 的 1024 圖，watchOS 會裁成圓形，需確認視覺。
3. 既有 HuddleWidgets 擴充的 `MARKETING_VERSION` 是 0.1.0、主 App 是 1.0；上傳 App Store 時版本不一致會被警告，本次未修改（不動既有 target 設定）。

## 之後的版本

- 手錶上直接簽到（透過 iPhone 代打 RPC，需處理 iPhone 不在前景時 WebView 無法執行的問題；或原生 Supabase 呼叫）。
- 專注計時由原生層持有狀態，讓 iPhone App 未開時手錶也能開始／暫停。
- 完成觸覺提醒、專注結束時手錶通知（目前 iPhone 本機通知會依系統規則轉到手錶）。
- 複雜功能設定（選分類）、Smart Stack 依行程時間的相關度、watchOS 獨立 App。
