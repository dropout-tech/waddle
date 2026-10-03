# Huddle Planner — App Store 商店文字素材草稿（英文＋繁中）

建立：2026-10-03。**全部文案待老闆審**，審過才可貼進 App Store Connect；任何人（含 AI）不得在後台按「提交以供審查」。
功能描述只寫 repo 內已存在、且 iOS 版看得到的功能（依據見每段後的「依據」）。日記入口已於 #134 藏起、Apple Watch 第一版不帶，所以文案都不提。
字數上限（Apple）：名稱 30、副標 30、宣傳文字 170、關鍵字 100 bytes（中文一字 3 bytes）、描述 4000。下方每段標了實際字數（用 Python 計算，見文末）。

## 0. 已在後台設好、這裡不改的

| 欄位 | 英文 | 繁中 | 依據 |
|---|---|---|---|
| 名稱 | Huddle Planner | Huddle 企鵝計畫 | 送審清單第一節 |
| 副標題 | Tasks, Focus & a Penguin | 任務、專注、行事曆 | 送審清單第一節 |

## 1. 網址

| 欄位 | 值 | 備註 |
|---|---|---|
| 支援網址（必填） | https://huddle.lazy72.com/support | `app/support/page.tsx`、英文 `app/en/support` |
| 行銷網址（選填） | https://huddle.lazy72.com | `lib/site.ts:3` |
| 隱私權政策網址（必填） | https://huddle.lazy72.com/privacy（英文 https://huddle.lazy72.com/en/privacy） | `app/privacy/page.tsx` |
| 使用條款（EULA） | 建議：描述最後一行放 https://huddle.lazy72.com/terms，或在「App 資訊 → 授權合約」填自訂 EULA；不填就是 Apple 標準 EULA，但描述裡仍要有連結 | Apple 規定有自動續訂訂閱的 App，商店描述或 EULA 欄要有使用條款連結 |

## 2. 宣傳文字（Promotional Text，≤170 字，可隨時改、不用重新審查）

**英文**（133 字元）
> Plan the day, drag tasks onto your calendar, and start a focus timer — all in one calm workspace, with a penguin keeping you company.

**繁中**（43 字元）
> 規劃今天、把任務拖上行事曆、按下專注計時，全在同一個安靜的工作面板，還有一隻企鵝陪你。

## 3. 關鍵字（≤100 bytes，逗號分隔、不加空格；名稱與副標已有的字不重複放）

**英文**（98 bytes）
> to do,todo list,calendar,planner app,time blocking,pomodoro,timer,notes,whiteboard,widget,schedule

**繁中**（97 bytes）
> 待辦,待辦清單,時間管理,番茄鐘,計時器,筆記,白板,小工具,排程,手帳,規劃

## 4. 描述（≤4000 字）

### 英文（2,078 字元）

```
Huddle is a calm planner that keeps your tasks, your calendar and your focus time in one place.

GET IT OUT OF YOUR HEAD
• Organize tasks in workspaces and see what matters today.
• Add details, checklists and images to a task.

MAKE ROOM FOR WHAT MATTERS
• Drag tasks onto your calendar to block time for them.
• Move a time block when plans change, and check tasks off when they're done.

ONE THING, FOR NOW
• Start a focus timer for the task in front of you, with optional background music and ambient sounds.
• Follow the countdown on the Lock Screen and in the Dynamic Island with Live Activities.

GIVE IDEAS A PLACE TO GROW
• Notebook: write with formatted text, checklists and images.
• Whiteboard: put ideas down on a free canvas, then open an item to develop it.

ON YOUR HOME SCREEN AND LOCK SCREEN
• Home Screen and Lock Screen widgets show today's tasks and your calendar at a glance.

PLAN WITH OTHERS
• Share your calendar with someone using a link, and choose what they can see.
• Find a time together: Huddle compares shared calendars and suggests a common opening, then sends an in-app meeting invite.

HUDDLE PRO (OPTIONAL SUBSCRIPTION)
Tasks, calendar, focus timer, notebook and whiteboard are free. Huddle Pro adds:
• Unlimited active tasks and notes
• 20 GB of image storage
• 20 AI meeting summaries per month (paste a transcript or notes, get key points and suggested tasks)
• Google Calendar connection (read-only)
• Organizations with invite links

Huddle Pro is an auto-renewing subscription, available monthly or yearly. New subscribers may be eligible for a 2-week free trial. Payment is charged to your Apple Account at confirmation of purchase (or when the free trial ends). The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. You can manage or cancel it anytime in your Apple Account subscription settings. Prices are shown in the app before you buy and may vary by country or region.

Terms of Use: https://huddle.lazy72.com/en/terms
Privacy Policy: https://huddle.lazy72.com/en/privacy
```

### 繁中（792 字元）

```
Huddle 是一個不催促的計畫本，把任務、行事曆和專注時間放在同一個地方。

把腦袋裡的事放下來
• 用工作區整理任務，一眼看到今天要做什麼。
• 任務可以加細節、檢查清單和圖片。

替重要的事留時間
• 把任務拖到行事曆上，替它排出時間。
• 計畫變了就移動時段，做完就打勾。

一次只做一件事
• 為眼前的任務開始專注計時，可搭配背景音樂與環境音。
• 透過即時動態，在鎖定畫面與動態島看倒數。

讓想法有地方長大
• 記事本：用格式文字、檢查清單與圖片慢慢寫。
• 白板：先把想法丟上自由畫布，再點開單一項目慢慢發展。

主畫面與鎖定畫面小工具
• 主畫面與鎖定畫面小工具，一眼看到今天的任務與行事曆。

和別人一起安排
• 用連結分享你的行事曆，自己決定對方看得到哪些內容。
• 約時間：Huddle 比對共享的行事曆、找出大家都有空的時段，並送出 App 內的會議邀請。

Huddle Pro（選購訂閱）
任務、行事曆、專注計時、記事本與白板都可以免費使用。Huddle Pro 另外提供：
• 進行中任務與筆記不限數量
• 圖片空間 20 GB
• 每月 20 次 AI 會議整理（貼上逐字稿或筆記，整理出重點與建議任務）
• 串接 Google 日曆（唯讀）
• 建立組織並用邀請連結邀請成員

Huddle Pro 為自動續訂訂閱，有月繳與年繳。新訂閱者可能可享 2 週免費試用。確認購買時（或免費試用結束時）會向你的 Apple 帳號收費。除非在本期結束前至少 24 小時取消，訂閱會自動續訂。你可以隨時到 Apple 帳號的「訂閱」設定管理或取消。價格以購買前 App 內顯示為準，可能依國家或地區不同。

使用條款：https://huddle.lazy72.com/terms
隱私權政策：https://huddle.lazy72.com/privacy
```

依據（功能是否存在）：
- 工作區／任務細節／圖片：`components/modals/task-detail-modal.tsx:1374`（任務圖片）、`components/modals/workspace-settings-modal.tsx:202`
- 拖曳排程、專注計時、背景音樂：`lib/timer-bgm.ts:1`、`components/timer/focus-timer-provider.tsx`
- 即時動態／動態島：`ios/App/HuddleWidgets/HuddleWidgets.swift:686`、`ios/App/App/Info.plist`（NSSupportsLiveActivities）
- 主畫面／鎖定畫面小工具：`ios/App/HuddleWidgets/HuddleLockScreen.swift`、`HuddleMonthSticky.swift`
- 記事本、白板：`app/notebook`、`components/scratchpad/scratchpad-canvas.tsx:421`
- 共享行事曆、約時間、App 內會議邀請：`components/marketing/marketing-page.tsx`（英文 more 段落）、`supabase/functions/send-meeting-invitations`（Email 通道停用，只走 App 內）
- Pro 內容：`components/billing/pro-purchase-card.tsx:184`
- 自動續訂說明：`lib/billing/paywall-copy.ts:39`、`:48`

**待老闆確認的文案點**：
1. 「新訂閱者可能可享 2 週免費試用」——試用要等老闆在後台設定 Introductory Offer 後才成立；若送審時尚未設定，要把這句拿掉。
2. Pro 內容五項以購買卡片現行文字為準（`pro-purchase-card.tsx:184`）；若 Pro 範圍有改，兩邊要一起改。
3. 對外文案沒有拿其他產品做比較（遵守「不自稱 Notion 式」規定）。

## 5. App 審查資訊（App Review Information）

| 欄位 | 值 |
|---|---|
| 需要登入 | 是 |
| 使用者名稱／密碼 | **老闆本人在 Supabase 建立審查帳號後填入**（Email＋密碼；不要用自己的帳號） |
| 聯絡人 | 老闆本名、電話、Email（hi@lazy72.com，`lib/legal/operator.ts:11`） |

### 審查備註（Review Notes，英文貼這段）

```
Thank you for reviewing Huddle Planner.

SIGNING IN
Huddle normally uses Sign in with Apple or Google. For review, please use the demo account:
1. On the sign-in screen, tap "Sign in with email" at the bottom.
2. Enter the email and password provided in the Sign-In Information fields.

HUDDLE PRO (IN-APP PURCHASE)
The auto-renewable subscriptions (Huddle Pro monthly / yearly) are in the "Membership & referrals" page:
tap your avatar at the top right > "Membership & referrals". The page shows the plans, prices, trial (if any), auto-renewal terms, "Restore purchases", and links to the Terms of Use and Privacy Policy.
Sandbox purchases made during review unlock Pro on this account for up to 24 hours so you can verify the purchase flow. Pro features: unlimited active tasks and notes, 20 GB image storage, 20 AI meeting summaries per month, Google Calendar connection, and organizations.

ACCOUNT DELETION
Avatar menu > "Delete account", or Settings > "Delete account", then confirm.

BACKGROUND AUDIO
The "audio" background mode is used by the focus timer: the background music and ambient sounds you choose keep playing when you leave the app, and the floating (Picture in Picture) countdown keeps running.

WIDGETS AND LIVE ACTIVITIES
Home Screen and Lock Screen widgets show today's tasks and calendar. When a focus timer is running, a Live Activity shows the countdown on the Lock Screen and in the Dynamic Island.

CAMERA AND PHOTOS
The camera and photo library are used only when the user chooses to add an image to a task, note, whiteboard or workspace, or saves an exported calendar image.

The app does not include an Apple Watch app in this version.
```

依據：Email 入口 `app/(auth)/login/page.tsx:275`（僅原生殼顯示）＋`lib/i18n/dict/app-shell.ts:11`；會員頁入口 `components/user-menu.tsx:219`；購買卡片 `components/operations/membership.tsx:157`；審查沙盒 24 小時 commit 3425bb5（PR #150）；刪帳號 `components/user-menu.tsx:337`、`components/modals/settings-modal.tsx:1093`；背景音訊 commit 57fb80d（`ios/App/App/Info.plist` UIBackgroundModes audio）、`lib/timer-bgm.ts`。

**注意**：審查備註最後一句「這版不含 Apple Watch」要等工程端把 Watch 從 iOS 打包內容移除後才成立（見送審清單第三節新增缺口）。

## 字數驗證（2026-10-03 實算）

用 Python 對本檔實算：宣傳文字與描述算字元數 `len(s)`，關鍵字算 UTF-8 位元組 `len(s.encode())`。
結果：宣傳文字 英 133／繁 43（上限 170）；關鍵字 英 98／繁 97 bytes（上限 100）；描述 英 2,078／繁 792（上限 4,000）。全部在上限內。
改文案後要重算，尤其繁中關鍵字：一個中文字 3 bytes，多加一個詞就會超過。
