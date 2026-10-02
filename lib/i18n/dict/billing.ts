// English dictionary fragment — keys are the Traditional Chinese source strings.
// Scope: Pro limits / free usage caps UI (lib/billing/*, components/billing/*,
// membership usage meters, Google Calendar upgrade prompt).
// Covers components/billing/* (the native iOS Huddle Pro purchase card).
// Prices are never written here: the card only shows what the store returns.
export const dict: Record<string, string> = {
  // lib/billing/plan-errors.ts — limit toasts
  '進行中的任務已達免費版上限。完成或刪除一些舊任務，或看看 Pro 方案，就能繼續新增。':
    "You've reached the free plan's limit for active tasks. Complete or delete a few old ones, or take a look at Pro, to keep adding.",
  '筆記數量已達免費版上限。整理一下舊筆記，或看看 Pro 方案，就能繼續新增。':
    "You've reached the free plan's limit for notes. Tidy up some old notes, or take a look at Pro, to keep adding.",
  '圖片空間已達上限，暫時無法再上傳。刪除一些舊圖片，或看看 Pro 方案取得更多空間。':
    "Your image storage is full, so new uploads are paused. Delete some old images, or take a look at Pro for more space.",
  '這是 Pro 會員功能。': 'This is a Pro feature.',
  '了解 Pro': 'About Pro',
  // components/billing/usage-meters.tsx + membership page
  '目前用量': 'Your usage',
  '超過上限時只會暫停「新增」，已有的資料都能照常查看、編輯與匯出。':
    'Going over a limit only pauses adding new items. Everything you already have stays viewable, editable and exportable.',
  '進行中任務': 'Active tasks',
  '記事本筆記': 'Notebook notes',
  '圖片空間': 'Image storage',
  '本月 AI 會議整理': 'AI meeting summaries this month',
  '{used}・無上限': '{used} · No limit',
  '{used} / {limit}': '{used} / {limit}',
  '快到上限了': 'Getting close to the limit',
  '已達上限，暫時無法再新增': 'Limit reached — adding new items is paused',
  // app/settings/google-calendar/page.tsx
  '串接 Google 日曆是 Pro 會員功能。升級後，Google 日曆上的會議就能顯示在 Huddle。':
    'Connecting Google Calendar is a Pro feature. With Pro, the meetings on your Google Calendar show up in Huddle.',
  // components/billing/pro-purchase-card.tsx — native iOS purchase card
  'Huddle Pro 是自動續訂的訂閱。訂閱期間：進行中任務與筆記不限數量、圖片空間 20 GB、每月 20 次 AI 會議整理、可串接 Google 日曆、可建立組織並用邀請連結邀請成員。任務、行事曆、計時、記事本、白板等個人功能維持免費。':
    'Huddle Pro is an auto-renewing subscription. While subscribed you get unlimited active tasks and notes, 20 GB of image storage, 20 AI meeting summaries a month, Google Calendar connection, and organizations you can invite members to with a link. Personal features — tasks, calendar, timer, notebook and whiteboard — stay free.',
  '選擇方案': 'Choose a plan',
  '月繳': 'Monthly',
  '年繳': 'Yearly',
  '{price}／月': '{price} / month',
  '{price}／年': '{price} / year',
  '每月自動續訂': 'Renews monthly',
  '每年自動續訂': 'Renews yearly',
  '訂閱 · {price}': 'Subscribe · {price}',
  // Free trial (Apple introductory offer). Lengths come from the store; never hard-code 14 days.
  '1 天': '1 day',
  '{count} 天': '{count} days',
  '1 週': '1 week',
  '{count} 週': '{count} weeks',
  '1 個月': '1 month',
  '{count} 個月': '{count} months',
  '1 年': '1 year',
  '{count} 年': '{count} years',
  '前 {length}免費，之後 {price}': 'Free for {length}, then {price}',
  '開始 {length}免費試用': 'Try free for {length}',
  '免費試用 {length}。試用結束後會自動以 {price} 向你的 Apple 帳號扣款並開始訂閱，除非你在試用結束前至少 24 小時取消。之後每期到期前 24 小時內自動續訂。你可以隨時到 Apple ID 的「訂閱」設定管理或取消。':
    'Free for {length}. When the trial ends, your Apple account is charged {price} automatically and the subscription starts, unless you cancel at least 24 hours before the trial ends. After that it renews automatically within 24 hours before each period ends. You can manage or cancel anytime in your Apple ID subscription settings.',
  '等待 App Store 確認…': 'Waiting for the App Store…',
  '正在向 App Store 取得方案…': 'Loading plans from the App Store…',
  '目前無法取得訂閱方案，請確認網路後再試一次。':
    "Couldn't load the subscription plans. Check your connection and try again.",
  '訂閱到期前 24 小時內會自動續訂並向你的 Apple 帳號扣款，除非你在到期前至少 24 小時取消。確認購買時，款項會向你的 Apple 帳號收取。你可以隨時到 Apple ID 的「訂閱」設定管理或取消。':
    'Your subscription renews automatically and your Apple account is charged within 24 hours before the current period ends, unless you cancel at least 24 hours before it ends. Payment is charged to your Apple account when you confirm the purchase. You can manage or cancel anytime in your Apple ID subscription settings.',
  '服務條款': 'Terms of use',
  '隱私權政策': 'Privacy policy',
  '恢復購買': 'Restore purchases',
  '正在恢復購買…': 'Restoring purchases…',
  '管理訂閱': 'Manage subscription',
  '你已訂閱 Huddle Pro，有效至 {date}。要變更方案或取消，請到 Apple 的訂閱管理。':
    "You're subscribed to Huddle Pro, valid until {date}. To change your plan or cancel, use Apple's subscription management.",
  '購買已完成，正在同步': 'Purchase complete — syncing',
  '已找到你的訂閱，正在同步': 'Subscription found — syncing',
  'App Store 已回報完成，正在等伺服器確認。確認後這裡會顯示你的訂閱，通常不到一分鐘。':
    "The App Store reported it as complete. We're waiting for our server to confirm it — your subscription will show here once it does, usually within a minute.",
  '同步比平常久。App Store 已記錄你的購買，稍後會自動生效，這裡也會自動更新；你也可以按「恢復購買」再同步一次。':
    'Syncing is taking longer than usual. The App Store has recorded your purchase; it will take effect automatically a little later and this page will update by itself. You can also tap "Restore purchases" to sync again.',
  '購買沒有完成。如果你看到扣款，請按「恢復購買」。':
    'The purchase did not go through. If you see a charge, tap "Restore purchases".',
  '這筆購買正在等待核准（例如家長同意或付款驗證）。核准後會自動生效，不需要再買一次。':
    "This purchase is waiting for approval (for example a parent's permission or payment verification). It will take effect automatically once approved — no need to buy again.",
  '恢復購買沒有成功，請稍後再試。': "Couldn't restore purchases. Please try again later.",
  '這個 Apple 帳號沒有可恢復的 Huddle Pro 訂閱。': 'This Apple account has no Huddle Pro subscription to restore.',
  'Huddle Pro 已生效。': 'Huddle Pro is now active.',
  '這個 Apple ID 的 Huddle Pro 訂閱已綁定另一個 Huddle 帳號，無法轉移。請登出後改用當初購買時的帳號登入；需要協助請聯絡客服。':
    "This Apple ID's Huddle Pro subscription belongs to another Huddle account and can't be moved. Sign out and sign in with the account you bought it with, or contact support for help.",
}
