# Huddle iPhone 小工具與鎖定畫面規劃

日期：2026-09-21。狀態：規劃完成，尚未實作、簽署或上架。此文件不變更免費／Pro 的權益；先讓使用者可從小工具使用原本已有權限的內容。

## 產品範圍

第一版涵蓋使用者指定的白板、記事本、專注計時、行事曆、喝水提醒，全部提供主畫面與鎖定畫面入口。主畫面負責「看得到內容、做一個小動作」；鎖定畫面負責「看目前狀態、快速進入」。專注另提供即時動態（Live Activity），在鎖定畫面及支援機型的動態島顯示倒數。

| 功能 | 主畫面第一版 | 鎖定畫面第一版 | 直接操作與開啟 App 的界線 |
| --- | --- | --- | --- |
| 白板 | 中尺寸：釘選一張白板、顯示裁切預覽與標題；小尺寸：釘選白板捷徑 | 圓形入口；矩形顯示名稱或隱私摘要 | 點入同一張白板。移動卡片、畫圖、文字編輯在 App 內進行，不把完整編輯器放進小工具 |
| 記事本 | 中尺寸：釘選筆記摘要或 3–4 項 checklist；小尺寸：筆記入口 | 圓形快速開啟；矩形顯示釘選筆記摘要／完成數 | iOS 17+ 主畫面可勾選 checklist。新增／編輯文字點入筆記編輯器。第一版鎖屏不直接更動私密筆記 |
| 專注計時 | 小尺寸：預設 25 分鐘開始；中尺寸：目前任務、倒數、暫停／繼續 | 矩形狀態＋圓形入口；進行中 Live Activity 顯示倒數及暫停／繼續／結束 | 由原生狀態機執行計時操作，不依賴 WebView 開著。鎖定時系統可能要求解鎖；Live Activity 關閉時保留一般小工具及到時通知 |
| 行事曆 | 小尺寸：下一個行程；中尺寸：今天接下來 3–4 筆 | 矩形下一個行程；單行下一場時間 | 點行程開啟詳情，點日期進入當日日曆。第一版不在小工具內拖曳改期。預設採 Huddle 已有日曆資料，不能宣稱讀到 Google 所有日曆 |
| 喝水提醒 | 小尺寸：下次提醒＋「喝了」；中尺寸增加今日記錄與稍後提醒 | 圓形喝水入口／矩形下次提醒；可用 App Intent 記錄「喝了」 | 第一版以喝水次數及下一次提醒為主；毫升、目標、HealthKit 延後。通知由 iOS 原生排程，不靠小工具刷新發提醒 |

第一版不把五種功能全塞入單一卡片，而是在小工具選單提供五種名稱，讓使用者自行選擇。繁體中文／英文與 App 語言一致。白板預覽使用 App 匯出的縮圖，不能嵌入 React/HTML 畫布。

後續適合加上「今天三件事」待辦勾選與「今日總覽」（下一場會議＋目前專注＋待辦數）。約時間只提供待回覆邀請數與入口，接受／婉拒仍在 App 內確認，避免鎖屏誤發邀請。大尺寸月曆、筆記完整 checklist、快捷指令與 iOS 18+ 控制中心入口放第二階段。不上第一版的功能不出現在商店截圖中。

## 平台限制與降級

- 原生 WidgetKit extension 才能提供這些 iPhone 系統小工具；網站／PWA 的部署不能直接產生小工具。
- 專案目前宣告 iOS 15。第一版交互功能以 iOS 17+ 為完整體驗；保留主 App 現有最低版本，extension／各 API 設定正確 availability。iOS 16 提供鎖屏摘要與點入，iOS 15 僅主畫面摘要；確切舊版支持需在 Capacitor 8 工具鏈與實機上驗證，不能只依 Xcode 設定承諾。
- WidgetKit 是系統渲染的短時內容，不是常駐程式。按鈕／開關可透過 App Intents 執行動作；不可承諾鍵盤文字輸入、白板任意拖拉或完整 App 導覽。鎖定狀態操作須遵守系統解鎖要求。[Apple 互動小工具文件](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- 刷新時間由 iOS 決定。常用小工具的典型每日刷新額度約 40–70 次，不是 SLA，也不能承諾每分鐘雲端同步。行程按已知開始／結束時間建立 timeline，App 改資料後要求 reload；舊資料顯示更新時間。倒數使用系統時間呈現，不每秒發請求。[刷新限制](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)、[動態時間顯示](https://developer.apple.com/documentation/widgetkit/displaying-dynamic-dates)
- Live Activity 適合一次專注，不適合全天白板或喝水常駐面板。最長活動時間 8 小時；之後鎖屏最多再保留 4 小時。倒數完畢不等於 App 程式必定立即執行：採有界倒數／完成呈現、到時本機通知，下一次原生執行時收尾與補記錄。需測試暫停、休息階段、App 被終止及關閉即時動態。[Live Activity 限制](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
- 喝水及專注完成提醒使用 UserNotifications，先取得通知權限。專注模式、通知摘要及使用者設定可能影響提示方式，不宣稱一定準時出聲。[本機通知](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)

## 已檢查的程式現況

- `capacitor.config.ts`：App ID `com.lazylazy.huddle`，WebView 載入 `out/` 靜態包。
- `ios/App/App.xcodeproj/project.pbxproj`、`AppDelegate.swift`：已有 iOS 殼及 URL 開啟轉交；尚無 Widget Extension／App Group 設定。
- `components/timer/focus-timer-provider.tsx`：計時狀態、起始時間及暫停累積目前由 React／localStorage 管理，已有跨重新載入還原，尚非原生共享狀態。
- `hooks/use-water-reminder.ts`：喝水提示目前是前景 30 秒輪詢及 localStorage，App 關閉後不能據此發原生提醒。
- `lib/notifications/index.ts`：已有 Capacitor 本機會議通知；目前同步會取消所有 pending notifications，因為原先只有會議。新增喝水／專注前必須改為按 kind／命名空間取消自己的通知，並共用容量管理，否則會互相清掉。
- `hooks/use-notebook.ts`、`hooks/use-scratchpad.ts`：現有筆記、白板模型可做快照來源；extension 不直接讀取 WebView localStorage。

## 原生架構與資料安全

1. 新增 SwiftUI `HuddleWidgets` extension、WidgetBundle，以及主 App／extension 共用的 App Group（建議 identifier `group.com.lazylazy.huddle`，實際須開發者帳號註冊與簽署）。不要直接修改 Capacitor 自動產生的 SPM 檔。
2. 實作 Capacitor bridge 將經授權的精簡快照寫入 App Group：schemaVersion、userID、accountEpoch、locale、timezone、generatedAt、所選白板縮圖／筆記摘要／近期行程／專注狀態／喝水設定。原子替換快照；不放完整資料庫、OAuth token 或服務金鑰。Widget 只讀被選取的必要內容。[Apple 共享資料容器策略](https://developer.apple.com/documentation/widgetkit/developing-a-widgetkit-strategy)
3. 原生共享儲存維護 timerSessionID、startedAt、targetEndAt、pausedAt、pausedDuration、revision。Web、widget、Live Activity 的操作交由同一個原生狀態機，跨 process 序列化寫入，避免 App 及 widget 同時開始兩個計時。App 恢復時讀原生狀態，不能拿舊 localStorage 覆蓋。
4. checklist、喝水操作寫入有唯一 actionID／userID／accountEpoch 的耐久佇列。第一版不將雲端 refresh token 交給 widget；本機立即顯示「待同步」，App 下次執行才經既有登入權限同步。雲端成功後清除，失敗保留可重試狀態，筆記被刪除或失去共享權限時回復／標示失敗。不可把本機勾選當成已完成跨裝置同步。
5. Deep link 僅接受白名單目的地與格式合法 ID，例如白板、筆記、日曆當日、計時、喝水設定。App 冷啟動／未登入先等待登入，再核對所有權或共享權限後開啟；不存在的內容提供返回入口。
6. 登出、換帳號、刪帳時清掉快照、縮圖、pending actions、通知與 Live Activity，要求 reload；以 accountEpoch 拒絕舊 intent 操作新帳號。測試殘留系統快照不洩露前一使用者內容。
7. 鎖屏預設只顯示一般名稱／數量，隱藏筆記正文與白板縮圖，行程標題需使用者主動開啟才顯示。適用內容加 `privacySensitive`，敏感快照採合適 Data Protection；鎖住時不能讀取就顯示占位，不降低保護只為強行顯示。[WidgetKit 安全機制](https://support.apple.com/en-gb/guide/security/secbb0a1f9b4/web)
8. 第一版採 App 主動刷新＋原生本機操作；不承諾 App 關閉後外部共享行程即時更新。APNs／WidgetKit push 更新另開階段做服務端、版本相容與耗電驗證。Live Activity 自身不能直接連網抓資料。

## 實作順序與交付門檻

### A. 基礎與唯讀展示

建立 extension／App Group／雙語資源／bridge／深連結。先交付五種主畫面及鎖屏小工具的快照、空狀態、未登入狀態、隱私模式，確認 TestFlight 真機能新增。此階段不是完整第一版，不把喝水按鈕或暫停畫成可用。

### B. 第一版互動完成

原生計時狀態與 Live Activity → 喝水通知與記錄 → checklist 操作佇列。同步調整通知 namespace／總排程容量。第一版範圍是上方五列，不要求全部尺寸排列組合；優先小／中主畫面、圓形／矩形鎖屏、日曆單行及專注 Live Activity。

### C. 真機驗收與上架

- 中英文字、大字體、深淺色、iOS 支援範圍內的透明／著色樣式、VoiceOver、無動態島機型。
- App 前景、背景、被終止、重開、離線、鎖屏、重開機後首次解鎖、通知拒絕、Live Activities 關閉。
- 專注暫停／恢復／完成／跨午夜／切時區／多入口快速點擊只記錄一次；到時背景未喚醒也不倒數成錯誤負值或虛構已收尾。
- checklist 與喝水重複點擊、同步失败、另一台裝置同時修改；新日期計數歸零與使用者時區一致。
- 會議提醒刷新不刪喝水／專注通知；喝水安靜時段與稍後提醒不形成通知風暴。
- 登出／換帳號／刪帳不殘留筆記與白板；分享權限撤回後快照及操作正確失效，無網路時清楚標示資料可能過期。
- Archive 主 App＋extension，開發者帳號 App Group／簽署一致，完成真機與 TestFlight 安裝，再更新商店雙語功能說明及截圖。

本週上架安排：把「現有 App 可送審」與「小工具新版」分成兩個交付門檻；先完成已承諾的基礎版本。小工具需要原生 extension、簽署與真機測試，不能以網站部署通過當作已上線。可以並行開發，但不承諾未經實機驗證即可本週全部上架。
