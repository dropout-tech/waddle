# iOS 推播（Push Notifications capability）評估

2026-10-02。結論：**現在先不開**。等第一個「需要通知別人」的功能要做時，再整套一起開。

## 現況

- App 的通知全部是**本地通知**（`@capacitor/local-notifications`）：會議提醒、專注結束、喝水，
  都是 App 事先排好、到時間由 iPhone 自己跳。**本地通知不需要 Push capability，也不需要 APNs。**
  - 會議：`lib/notifications/index.ts`（最多排 48 則）
  - 專注／喝水：`lib/widgets/reminders.ts`
- 沒有遠端推播的任何零件：沒裝 `@capacitor/push-notifications`；`App.entitlements` 沒有
  `aps-environment`；`Info.plist` 的 `UIBackgroundModes` 只有 `audio`；`AppDelegate.swift`
  沒有 `didRegisterForRemoteNotifications`；資料庫沒有裝置 token 表；伺服器沒有發推播的程式。
- 「通知別人」類的事件目前靠 App 開著時查詢：
  - 會議邀請：`meeting_notifications`＋`hooks/use-meeting-notifications.ts`（每 30 秒、回到前景時查）
  - 任務被指派／被完成／被退回：對方要切回 App 才看得到（`docs/reports/2026-09-27-task-assignment-orgs.md`）

## 為什麼現在不開

1. **沒有功能會用到它。** 只勾 capability 不會讓任何通知變多；本地通知現在就能正常運作。
2. **開了要配一整套才有意義**（見下表），只開一半沒有好處。
3. **免費的 Personal Team 不能簽 Push capability**。若之後又要用 Personal Team 裝機測試
   （2026-09-27 曾這樣裝老闆 iPhone），加了它會讓建置失敗。

## 真要做遠端推播時，要做的事

| 項目 | 內容 |
|---|---|
| Apple 後台 | 建 APNs Auth Key（.p8），記 Key ID／Team ID |
| Xcode | App target 加 Push Notifications capability（產生 `aps-environment`） |
| App | 裝 `@capacitor/push-notifications`；登入後問權限、拿裝置 token |
| 資料庫 | 新表存「使用者 × 裝置 token」，登出／刪帳號要清掉 |
| 伺服器 | Supabase Edge Function 用 .p8 金鑰呼叫 APNs；由 DB trigger 或事件觸發 |
| 隱私 | 隱私權政策＋App Store 隱私標籤補「裝置識別碼」；通知內容別放敏感文字（鎖定畫面看得到） |
| 驗證 | 只能真機測（模擬器收不到 APNs 推播） |

第一批值得用推播的事件：被指派任務、指派的任務被完成或退回、收到會議邀請。

## 相關文件

- `docs/IOS_SETUP.md` 第 2 步：Push Notifications 已改成「先不要加」，指回本檔。
