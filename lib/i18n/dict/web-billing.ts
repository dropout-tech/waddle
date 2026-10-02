// English dictionary fragment for the website subscription (Settings → 訂閱,
// /billing/*). Keys are the Traditional Chinese source strings.
//
// Deliberately NOT merged in lib/i18n/en.ts: lib/billing/web-billing-client.ts
// registers it at runtime, so it only exists in bundles that include the
// web-only billing UI. The Capacitor/iOS export must contain no purchase
// wording (Apple 3.1.1) and `grep -r` over out/ checks exactly that.
export const dict: Record<string, string> = {
  // error codes (docs/billing/2026-10-02-web-billing-contracts.md §1)
  '登入已過期，請重新登入後再試。': 'Your sign-in has expired. Please sign in again and retry.',
  '網站訂閱目前尚未對你的帳號開放。': 'Website subscriptions are not available for your account yet.',
  '這項功能只在網頁版提供。': 'This is only available on the website.',
  '你已經透過 Apple 訂閱 Pro，不需要在網站重複購買。請到 iPhone 的設定管理訂閱。':
    "You already have Pro through Apple, so there's no need to buy it again here. Manage that subscription in your iPhone's Settings.",
  '你已經有進行中的訂閱了，請到「設定」→「訂閱」管理。':
    'You already have an active subscription. Manage it under Settings → Subscription.',
  '這個帳號已經用過免費試用，所以沒辦法再試用一次。你還沒有被扣款；頁面已更新，請確認新的付款內容後，再決定要不要付款。':
    "This account has already used its free trial, so it can't be used again. You have not been charged. The page has been updated; please review the new payment details before deciding whether to pay.",
  '找不到這筆資料，請重新整理頁面後再試。': "We couldn't find that record. Please refresh the page and try again.",
  '這筆付款已超過可退款期限，或已經申請過退款。': 'This payment is past its refund window, or a refund was already requested.',
  '有一筆付款正在處理中，請等幾分鐘再試。': 'A payment is still being processed. Please wait a few minutes and try again.',
  '操作太頻繁了，請稍等一分鐘再試。': "That's too many attempts. Please wait a minute and try again.",
  '付款服務暫時發生問題，請稍後再試。如果你看到銀行有扣款通知，請聯絡客服。':
    'The payment service ran into a problem. Please try again shortly. If you see a charge notice from your bank, please contact support.',
  '送出的資料有誤，請重新整理頁面後再試。': 'Something in the request was invalid. Please refresh the page and try again.',
  '服務暫時無法使用，請稍後再試。': 'The service is temporarily unavailable. Please try again later.',
  '連線失敗，請檢查網路後再試。': 'Connection failed. Please check your network and try again.',
  '付款表單載入失敗，請重新整理頁面，或換一個瀏覽器再試。':
    "The payment form didn't load. Please refresh the page or try another browser.",
  '發生未預期的錯誤，請稍後再試。': 'Something unexpected went wrong. Please try again later.',
  // shared UI
  '先不要': 'Not now',
  '重新載入付款表單': 'Reload payment form',
  '付款表單載入中…': 'Loading payment form…',
  '這個頁面目前不可用。': "This page isn't available right now.",
  // Settings → Subscription
  '訂閱': 'Subscription',
  '讀取訂閱資料中…': 'Loading your subscription…',
  '已收到你的退款申請。我們會盡快處理，並在 15 天內退回原本付款的信用卡。':
    "We've received your refund request. We'll process it soon and return the money to the card you paid with within 15 days.",
  '退款申請已送出，銀行處理後會退回原本付款的信用卡。完成後會寄信通知你。':
    "Your refund request was sent. After the bank processes it, the money returns to the card you paid with. We'll email you when it's done.",
  '已取消續訂，之後不會再扣款。': "Renewal canceled. You won't be charged again.",
  '已恢復續訂。': 'Renewal resumed.',
  '你的 Pro 是透過 Apple 訂閱的，請在 iPhone 的「設定」→「Apple 帳號」→「訂閱項目」管理或取消。':
    'Your Pro comes from an Apple subscription. Manage or cancel it on your iPhone under Settings → Apple Account → Subscriptions.',
  '上一次的訂閱已退款並結束，目前使用基本版。你的資料都還在。':
    'Your last subscription was refunded and has ended; you are on the free plan. Your data is all still here.',
  '上一次的訂閱已經結束，目前使用基本版。你的資料都還在。':
    'Your last subscription has ended; you are on the free plan. Your data is all still here.',
  '開始 Pro 可以先免費試用，試用期內取消不會扣款。': 'You can try Pro free first. Cancel during the trial and you pay nothing.',
  '訂閱 Pro，解除用量上限。': 'Subscribe to Pro to lift the usage limits.',
  '開始免費試用': 'Start free trial',
  '訂閱 Pro': 'Subscribe to Pro',
  '每年': 'every year',
  '每個月': 'every month',
  'Pro 年繳': 'Pro · Yearly',
  'Pro 月繳': 'Pro · Monthly',
  '已取消，{date} 結束': 'Canceled · ends {date}',
  '試用中': 'On trial',
  '付款失敗': 'Payment failed',
  '使用中': 'Active',
  '下次扣款': 'Next charge',
  '{date}・{amount}': '{date} · {amount}',
  '（{unit}自動續訂）': ' (renews {unit})',
  'Pro 可使用到': 'Pro available until',
  '請在這天前補付': 'Please pay by',
  '付款卡片': 'Card',
  '你的銀行需要你本人確認這筆付款。請按「立即付款」完成，這段期間 Pro 照常可以使用。':
    'Your bank needs you to confirm this payment yourself. Tap "Pay now" to finish; Pro keeps working in the meantime.',
  '這一期的扣款沒有成功。請按「立即付款」，或更換信用卡；這段期間 Pro 照常可以使用。':
    "This period's charge didn't go through. Tap \"Pay now\" or change your card; Pro keeps working in the meantime.",
  '已取消續訂，之後不會再扣款。想繼續使用的話可以恢復續訂。':
    "Renewal is canceled and you won't be charged again. You can resume it if you want to keep going.",
  '退款申請處理中，預計 {date} 前退回原本付款的信用卡。':
    'Refund in progress. It should return to the card you paid with by {date}.',
  '要取消續訂嗎？': 'Cancel renewal?',
  '取消後，試用結束時不會扣款。Pro 可以用到 {date}，之後回到免費版，你的資料不會被刪除。':
    "If you cancel, you won't be charged when the trial ends. Pro works until {date}, then you move to the free plan. Your data is not deleted.",
  '取消後不會再扣款。Pro 可以用到 {date}，之後回到免費版，你的資料不會被刪除。':
    "If you cancel, you won't be charged again. Pro works until {date}, then you move to the free plan. Your data is not deleted.",
  '取消後不會再扣款。Pro 可以用到已付費的 {date}，之後回到免費版，你的資料不會被刪除。':
    "If you cancel, you won't be charged again. Pro works until {date}, the end of what you've paid for, then you move to the free plan. Your data is not deleted.",
  '確認取消續訂': 'Yes, cancel renewal',
  '要申請全額退款 {amount} 嗎？': 'Request a full refund of {amount}?',
  '申請後訂閱會停止續訂，退款完成時 Pro 會立刻停止、回到免費版（資料不會被刪除）。款項會退回原本付款的信用卡，我們在收到申請隔天起 15 天內完成。':
    "Renewal stops once you request it, and Pro ends as soon as the refund completes (you move to the free plan; your data is not deleted). The money returns to the card you paid with, within 15 days of the day after we receive your request.",
  '確認申請退款': 'Yes, request refund',
  '立即付款': 'Pay now',
  '更換信用卡': 'Change card',
  '取消續訂': 'Cancel renewal',
  '恢復續訂': 'Resume renewal',
  '這筆 {amount} 的款項在 {deadline} 前，可以申請全額退款。':
    'You can request a full refund of this {amount} payment until {deadline}.',
  '申請退款': 'Request refund',
  '已全額退款': 'Fully refunded',
  '已退款 {amount}': 'Refunded {amount}',
  '已付款': 'Paid',
  '未成功': 'Failed',
  '扣款紀錄': 'Payment history',
  // /billing
  '請先登入 Huddle，再回到這個頁面。': 'Please sign in to Huddle first, then come back to this page.',
  '開始使用 Pro': 'Get Huddle Pro',
  '讀取方案資料中…': 'Loading plans…',
  '前往訂閱設定': 'Go to subscription settings',
  '選擇方案、確認付款內容，再輸入信用卡。': 'Choose a plan, review what you are paying for, then enter your card.',
  '選擇方案': 'Choose a plan',
  '月繳': 'Monthly',
  '年繳': 'Yearly',
  '／月': '/month',
  '／年': '/year',
  '付款前請確認': 'Please confirm before paying',
  '內容：Huddle Pro，進行中任務與記事本筆記沒有數量上限、圖片空間 20GB、AI 會議整理每月 20 次，並可串接 Google 日曆與建立組織。':
    'What you get: Huddle Pro — no limit on active tasks and notebook notes, 20 GB of image storage, 20 AI meeting summaries a month, Google Calendar connection, and creating organizations.',
  '價格：{amount}{unit}，已含稅，沒有其他手續費。只收信用卡，不分期。':
    'Price: {amount}{unit}, tax included, no other fees. Credit card only, no installments.',
  '免費試用 {days} 天，試用期內不收費。試用到 {date} 結束，我們會在 {date} 自動扣款 {amount}。':
    '{days}-day free trial; nothing is charged during the trial. It ends on {date}, and we automatically charge {amount} on {date}.',
  '這個帳號已用過免費試用，所以付款後立即開通，今天就會扣款 {amount}。':
    'This account has already used its free trial, so Pro starts as soon as you pay and {amount} is charged today.',
  '自動續訂：{unit}自動扣款，扣款日為首次扣款日的同一天，直到你取消為止。':
    'Auto-renewal: charged {unit} on the same day as your first charge, until you cancel.',
  '取消方式：登入後到「設定」→「訂閱」按「取消續訂」，線上就能完成。取消後不再扣款，Pro 可使用到已付費（或試用）期間結束。':
    'How to cancel: after signing in, go to Settings → Subscription and tap "Cancel renewal". It takes a minute online. After canceling you are not charged again, and Pro works until the paid (or trial) period ends.',
  '卡號只會輸入在 SHOPLINE Payments 的付款框，Huddle 不會取得或儲存完整卡號。':
    'Your card number is entered only in the SHOPLINE Payments form. Huddle never receives or stores the full number.',
  '未成年人購買前，請先取得法定代理人（例如父母）的同意。':
    'If you are a minor, please get consent from your legal guardian (for example a parent) before buying.',
  '信用卡': 'Credit card',
  '我已閱讀上面的內容，也同意': 'I have read the above and agree to the ',
  '與': ' and ',
  '取消與退款': 'Cancellation & refunds',
  '，並授權以這張卡自動續訂扣款。': ', and I authorize automatic renewal charges to this card.',
  '付款並開通 Pro': 'Pay and start Pro',
  // /billing/return
  '確認付款結果': 'Checking your payment',
  '確認卡片更換結果': 'Checking your card change',
  '查看訂閱': 'View subscription',
  '正在確認結果，請稍候，不要關閉這個頁面…': 'Confirming the result. Please wait and keep this page open…',
  '完成了！免費試用已經開始，Pro 現在就能使用。': 'All set! Your free trial has started and Pro is ready to use.',
  '完成了！Pro 已經開通。': 'All set! Pro is now active.',
  '完成了！已經換成新的信用卡。': 'All set! Your card has been changed.',
  '付款完成，訂閱已經恢復正常。': 'Payment received. Your subscription is back to normal.',
  '這次付款沒有成功，你可以再試一次，或換一張信用卡。': "This payment didn't go through. You can try again or use a different card.",
  '重新付款': 'Pay again',
  '銀行還在處理，需要多一點時間。請稍後再到「設定」→「訂閱」查看結果；如果超過一小時仍沒有開通，請聯絡客服，我們會協助處理。':
    "The bank is still processing this and needs a little longer. Check Settings → Subscription in a while. If Pro isn't active after an hour, please contact support and we'll help.",
  '還在處理中，需要多一點時間。請稍後再到「設定」→「訂閱」查看結果。':
    'Still processing; this needs a little longer. Check Settings → Subscription in a while.',
  // /billing/card
  '目前沒有進行中的訂閱，不需要更換卡片。': "You don't have an active subscription, so there's no card to change.",
  '輸入新的信用卡。綁定成功後，之後的扣款會改用這張卡，舊卡會解除綁定。':
    'Enter your new card. Once it is saved, future charges use it and the old card is removed.',
  '目前使用的卡片：{card}': 'Current card: {card}',
  '儲存新卡片': 'Save new card',
  // /billing/pay
  '目前沒有需要補付的款項。': "There's nothing to pay right now.",
  '這一期的扣款沒有成功。選擇已綁定的卡片，或輸入新的卡片付款；付款期間 Pro 照常可以使用。':
    "This period's charge didn't go through. Choose a saved card or enter a new one; Pro keeps working in the meantime.",
  '這次要付：{amount}': 'Amount due: {amount}',
  '（請在 {date} 前完成）': ' (please pay by {date})',
  '付款 {amount}': 'Pay {amount}',
}
