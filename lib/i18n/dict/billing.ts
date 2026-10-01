// English dictionary fragment — keys are the Traditional Chinese source strings.
// Scope: Pro limits / free usage caps UI (lib/billing/*, components/billing/*,
// membership usage meters, Google Calendar upgrade prompt).
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
}
