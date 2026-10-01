// English dictionary fragment — keys are the Traditional Chinese source strings.
// Covers components/billing/* (the native iOS Huddle Pro purchase card).
// Prices are never written here: the card only shows what the store returns.
export const dict: Record<string, string> = {
  'Huddle Pro 是自動續訂的訂閱。訂閱期間你可以建立組織，用邀請連結邀請成員。任務、行事曆、計時、記事本、白板等個人功能維持免費。':
    'Huddle Pro is an auto-renewing subscription. While subscribed you can create organizations and invite members with a link. Personal features — tasks, calendar, timer, notebook and whiteboard — stay free.',
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
}
